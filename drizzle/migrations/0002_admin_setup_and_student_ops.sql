create table public.super_admin_setup (
  email text primary key,
  created_at timestamptz not null default now(),
  claimed_at timestamptz
);

alter table public.super_admin_setup enable row level security;
revoke all on public.super_admin_setup from anon, authenticated, public;
grant all on public.super_admin_setup to service_role;

create or replace function public.claim_first_super_admin() returns boolean
language plpgsql security definer set search_path=public as $$
declare
  account_email text := lower(trim(coalesce(auth.jwt()->>'email', '')));
begin
  if auth.uid() is null or account_email = '' then return false; end if;
  if exists(select 1 from public.user_roles where role='super_admin') then return false; end if;
  update public.super_admin_setup
    set claimed_at = now()
    where lower(email) = account_email and claimed_at is null;
  if not found then return false; end if;
  insert into public.user_roles(user_id, role) values (auth.uid(),'super_admin')
    on conflict do nothing;
  insert into public.audit_logs(actor_id, action, entity, entity_id)
    values (auth.uid(),'bootstrap_super_admin','user_roles',auth.uid()::text);
  return true;
end $$;
grant execute on function public.claim_first_super_admin() to authenticated;

create or replace function public.submit_application(p jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  num text;
  rec public.applications;
  v_course uuid;
  v_school uuid;
  v_intake uuid;
begin
  if coalesce(trim(p->>'first_name'),'')='' or coalesce(trim(p->>'last_name'),'')='' then
    raise exception 'First and last name are required';
  end if;
  if length(p->>'first_name')>80 or length(p->>'last_name')>80 or length(coalesce(p->>'middle_name',''))>80 then
    raise exception 'Name too long';
  end if;
  if coalesce(p->>'phone','') !~ '^\+?[0-9 ]{9,15}$' then raise exception 'Invalid phone number'; end if;
  if coalesce(p->>'email','') !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(p->>'email')>255 then
    raise exception 'Invalid email address';
  end if;
  v_course := nullif(p->>'course_id','')::uuid;
  if v_course is null then raise exception 'Please choose a course'; end if;
  select school_id into v_school
    from public.courses
    where id=v_course and published and application_enabled;
  if v_school is null then raise exception 'Selected course is not accepting applications'; end if;
  v_intake := nullif(p->>'intake_id','')::uuid;
  if v_intake is not null and not exists (
    select 1 from public.intakes
    where id=v_intake and is_open
      and (application_deadline is null or application_deadline >= current_date)
  ) then raise exception 'Selected intake is not accepting applications'; end if;

  num := 'PRF-' || to_char(now(),'YYYY') || '-' || lpad(nextval('public.application_seq')::text, 5, '0');
  insert into public.applications(application_number, first_name, middle_name, last_name, date_of_birth, gender, national_id, phone, alt_phone, email,
    county, town, address, highest_qualification, institution_attended, year_completed, kcse_grade, course_id, school_id, intake_id, study_mode,
    previous_training, work_experience, special_requirements, heard_about)
  values (num, trim(p->>'first_name'), nullif(trim(p->>'middle_name'),''), trim(p->>'last_name'), nullif(p->>'date_of_birth','')::date, left(p->>'gender',20),
    left(p->>'national_id',30), trim(p->>'phone'), left(p->>'alt_phone',20), lower(trim(p->>'email')), left(p->>'county',60), left(p->>'town',60), left(p->>'address',300),
    left(p->>'highest_qualification',120), left(p->>'institution_attended',160), nullif(p->>'year_completed','')::int, left(p->>'kcse_grade',4),
    v_course, v_school, v_intake, coalesce(nullif(p->>'study_mode',''),'full_time')::public.study_mode,
    left(p->>'previous_training',1000), left(p->>'work_experience',1000), left(p->>'special_requirements',1000), left(p->>'heard_about',120))
  returning * into rec;
  insert into public.application_status_history(application_id, to_status, note)
    values (rec.id, 'submitted', 'Application submitted online');
  insert into public.email_outbox(to_email, template, subject, payload)
    values (rec.email, 'application_received', 'Your Profia Institute application has been received.',
      jsonb_build_object('name', rec.first_name, 'application_number', rec.application_number));
  return jsonb_build_object('id', rec.id, 'application_number', rec.application_number, 'upload_token', rec.upload_token);
end $$;
grant execute on function public.submit_application(jsonb) to anon, authenticated;

create or replace function public.set_student_status(_student_id uuid, _status text)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.has_any_role(auth.uid(), array['super_admin','academic_admin']::public.app_role[]) then
    raise exception 'Forbidden';
  end if;
  if _status not in ('active','suspended','graduated') then
    raise exception 'Invalid student status';
  end if;
  update public.students set status = _status where id = _student_id;
  if not found then raise exception 'Student not found'; end if;
end $$;
grant execute on function public.set_student_status(uuid,text) to authenticated;
