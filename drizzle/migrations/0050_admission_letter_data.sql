create or replace function public.get_admission_letter_data(
  _student_id uuid,
  _course_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  student_record public.students%rowtype;
  course_title text;
  enrollment_created_at timestamptz;
  enrollment_application_id uuid;
  application_record public.applications%rowtype;
  application_created_at timestamptz;
  application_accepted_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Sign in to view admission letters.';
  end if;

  select * into student_record
  from public.students
  where id = _student_id;

  if not found then
    raise exception 'The student record could not be found.';
  end if;

  if student_record.user_id is distinct from auth.uid()
    and not public.has_any_role(
      auth.uid(),
      array['super_admin', 'admissions_admin', 'academic_admin']::public.app_role[]
    ) then
    raise exception 'You are not allowed to view this admission letter.';
  end if;

  select course.title into course_title
  from public.courses course
  where course.id = _course_id;

  if course_title is null then
    raise exception 'The enrolled course could not be found.';
  end if;

  select enrollment.created_at, enrollment.application_id
    into enrollment_created_at, enrollment_application_id
  from (
    select academic.created_at, academic.application_id
    from public.enrollments academic
    where academic.student_id = _student_id
      and academic.course_id = _course_id
      and academic.status = 'active'
    union all
    select online.created_at, null::uuid as application_id
    from public.online_course_enrollments online
    where online.student_id = _student_id
      and online.course_id = _course_id
      and online.status = 'active'
  ) enrollment
  order by enrollment.created_at desc
  limit 1;

  if enrollment_created_at is null then
    raise exception 'An active enrollment in this course is required for an admission letter.';
  end if;

  select * into application_record
  from public.applications application
  where application.course_id = _course_id
    and application.id = coalesce(
      enrollment_application_id,
      student_record.application_id
    );

  if found then
    application_created_at := application_record.created_at;

    select history.created_at into application_accepted_at
    from public.application_status_history history
    where history.application_id = application_record.id
      and history.to_status = 'accepted'
    order by history.created_at desc
    limit 1;

    if application_accepted_at is null and application_record.status = 'accepted' then
      application_accepted_at := application_record.updated_at;
    end if;

    if application_accepted_at is null then
      select history.created_at into application_accepted_at
      from public.application_status_history history
      where history.application_id = application_record.id
        and history.to_status = 'enrolled'
      order by history.created_at desc
      limit 1;
    end if;
  end if;

  return jsonb_build_object(
    'student_id', student_record.id,
    'course_id', _course_id,
    'course_title', course_title,
    'full_name', concat_ws(
      ' ',
      student_record.first_name,
      student_record.middle_name,
      student_record.last_name
    ),
    'admission_number', student_record.student_number,
    'address', student_record.address,
    'town', student_record.town,
    'county', student_record.county,
    'phone', student_record.phone,
    'national_id', student_record.national_id,
    'application_date', application_created_at,
    'accepted_at', coalesce(
      application_accepted_at,
      application_created_at,
      enrollment_created_at
    ),
    'enrolled_at', enrollment_created_at
  );
end;
$$;

revoke all on function public.get_admission_letter_data(uuid, uuid) from public, anon;
grant execute on function public.get_admission_letter_data(uuid, uuid) to authenticated;

create or replace function public.notify_admission_letter_available()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  student_user_id uuid;
  course_title text;
  notification_body text;
begin
  if new.status <> 'active' or new.application_id is null then
    return new;
  end if;

  if tg_op = 'UPDATE'
    and old.status = 'active'
    and old.application_id is not distinct from new.application_id then
    return new;
  end if;

  select student.user_id, course.title
    into student_user_id, course_title
  from public.students student
  join public.courses course on course.id = new.course_id
  where student.id = new.student_id;

  if student_user_id is null then
    return new;
  end if;

  notification_body := 'Your admission letter for ' || course_title
    || ' is available in Module downloads in your student portal.';

  if not exists (
    select 1
    from public.notifications notification
    where notification.user_id = student_user_id
      and notification.title = 'Admission letter ready'
      and notification.body = notification_body
      and notification.category = 'admission'
  ) then
    insert into public.notifications(user_id, title, body, category)
    values (
      student_user_id,
      'Admission letter ready',
      notification_body,
      'admission'
    );
  end if;

  return new;
end;
$$;
revoke all on function public.notify_admission_letter_available() from public, anon, authenticated;

drop trigger if exists enrollment_admission_letter_notification on public.enrollments;
create trigger enrollment_admission_letter_notification
  after insert or update of status, application_id on public.enrollments
  for each row execute function public.notify_admission_letter_available();

create or replace function public.notify_online_admission_letter_available()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  student_user_id uuid;
  course_title text;
  notification_body text;
begin
  if new.status <> 'active' then
    return new;
  end if;

  select student.user_id, course.title
    into student_user_id, course_title
  from public.students student
  join public.courses course on course.id = new.course_id
  join public.applications application
    on application.id = student.application_id
    and application.course_id = new.course_id
  where student.id = new.student_id;

  if student_user_id is null then
    return new;
  end if;

  notification_body := 'Your admission letter for ' || course_title
    || ' is available in Module downloads in your student portal.';

  if not exists (
    select 1
    from public.notifications notification
    where notification.user_id = student_user_id
      and notification.title = 'Admission letter ready'
      and notification.body = notification_body
      and notification.category = 'admission'
  ) then
    insert into public.notifications(user_id, title, body, category)
    values (
      student_user_id,
      'Admission letter ready',
      notification_body,
      'admission'
    );
  end if;

  return new;
end;
$$;
revoke all on function public.notify_online_admission_letter_available() from public, anon, authenticated;

drop trigger if exists online_enrollment_admission_letter_notification on public.online_course_enrollments;
create trigger online_enrollment_admission_letter_notification
  after insert or update of status on public.online_course_enrollments
  for each row execute function public.notify_online_admission_letter_available();

create or replace function public.notify_linked_student_admission_letters()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  course_record record;
  notification_body text;
begin
  if new.user_id is null
    or (tg_op = 'UPDATE' and old.user_id is not distinct from new.user_id) then
    return new;
  end if;

  for course_record in
    select course.title
    from public.enrollments enrollment
    join public.courses course on course.id = enrollment.course_id
    where enrollment.student_id = new.id
      and enrollment.status = 'active'
      and enrollment.application_id is not null
    union
    select course.title
    from public.online_course_enrollments enrollment
    join public.courses course on course.id = enrollment.course_id
    join public.applications application
      on application.id = new.application_id
      and application.course_id = enrollment.course_id
    where enrollment.student_id = new.id
      and enrollment.status = 'active'
  loop
    notification_body := 'Your admission letter for ' || course_record.title
      || ' is available in Module downloads in your student portal.';

    if not exists (
      select 1
      from public.notifications notification
      where notification.user_id = new.user_id
        and notification.title = 'Admission letter ready'
        and notification.body = notification_body
        and notification.category = 'admission'
    ) then
      insert into public.notifications(user_id, title, body, category)
      values (
        new.user_id,
        'Admission letter ready',
        notification_body,
        'admission'
      );
    end if;
  end loop;

  return new;
end;
$$;
revoke all on function public.notify_linked_student_admission_letters() from public, anon, authenticated;

drop trigger if exists student_linked_admission_letter_notification on public.students;
create trigger student_linked_admission_letter_notification
  after insert or update of user_id on public.students
  for each row execute function public.notify_linked_student_admission_letters();
