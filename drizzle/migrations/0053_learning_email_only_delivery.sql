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
  end loop;
end;
$$;

revoke all on function public.enqueue_unit_learning_notification(
  text, uuid, uuid, uuid, uuid[], text, timestamptz, timestamptz, uuid, numeric, text
) from public, anon, authenticated;
grant execute on function public.enqueue_unit_learning_notification(
  text, uuid, uuid, uuid, uuid[], text, timestamptz, timestamptz, uuid, numeric, text
) to service_role;

create or replace function public.claim_student_learning_notifications(_limit integer default 50)
returns setof public.student_learning_notifications
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'Forbidden';
  end if;
  if _limit is null or _limit < 1 or _limit > 100 then
    raise exception 'Limit must be between 1 and 100';
  end if;

  return query
  with due as (
    select notification.id
    from public.student_learning_notifications notification
    where notification.channel = 'email'
      and notification.attempts < 5
      and notification.next_attempt_at <= now()
      and (
        notification.status in ('pending', 'failed')
        or (
          notification.status = 'sending'
          and notification.updated_at < now() - interval '15 minutes'
        )
      )
    order by notification.created_at
    limit _limit
    for update skip locked
  )
  update public.student_learning_notifications notification
  set status = 'sending',
      attempts = notification.attempts + 1,
      next_attempt_at = now() + interval '5 minutes',
      last_error = null
  from due
  where notification.id = due.id
  returning notification.*;
end;
$$;

revoke all on function public.claim_student_learning_notifications(integer) from public, anon, authenticated;
grant execute on function public.claim_student_learning_notifications(integer) to service_role;
