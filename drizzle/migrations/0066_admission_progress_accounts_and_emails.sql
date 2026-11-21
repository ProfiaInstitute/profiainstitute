create or replace function public.submit_application(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  num text;
  rec public.applications;
  v_course uuid;
  v_level uuid;
  v_school uuid;
  v_intake uuid;
  v_study_mode public.study_mode;
  support_whatsapp text;
begin
  if coalesce(trim(p->>'first_name'), '') = '' or coalesce(trim(p->>'last_name'), '') = '' then
    raise exception 'First and last name are required';
  end if;
  if length(p->>'first_name') > 80 or length(p->>'last_name') > 80 or length(coalesce(p->>'middle_name', '')) > 80 then
    raise exception 'Name too long';
  end if;
  if coalesce(p->>'phone', '') !~ '^\+?[0-9 ]{9,15}$' then raise exception 'Invalid phone number'; end if;
  if coalesce(p->>'email', '') !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(p->>'email') > 255 then
    raise exception 'Invalid email address';
  end if;

  v_course := nullif(p->>'course_id', '')::uuid;
  v_level := nullif(p->>'level_id', '')::uuid;
  if v_course is null then raise exception 'Please choose a course'; end if;
  if v_level is null then raise exception 'Please choose a course level'; end if;
  select c.school_id into v_school
  from public.courses c
  join public.course_levels l on l.course_id = c.id and l.id = v_level and l.published
  where c.id = v_course and c.published and c.application_enabled;
  if v_school is null then raise exception 'Selected course or level is not accepting applications'; end if;

  v_study_mode := coalesce(nullif(p->>'study_mode', ''), 'full_time')::public.study_mode;
  if v_study_mode = 'online' and not exists (
    select 1 from public.courses c where c.id = v_course and c.available_online
  ) then
    raise exception 'Online study is not available for the selected course';
  end if;

  v_intake := nullif(p->>'intake_id', '')::uuid;
  if v_intake is not null and not exists (
    select 1 from public.intakes
    where id = v_intake and is_open
      and (application_deadline is null or application_deadline >= current_date)
  ) then raise exception 'Selected intake is not accepting applications'; end if;

  num := 'PRF-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.application_seq')::text, 5, '0');
  insert into public.applications(
    application_number, first_name, middle_name, last_name, date_of_birth, gender, national_id,
    phone, alt_phone, email, county, town, address, highest_qualification, institution_attended,
    year_completed, kcse_grade, course_id, level_id, school_id, intake_id, study_mode,
    previous_training, work_experience, special_requirements, heard_about
  )
  values (
    num, trim(p->>'first_name'), nullif(trim(p->>'middle_name'), ''), trim(p->>'last_name'),
    nullif(p->>'date_of_birth', '')::date, left(p->>'gender', 20), left(p->>'national_id', 30),
    trim(p->>'phone'), left(p->>'alt_phone', 20), lower(trim(p->>'email')),
    left(p->>'county', 60), left(p->>'town', 60), left(p->>'address', 300),
    left(p->>'highest_qualification', 120), left(p->>'institution_attended', 160),
    nullif(p->>'year_completed', '')::int, left(p->>'kcse_grade', 4),
    v_course, v_level, v_school, v_intake, v_study_mode,
    left(p->>'previous_training', 1000), left(p->>'work_experience', 1000),
    left(p->>'special_requirements', 1000), left(p->>'heard_about', 120)
  )
  returning * into rec;

  insert into public.application_status_history(application_id, to_status, note)
  values (rec.id, 'submitted', 'Application submitted online');

  select coalesce(value->>'whatsapp', '254710221122')
    into support_whatsapp
    from public.site_settings
   where key = 'general';
  support_whatsapp := coalesce(nullif(support_whatsapp, ''), '254710221122');

  insert into public.application_notifications(
    application_id, application_status, channel, recipient, subject, payload
  )
  values (
    rec.id,
    'submitted',
    'email',
    lower(rec.email),
    'Your Profia Institute application has been received.',
    jsonb_build_object(
      'application_id', rec.id,
      'student_name', concat_ws(' ', rec.first_name, rec.middle_name, rec.last_name),
      'application_number', rec.application_number,
      'application_status', 'submitted',
      'email', lower(rec.email),
      'student_portal_url', '/student',
      'school_whatsapp', support_whatsapp,
      'message', 'We have received your application and it is awaiting review.'
    )
  )
  on conflict (application_id, application_status, channel) do nothing;

  return jsonb_build_object(
    'id', rec.id,
    'application_number', rec.application_number,
    'upload_token', rec.upload_token
  );
end;
$$;
revoke all on function public.submit_application(jsonb) from public;
grant execute on function public.submit_application(jsonb) to anon, authenticated;

create or replace function public.applications_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  notification_subject text;
  status_label text;
  status_message text;
  support_whatsapp text;
  notification_payload jsonb;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  insert into public.application_status_history(application_id, from_status, to_status, note, changed_by)
  values (new.id, old.status, new.status, new.admin_message, auth.uid());

  insert into public.audit_logs(actor_id, action, entity, entity_id, details)
  values (
    auth.uid(),
    'application_status_change',
    'applications',
    new.id::text,
    jsonb_build_object('number', new.application_number, 'from', old.status, 'to', new.status)
  );

  status_label := replace(new.status::text, '_', ' ');
  status_message := case new.status
    when 'under_review' then 'Your application is now under review.'
    when 'accepted' then 'Congratulations. Your application has been accepted.'
    when 'rejected' then 'Your application has not been approved at this time.'
    when 'waitlisted' then 'Your application has been placed on the waiting list.'
    when 'more_info_required' then 'Additional information is required for your application.'
    when 'enrolled' then 'Your admission to Profia Institute has been confirmed.'
    else 'Your application status has been updated.'
  end;

  notification_subject := case new.status
    when 'under_review' then 'Your Profia Institute application is under review.'
    when 'accepted' then 'Congratulations. Your application has been accepted.'
    when 'rejected' then 'Update on your Profia Institute application.'
    when 'waitlisted' then 'Update on your Profia Institute application.'
    when 'more_info_required' then 'Additional information is required for your application.'
    when 'enrolled' then 'Your admission to Profia Institute has been confirmed.'
    else 'Your application status has been updated.'
  end;

  select coalesce(value->>'whatsapp', '254710221122')
    into support_whatsapp
    from public.site_settings
   where key = 'general';
  support_whatsapp := coalesce(nullif(support_whatsapp, ''), '254710221122');

  notification_payload := jsonb_build_object(
    'application_id', new.id,
    'student_name', concat_ws(' ', new.first_name, new.middle_name, new.last_name),
    'application_number', new.application_number,
    'application_status', status_label,
    'email', lower(new.email),
    'student_portal_url', '/student',
    'school_whatsapp', support_whatsapp,
    'message', coalesce(nullif(trim(new.admin_message), ''), status_message)
  );

  insert into public.application_notifications(
    application_id, application_status, channel, recipient, subject, payload
  )
  values (
    new.id,
    new.status,
    'email',
    lower(new.email),
    notification_subject,
    notification_payload
  )
  on conflict (application_id, application_status, channel) do nothing;

  if coalesce(trim(new.phone), '') <> '' then
    insert into public.application_notifications(
      application_id, application_status, channel, recipient, subject, payload
    )
    values (
      new.id,
      new.status,
      'whatsapp',
      regexp_replace(new.phone, '[^0-9]', '', 'g'),
      null,
      notification_payload
    )
    on conflict (application_id, application_status, channel) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists t_app_status on public.applications;
create trigger t_app_status after update on public.applications
for each row execute function public.applications_status_change();
