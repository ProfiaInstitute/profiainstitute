create table public.student_learning_notifications (
  id uuid primary key default gen_random_uuid(),
  source_type text not null check (source_type in ('assignment', 'cat')),
  source_id uuid not null,
  student_id uuid not null references public.students(id) on delete cascade,
  channel text not null check (channel in ('email', 'whatsapp')),
  recipient text not null,
  subject text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (source_type, source_id, student_id, channel)
);

create index student_learning_notifications_due_idx
  on public.student_learning_notifications(next_attempt_at, created_at)
  where status in ('pending', 'failed', 'sending');

alter table public.student_learning_notifications enable row level security;
revoke all on public.student_learning_notifications from anon, authenticated;
grant all on public.student_learning_notifications to service_role;

create trigger student_learning_notifications_updated_at
  before update on public.student_learning_notifications
  for each row execute function public.touch_updated_at();

create or replace function public.enqueue_student_learning_notifications()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  source_type text;
  source_id uuid;
  target_course_id uuid;
  content_title text;
  course_title text;
  target_level_ids uuid[];
  opens_at timestamptz;
  closes_at timestamptz;
  notification_subject text;
  student_record record;
  notification_payload jsonb;
begin
  if tg_table_name = 'assignments' then
    if not new.published then
      return new;
    end if;
    if tg_op = 'UPDATE' and old.published then
      return new;
    end if;
    source_type := 'assignment';
    source_id := new.id;
    target_course_id := new.course_id;
    content_title := new.title;
    target_level_ids := new.level_ids;
    closes_at := new.due_date;
    notification_subject := 'New assignment: ' || new.title;
  elsif tg_table_name = 'cat_assessments' then
    source_type := 'cat';
    source_id := new.id;
    target_course_id := new.course_id;
    content_title := new.title;
    target_level_ids := new.level_ids;
    opens_at := new.opens_at;
    closes_at := new.closes_at;
    notification_subject := 'New CAT: ' || new.title;
  else
    raise exception 'Unsupported learning notification source.';
  end if;

  select course.title into course_title
  from public.courses course
  where course.id = target_course_id;
  if course_title is null then
    raise exception 'Cannot notify students: course was not found.';
  end if;

  for student_record in
    select student.id, student.first_name, student.middle_name, student.last_name,
      student.email, student.phone
    from public.students student
    where student.status = 'active'
      and (
        exists (
          select 1
          from public.enrollments enrollment
          where enrollment.student_id = student.id
            and enrollment.course_id = target_course_id
            and enrollment.status = 'active'
            and (
              target_level_ids is null
              or enrollment.level_id = any(target_level_ids)
              or (
                enrollment.level_id is null
                and student.course_id = target_course_id
                and student.level_id = any(target_level_ids)
                and not exists (
                  select 1 from public.enrollments level_enrollment
                  where level_enrollment.student_id = student.id
                    and level_enrollment.course_id = target_course_id
                    and level_enrollment.status = 'active'
                    and level_enrollment.level_id is not null
                )
              )
            )
        )
        or exists (
          select 1
          from public.online_course_enrollments enrollment
          where enrollment.student_id = student.id
            and enrollment.course_id = target_course_id
            and enrollment.status = 'active'
            and (
              target_level_ids is null
              or enrollment.level_id = any(target_level_ids)
              or (
                enrollment.level_id is null
                and student.course_id = target_course_id
                and student.level_id = any(target_level_ids)
                and not exists (
                  select 1 from public.online_course_enrollments level_enrollment
                  where level_enrollment.student_id = student.id
                    and level_enrollment.course_id = target_course_id
                    and level_enrollment.status = 'active'
                    and level_enrollment.level_id is not null
                )
              )
            )
        )
        or (
          student.course_id = target_course_id
          and (
            target_level_ids is null
            or student.level_id = any(target_level_ids)
          )
          and not exists (
            select 1 from public.enrollments enrollment
            where enrollment.student_id = student.id
              and enrollment.course_id = target_course_id
              and enrollment.status = 'active'
          )
          and not exists (
            select 1 from public.online_course_enrollments enrollment
            where enrollment.student_id = student.id
              and enrollment.course_id = target_course_id
              and enrollment.status = 'active'
          )
        )
      )
  loop
    notification_payload := jsonb_build_object(
      'student_name', concat_ws(' ', student_record.first_name, student_record.middle_name, student_record.last_name),
      'student_email', lower(trim(student_record.email)),
      'notification_type', source_type,
      'content_title', content_title,
      'course_title', course_title,
      'opens_at', opens_at,
      'closes_at', closes_at,
      'portal_path', '/student'
    );

    if nullif(trim(student_record.email), '') is not null then
      insert into public.student_learning_notifications(
        source_type, source_id, student_id, channel, recipient, subject, payload
      )
      values (
        source_type, source_id, student_record.id, 'email',
        lower(trim(student_record.email)), notification_subject, notification_payload
      )
      on conflict (source_type, source_id, student_id, channel) do nothing;
    end if;

    if nullif(regexp_replace(coalesce(student_record.phone, ''), '[^0-9]', '', 'g'), '') is not null then
      insert into public.student_learning_notifications(
        source_type, source_id, student_id, channel, recipient, subject, payload
      )
      values (
        source_type, source_id, student_record.id, 'whatsapp',
        regexp_replace(student_record.phone, '[^0-9]', '', 'g'),
        notification_subject, notification_payload
      )
      on conflict (source_type, source_id, student_id, channel) do nothing;
    end if;
  end loop;

  return new;
end;
$$;

create trigger assignments_enqueue_student_notifications
  after insert or update of published on public.assignments
  for each row execute function public.enqueue_student_learning_notifications();

create trigger cats_enqueue_student_notifications
  after insert on public.cat_assessments
  for each row execute function public.enqueue_student_learning_notifications();

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
    where notification.attempts < 5
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

create or replace function public.complete_student_learning_notification(
  _notification_id uuid,
  _sent boolean,
  _error text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
begin
  if auth.role() <> 'service_role' then
    raise exception 'Forbidden';
  end if;
  if _sent is null or (not _sent and coalesce(trim(_error), '') = '') then
    raise exception 'A delivery result and failure reason are required';
  end if;

  update public.student_learning_notifications
  set status = case when _sent then 'sent' else 'failed' end,
      sent_at = case when _sent then now() else null end,
      last_error = case when _sent then null else left(_error, 1000) end,
      next_attempt_at = case
        when _sent then now()
        else now() + make_interval(mins => least(60, 5 * greatest(attempts, 1)))
      end
  where id = _notification_id
    and status = 'sending'
  if not found then
    raise exception 'Sending student learning notification not found';
  end if;
end;
$$;

revoke all on function public.complete_student_learning_notification(uuid, boolean, text)
  from public, anon, authenticated;
grant execute on function public.complete_student_learning_notification(uuid, boolean, text)
  to service_role;
