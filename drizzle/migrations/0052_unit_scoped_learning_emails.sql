alter table public.student_learning_notifications
  drop constraint if exists student_learning_notifications_source_type_check;

alter table public.student_learning_notifications
  add constraint student_learning_notifications_source_type_check
  check (source_type in ('assignment', 'cat', 'cat_open', 'result'));

create or replace function public.enqueue_unit_learning_notification(
  _source_type text,
  _source_id uuid,
  _course_id uuid,
  _unit_id uuid,
  _level_ids uuid[],
  _title text,
  _opens_at timestamptz default null,
  _closes_at timestamptz default null,
  _student_id uuid default null,
  _score numeric default null,
  _grade text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  course_title text;
  unit_title text;
  unit_level_id uuid;
  recipient record;
  notification_payload jsonb;
  notification_subject text;
  notification_channel text;
begin
  if _source_type not in ('assignment', 'cat', 'cat_open', 'result') then
    raise exception 'Unsupported learning notification type.';
  end if;
  if _unit_id is null then
    return;
  end if;

  select course.title, unit.title, unit.level_id
    into course_title, unit_title, unit_level_id
  from public.course_units unit
  join public.courses course on course.id = unit.course_id
  where unit.id = _unit_id
    and unit.course_id = _course_id;
  if not found then
    raise exception 'Cannot notify students: the course unit was not found in its course.';
  end if;

  notification_subject := case _source_type
    when 'assignment' then 'New assignment: ' || _title
    when 'cat' then 'New CAT uploaded: ' || _title
    when 'cat_open' then 'CAT now open: ' || _title
    else 'Results available: ' || unit_title
  end;

  for recipient in
    with active_enrollments as (
      select enrollment.student_id, enrollment.course_id, enrollment.level_id
      from public.enrollments enrollment
      where enrollment.status = 'active'
      union all
      select enrollment.student_id, enrollment.course_id, enrollment.level_id
      from public.online_course_enrollments enrollment
      where enrollment.status = 'active'
    )
    select distinct
      student.id,
      student.first_name,
      student.middle_name,
      student.last_name,
      lower(trim(student.email)) as email,
      regexp_replace(coalesce(student.phone, ''), '[^0-9]', '', 'g') as phone,
      coalesce(
        enrollment.level_id,
        case when student.course_id = _course_id then student.level_id end
      ) as effective_level_id
    from public.students student
    join active_enrollments enrollment
      on enrollment.student_id = student.id
      and enrollment.course_id = _course_id
    where student.status = 'active'
      and (_student_id is null or student.id = _student_id)
      and (
        _level_ids is null
        or coalesce(
          enrollment.level_id,
          case when student.course_id = _course_id then student.level_id end
        ) = any(_level_ids)
      )
      and (
        unit_level_id is null
        or coalesce(
          enrollment.level_id,
          case when student.course_id = _course_id then student.level_id end
        ) = unit_level_id
      )
  loop
    notification_payload := jsonb_build_object(
      'student_name', concat_ws(
        ' ',
        recipient.first_name,
        recipient.middle_name,
        recipient.last_name
      ),
      'notification_type', _source_type,
      'content_title', _title,
      'course_title', course_title,
      'unit_title', unit_title,
      'level_id', recipient.effective_level_id,
      'opens_at', _opens_at,
      'closes_at', _closes_at,
      'score', case when _score is null then null else _score::text end,
      'grade', _grade,
      'portal_path', '/student'
    );

    if recipient.email <> '' then
      insert into public.student_learning_notifications(
        source_type, source_id, student_id, channel, recipient, subject, payload,
        next_attempt_at
      )
      values (
        _source_type,
        _source_id,
        recipient.id,
        'email',
        recipient.email,
        notification_subject,
        notification_payload,
        case when _source_type = 'cat_open'
          then greatest(now(), coalesce(_opens_at, now()))
          else now()
        end
      )
      on conflict (source_type, source_id, student_id, channel) do nothing;
    end if;

    if _source_type in ('assignment', 'cat') and recipient.phone <> '' then
      notification_channel := 'whatsapp';
      insert into public.student_learning_notifications(
        source_type, source_id, student_id, channel, recipient, subject, payload
      )
      values (
        _source_type,
        _source_id,
        recipient.id,
        notification_channel,
        recipient.phone,
        notification_subject,
        notification_payload
      )
      on conflict (source_type, source_id, student_id, channel) do nothing;
    end if;
  end loop;
end;
$$;

revoke all on function public.enqueue_unit_learning_notification(
  text, uuid, uuid, uuid, uuid[], text, timestamptz, timestamptz, uuid, numeric, text
) from public, anon, authenticated;
grant execute on function public.enqueue_unit_learning_notification(
  text, uuid, uuid, uuid, uuid[], text, timestamptz, timestamptz, uuid, numeric, text
) to service_role;

create or replace function public.enqueue_student_learning_notifications()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_table_name = 'assignments' then
    if not new.published then
      return new;
    end if;
    if tg_op = 'UPDATE' then
      if old.published then
        return new;
      end if;
    end if;

    perform public.enqueue_unit_learning_notification(
      'assignment',
      new.id,
      new.course_id,
      new.unit_id,
      new.level_ids,
      new.title,
      null,
      new.due_date
    );
  elsif tg_table_name = 'cat_assessments' then
    perform public.enqueue_unit_learning_notification(
      'cat',
      new.id,
      new.course_id,
      new.unit_id,
      new.level_ids,
      new.title,
      new.opens_at,
      new.closes_at
    );
    perform public.enqueue_unit_learning_notification(
      'cat_open',
      new.id,
      new.course_id,
      new.unit_id,
      new.level_ids,
      new.title,
      new.opens_at,
      new.closes_at
    );
  elsif tg_table_name = 'results' then
    if not new.published then
      return new;
    end if;
    if tg_op = 'UPDATE' then
      if old.published then
        return new;
      end if;
    end if;
    if new.unit_id is null then
      return new;
    end if;

    perform public.enqueue_unit_learning_notification(
      'result',
      new.id,
      (
        select unit.course_id
        from public.course_units unit
        where unit.id = new.unit_id
      ),
      new.unit_id,
      null,
      new.unit_name,
      null,
      null,
      new.student_id,
      new.score,
      new.grade
    );
  else
    raise exception 'Unsupported learning notification source.';
  end if;

  return new;
end;
$$;

drop trigger if exists assignments_enqueue_student_notifications on public.assignments;
create trigger assignments_enqueue_student_notifications
  after insert or update of published on public.assignments
  for each row execute function public.enqueue_student_learning_notifications();

drop trigger if exists cats_enqueue_student_notifications on public.cat_assessments;
create trigger cats_enqueue_student_notifications
  after insert on public.cat_assessments
  for each row execute function public.enqueue_student_learning_notifications();

drop trigger if exists results_enqueue_student_notifications on public.results;
create trigger results_enqueue_student_notifications
  after insert or update of published on public.results
  for each row execute function public.enqueue_student_learning_notifications();
