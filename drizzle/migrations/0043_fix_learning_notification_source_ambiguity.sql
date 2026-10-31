create or replace function public.enqueue_student_learning_notifications()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  notification_source_type text;
  notification_source_id uuid;
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
    notification_source_type := 'assignment';
    notification_source_id := new.id;
    target_course_id := new.course_id;
    content_title := new.title;
    target_level_ids := new.level_ids;
    closes_at := new.due_date;
    notification_subject := 'New assignment: ' || new.title;
  elsif tg_table_name = 'cat_assessments' then
    notification_source_type := 'cat';
    notification_source_id := new.id;
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
      'notification_type', notification_source_type,
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
        notification_source_type, notification_source_id, student_record.id, 'email',
        lower(trim(student_record.email)), notification_subject, notification_payload
      )
      on conflict (source_type, source_id, student_id, channel) do nothing;
    end if;

    if nullif(regexp_replace(coalesce(student_record.phone, ''), '[^0-9]', '', 'g'), '') is not null then
      insert into public.student_learning_notifications(
        source_type, source_id, student_id, channel, recipient, subject, payload
      )
      values (
        notification_source_type, notification_source_id, student_record.id, 'whatsapp',
        regexp_replace(student_record.phone, '[^0-9]', '', 'g'),
        notification_subject, notification_payload
      )
      on conflict (source_type, source_id, student_id, channel) do nothing;
    end if;
  end loop;

  return new;
end;
$$;
