-- Profia Connect bootstrap for a fresh Supabase project.
-- Generated from drizzle/migrations in filename order; apply once in Supabase SQL Editor.
-- This creates schema and storage buckets/policies, but does not copy existing Lovable data or Storage objects.
-- Do not run on a database that already has these Profia migrations applied.

-- ===== 0000_profia_schema.sql =====

create type public.app_role as enum ('super_admin','admissions_admin','academic_admin','content_admin','student');
create type public.application_status as enum ('submitted','under_review','accepted','rejected','waitlisted','more_info_required','enrolled');
create type public.study_mode as enum ('full_time','part_time','online');
create type public.article_status as enum ('draft','published','scheduled');

create or replace function public.touch_updated_at() returns trigger language plpgsql set search_path=public as $$
begin new.updated_at = now(); return new; end $$;

create table public.profiles(
  id uuid primary key, full_name text, email text, phone text, avatar_url text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.user_roles(
  id uuid primary key default gen_random_uuid(), user_id uuid not null, role public.app_role not null,
  created_at timestamptz not null default now(), unique(user_id, role));
grant select, update on public.profiles to authenticated; grant all on public.profiles to service_role;
grant select on public.user_roles to authenticated; grant all on public.user_roles to service_role;
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role) returns boolean
language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.user_roles where user_id=_user_id and role=_role) $$;
create or replace function public.has_any_role(_user_id uuid, _roles public.app_role[]) returns boolean
language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.user_roles where user_id=_user_id and role = any(_roles)) $$;
create or replace function public.is_staff(_user_id uuid) returns boolean
language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.user_roles where user_id=_user_id and role <> 'student') $$;

create policy "own profile read" on public.profiles for select to authenticated using (id = auth.uid() or public.is_staff(auth.uid()));
create policy "own profile update" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy "own roles read" on public.user_roles for select to authenticated using (user_id = auth.uid() or public.has_role(auth.uid(),'super_admin'));
create trigger t_profiles_upd before update on public.profiles for each row execute function public.touch_updated_at();

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.profiles(id, full_name, email) values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''), new.email)
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create table public.audit_logs(
  id uuid primary key default gen_random_uuid(), actor_id uuid, action text not null, entity text, entity_id text,
  details jsonb not null default '{}'::jsonb, created_at timestamptz not null default now());
grant select on public.audit_logs to authenticated; grant all on public.audit_logs to service_role;
alter table public.audit_logs enable row level security;
create policy "super reads audit" on public.audit_logs for select to authenticated using (public.has_role(auth.uid(),'super_admin'));

create or replace function public.log_action(_action text, _entity text, _entity_id text, _details jsonb default '{}'::jsonb) returns void
language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null or not public.is_staff(auth.uid()) then return; end if;
  insert into public.audit_logs(actor_id, action, entity, entity_id, details) values (auth.uid(), left(_action,60), left(_entity,60), left(_entity_id,80), coalesce(_details,'{}'::jsonb));
end $$;
grant execute on function public.log_action(text,text,text,jsonb) to authenticated;

create or replace function public.audit_row() returns trigger language plpgsql security definer set search_path=public as $$
declare j jsonb;
begin
  j := case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  insert into public.audit_logs(actor_id, action, entity, entity_id, details)
  values (auth.uid(), lower(tg_op), tg_table_name, coalesce(j->>'id', j->>'key'),
    case when tg_op='UPDATE' then jsonb_build_object('before', to_jsonb(old), 'after', to_jsonb(new))
         when tg_op='DELETE' then jsonb_build_object('before', to_jsonb(old)) else jsonb_build_object('after', to_jsonb(new)) end);
  return coalesce(new, old);
end $$;

create table public.site_settings(key text primary key, value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(), updated_by uuid);
grant select on public.site_settings to anon, authenticated; grant insert, update, delete on public.site_settings to authenticated; grant all on public.site_settings to service_role;
alter table public.site_settings enable row level security;
create policy "settings public read" on public.site_settings for select to anon, authenticated using (true);
create policy "settings write" on public.site_settings for all to authenticated
  using (public.has_role(auth.uid(),'super_admin') or (public.has_role(auth.uid(),'content_admin') and key like 'content.%'))
  with check (public.has_role(auth.uid(),'super_admin') or (public.has_role(auth.uid(),'content_admin') and key like 'content.%'));
create trigger t_settings_upd before update on public.site_settings for each row execute function public.touch_updated_at();
create trigger a_settings after insert or update or delete on public.site_settings for each row execute function public.audit_row();

create table public.schools(
  id uuid primary key default gen_random_uuid(), slug text unique not null, name text not null, short_name text,
  tagline text, description text, hero_image text, features jsonb not null default '[]'::jsonb,
  online_summary text, online_course_count int, sort_order int not null default 0, published boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.courses(
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete cascade,
  slug text unique not null, title text not null, summary text, description text, duration text, fees numeric(12,2),
  requirements text, image_url text, available_online boolean not null default false,
  published boolean not null default true, sort_order int not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create index on public.courses(school_id);
create table public.course_units(
  id uuid primary key default gen_random_uuid(), course_id uuid not null references public.courses(id) on delete cascade,
  code text, title text not null, semester text, sort_order int not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create index on public.course_units(course_id);
create table public.intakes(
  id uuid primary key default gen_random_uuid(), name text not null, start_date date, end_date date,
  application_deadline date, is_open boolean not null default true, notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.academic_years(
  id uuid primary key default gen_random_uuid(), name text unique not null, is_current boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.faqs(
  id uuid primary key default gen_random_uuid(), school_id uuid references public.schools(id) on delete cascade,
  category text not null default 'Admission', question text not null, answer text not null default '',
  sort_order int not null default 0, published boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());

grant select on public.schools, public.courses, public.course_units, public.intakes, public.academic_years, public.faqs to anon, authenticated;
grant insert, update, delete on public.schools, public.courses, public.course_units, public.intakes, public.academic_years, public.faqs to authenticated;
grant all on public.schools, public.courses, public.course_units, public.intakes, public.academic_years, public.faqs to service_role;
alter table public.schools enable row level security; alter table public.courses enable row level security;
alter table public.course_units enable row level security; alter table public.intakes enable row level security;
alter table public.academic_years enable row level security; alter table public.faqs enable row level security;

create policy "schools read" on public.schools for select to anon, authenticated using (published or public.is_staff(auth.uid()));
create policy "schools write" on public.schools for all to authenticated using (public.has_any_role(auth.uid(), array['super_admin','academic_admin','content_admin']::public.app_role[])) with check (public.has_any_role(auth.uid(), array['super_admin','academic_admin','content_admin']::public.app_role[]));
create policy "courses read" on public.courses for select to anon, authenticated using (published or public.is_staff(auth.uid()));
create policy "courses write" on public.courses for all to authenticated using (public.has_any_role(auth.uid(), array['super_admin','academic_admin']::public.app_role[])) with check (public.has_any_role(auth.uid(), array['super_admin','academic_admin']::public.app_role[]));
create policy "units read" on public.course_units for select to anon, authenticated using (true);
create policy "units write" on public.course_units for all to authenticated using (public.has_any_role(auth.uid(), array['super_admin','academic_admin']::public.app_role[])) with check (public.has_any_role(auth.uid(), array['super_admin','academic_admin']::public.app_role[]));
create policy "intakes read" on public.intakes for select to anon, authenticated using (true);
create policy "intakes write" on public.intakes for all to authenticated using (public.has_any_role(auth.uid(), array['super_admin','admissions_admin','academic_admin']::public.app_role[])) with check (public.has_any_role(auth.uid(), array['super_admin','admissions_admin','academic_admin']::public.app_role[]));
create policy "years read" on public.academic_years for select to anon, authenticated using (true);
create policy "years write" on public.academic_years for all to authenticated using (public.has_any_role(auth.uid(), array['super_admin','academic_admin']::public.app_role[])) with check (public.has_any_role(auth.uid(), array['super_admin','academic_admin']::public.app_role[]));
create policy "faqs read" on public.faqs for select to anon, authenticated using (published or public.is_staff(auth.uid()));
create policy "faqs write" on public.faqs for all to authenticated using (public.has_any_role(auth.uid(), array['super_admin','content_admin']::public.app_role[])) with check (public.has_any_role(auth.uid(), array['super_admin','content_admin']::public.app_role[]));

create trigger t1 before update on public.schools for each row execute function public.touch_updated_at();
create trigger t1 before update on public.courses for each row execute function public.touch_updated_at();
create trigger t1 before update on public.course_units for each row execute function public.touch_updated_at();
create trigger t1 before update on public.intakes for each row execute function public.touch_updated_at();
create trigger t1 before update on public.academic_years for each row execute function public.touch_updated_at();
create trigger t1 before update on public.faqs for each row execute function public.touch_updated_at();
create trigger a1 after insert or update or delete on public.courses for each row execute function public.audit_row();
create trigger a1 after insert or update or delete on public.schools for each row execute function public.audit_row();

create sequence public.application_seq;
create table public.applications(
  id uuid primary key default gen_random_uuid(), application_number text unique not null,
  upload_token uuid not null default gen_random_uuid(),
  first_name text not null, middle_name text, last_name text not null, date_of_birth date, gender text,
  national_id text, phone text not null, alt_phone text, email text not null, county text, town text, address text,
  highest_qualification text, institution_attended text, year_completed int, kcse_grade text,
  course_id uuid references public.courses(id) on delete set null, school_id uuid references public.schools(id) on delete set null,
  intake_id uuid references public.intakes(id) on delete set null,
  study_mode public.study_mode not null default 'full_time',
  previous_training text, work_experience text, special_requirements text, heard_about text,
  status public.application_status not null default 'submitted', admin_message text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create index on public.applications(status); create index on public.applications(created_at desc);
create table public.application_documents(
  id uuid primary key default gen_random_uuid(), application_id uuid not null references public.applications(id) on delete cascade,
  doc_type text not null, file_path text not null, file_name text, created_at timestamptz not null default now());
create table public.application_status_history(
  id uuid primary key default gen_random_uuid(), application_id uuid not null references public.applications(id) on delete cascade,
  from_status public.application_status, to_status public.application_status not null, note text, changed_by uuid,
  created_at timestamptz not null default now());
create table public.application_notes(
  id uuid primary key default gen_random_uuid(), application_id uuid not null references public.applications(id) on delete cascade,
  note text not null, author_id uuid, created_at timestamptz not null default now());

grant select, update, delete on public.applications to authenticated; grant all on public.applications to service_role;
grant select on public.application_documents to authenticated; grant all on public.application_documents to service_role;
grant select on public.application_status_history to authenticated; grant all on public.application_status_history to service_role;
grant select, insert on public.application_notes to authenticated; grant all on public.application_notes to service_role;
alter table public.applications enable row level security; alter table public.application_documents enable row level security;
alter table public.application_status_history enable row level security; alter table public.application_notes enable row level security;
create policy "adm read apps" on public.applications for select to authenticated using (public.has_any_role(auth.uid(), array['super_admin','admissions_admin']::public.app_role[]));
create policy "adm update apps" on public.applications for update to authenticated using (public.has_any_role(auth.uid(), array['super_admin','admissions_admin']::public.app_role[])) with check (public.has_any_role(auth.uid(), array['super_admin','admissions_admin']::public.app_role[]));
create policy "super delete apps" on public.applications for delete to authenticated using (public.has_role(auth.uid(),'super_admin'));
create policy "adm read docs" on public.application_documents for select to authenticated using (public.has_any_role(auth.uid(), array['super_admin','admissions_admin']::public.app_role[]));
create policy "adm read hist" on public.application_status_history for select to authenticated using (public.has_any_role(auth.uid(), array['super_admin','admissions_admin']::public.app_role[]));
create policy "adm notes read" on public.application_notes for select to authenticated using (public.has_any_role(auth.uid(), array['super_admin','admissions_admin']::public.app_role[]));
create policy "adm notes add" on public.application_notes for insert to authenticated with check (author_id = auth.uid() and public.has_any_role(auth.uid(), array['super_admin','admissions_admin']::public.app_role[]));
create trigger t1 before update on public.applications for each row execute function public.touch_updated_at();

create table public.email_outbox(
  id uuid primary key default gen_random_uuid(), to_email text not null, template text not null, subject text not null,
  payload jsonb not null default '{}'::jsonb, status text not null default 'pending', error text,
  created_at timestamptz not null default now(), sent_at timestamptz);
grant select on public.email_outbox to authenticated; grant all on public.email_outbox to service_role;
alter table public.email_outbox enable row level security;
create policy "staff reads outbox" on public.email_outbox for select to authenticated using (public.has_any_role(auth.uid(), array['super_admin','admissions_admin']::public.app_role[]));

create or replace function public.applications_status_change() returns trigger language plpgsql security definer set search_path=public as $$
declare subj text; tmpl text;
begin
  if new.status is distinct from old.status then
    insert into public.application_status_history(application_id, from_status, to_status, note, changed_by)
      values (new.id, old.status, new.status, new.admin_message, auth.uid());
    insert into public.audit_logs(actor_id, action, entity, entity_id, details)
      values (auth.uid(), 'application_status_change', 'applications', new.id::text, jsonb_build_object('number', new.application_number, 'from', old.status, 'to', new.status));
    tmpl := case new.status when 'accepted' then 'application_accepted' when 'more_info_required' then 'application_more_info' when 'enrolled' then 'admission_confirmed' else null end;
    subj := case new.status when 'accepted' then 'Congratulations. Your application has been accepted.'
                            when 'more_info_required' then 'Additional information is required for your application.'
                            when 'enrolled' then 'Your admission to Profia Institute has been confirmed.' else null end;
    if tmpl is not null then
      insert into public.email_outbox(to_email, template, subject, payload)
      values (new.email, tmpl, subj, jsonb_build_object('name', new.first_name, 'application_number', new.application_number, 'message', new.admin_message));
    end if;
  end if;
  return new;
end $$;
create trigger t_app_status after update on public.applications for each row execute function public.applications_status_change();

create or replace function public.submit_application(p jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare num text; rec public.applications; v_course uuid; v_school uuid;
begin
  if coalesce(trim(p->>'first_name'),'')='' or coalesce(trim(p->>'last_name'),'')='' then raise exception 'First and last name are required'; end if;
  if length(p->>'first_name')>80 or length(p->>'last_name')>80 or length(coalesce(p->>'middle_name',''))>80 then raise exception 'Name too long'; end if;
  if coalesce(p->>'phone','') !~ '^\+?[0-9 ]{9,15}$' then raise exception 'Invalid phone number'; end if;
  if coalesce(p->>'email','') !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(p->>'email')>255 then raise exception 'Invalid email address'; end if;
  v_course := nullif(p->>'course_id','')::uuid;
  if v_course is null then raise exception 'Please choose a course'; end if;
  select school_id into v_school from public.courses where id = v_course and published;
  if v_school is null then raise exception 'Selected course is not available'; end if;
  num := 'PRF-' || to_char(now(),'YYYY') || '-' || lpad(nextval('public.application_seq')::text, 5, '0');
  insert into public.applications(application_number, first_name, middle_name, last_name, date_of_birth, gender, national_id, phone, alt_phone, email,
    county, town, address, highest_qualification, institution_attended, year_completed, kcse_grade, course_id, school_id, intake_id, study_mode,
    previous_training, work_experience, special_requirements, heard_about)
  values (num, trim(p->>'first_name'), nullif(trim(p->>'middle_name'),''), trim(p->>'last_name'), nullif(p->>'date_of_birth','')::date, left(p->>'gender',20),
    left(p->>'national_id',30), trim(p->>'phone'), left(p->>'alt_phone',20), lower(trim(p->>'email')), left(p->>'county',60), left(p->>'town',60), left(p->>'address',300),
    left(p->>'highest_qualification',120), left(p->>'institution_attended',160), nullif(p->>'year_completed','')::int, left(p->>'kcse_grade',4),
    v_course, v_school, nullif(p->>'intake_id','')::uuid, coalesce(nullif(p->>'study_mode',''),'full_time')::public.study_mode,
    left(p->>'previous_training',1000), left(p->>'work_experience',1000), left(p->>'special_requirements',1000), left(p->>'heard_about',120))
  returning * into rec;
  insert into public.application_status_history(application_id, to_status, note) values (rec.id, 'submitted', 'Application submitted online');
  insert into public.email_outbox(to_email, template, subject, payload)
    values (rec.email, 'application_received', 'Your Profia Institute application has been received.', jsonb_build_object('name', rec.first_name, 'application_number', rec.application_number));
  return jsonb_build_object('id', rec.id, 'application_number', rec.application_number, 'upload_token', rec.upload_token);
end $$;
grant execute on function public.submit_application(jsonb) to anon, authenticated;

create or replace function public.attach_application_document(_application_id uuid, _token uuid, _doc_type text, _file_path text, _file_name text) returns void
language plpgsql security definer set search_path=public as $$
begin
  if not exists(select 1 from public.applications where id=_application_id and upload_token=_token and created_at > now() - interval '2 hours') then
    raise exception 'Not allowed'; end if;
  if _file_path not like _application_id::text || '/%' then raise exception 'Invalid path'; end if;
  insert into public.application_documents(application_id, doc_type, file_path, file_name) values (_application_id, left(_doc_type,40), _file_path, left(_file_name,200));
end $$;
grant execute on function public.attach_application_document(uuid, uuid, text, text, text) to anon, authenticated;

create or replace function public.check_application_status(_number text, _contact text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare r record;
begin
  select a.application_number, a.status, a.created_at, a.admin_message, a.study_mode, c.title as course, i.name as intake, a.first_name
    into r from public.applications a left join public.courses c on c.id=a.course_id left join public.intakes i on i.id=a.intake_id
   where upper(a.application_number)=upper(trim(_number))
     and (lower(a.email)=lower(trim(_contact)) or (length(regexp_replace(_contact,'\D','','g'))>=9 and regexp_replace(a.phone,'\D','','g') = regexp_replace(_contact,'\D','','g')));
  if not found then return null; end if;
  return to_jsonb(r);
end $$;
grant execute on function public.check_application_status(text, text) to anon, authenticated;

create sequence public.student_seq;
create table public.students(
  id uuid primary key default gen_random_uuid(), user_id uuid unique, student_number text unique not null,
  application_id uuid references public.applications(id) on delete set null,
  first_name text not null, middle_name text, last_name text not null, email text not null, phone text, alt_phone text,
  national_id text, date_of_birth date, gender text, county text, town text, address text,
  course_id uuid references public.courses(id) on delete set null, intake_id uuid references public.intakes(id) on delete set null,
  study_mode public.study_mode not null default 'full_time', current_semester text, status text not null default 'active',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create index on public.students(lower(email));
create table public.enrollments(
  id uuid primary key default gen_random_uuid(), student_id uuid not null references public.students(id) on delete cascade,
  application_id uuid unique references public.applications(id) on delete set null,
  course_id uuid not null references public.courses(id) on delete cascade, intake_id uuid references public.intakes(id) on delete set null,
  academic_year text, status text not null default 'active', progress int not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
grant select, insert, update, delete on public.students, public.enrollments to authenticated; grant all on public.students, public.enrollments to service_role;
alter table public.students enable row level security; alter table public.enrollments enable row level security;

create or replace function public.my_student_id() returns uuid language sql stable security definer set search_path=public as $$
  select id from public.students where user_id = auth.uid() limit 1 $$;
create or replace function public.my_course_id() returns uuid language sql stable security definer set search_path=public as $$
  select course_id from public.students where user_id = auth.uid() limit 1 $$;

create policy "student own read" on public.students for select to authenticated using (user_id = auth.uid() or public.has_any_role(auth.uid(), array['super_admin','academic_admin','admissions_admin']::public.app_role[]));
create policy "staff manage students" on public.students for all to authenticated using (public.has_any_role(auth.uid(), array['super_admin','academic_admin']::public.app_role[])) with check (public.has_any_role(auth.uid(), array['super_admin','academic_admin']::public.app_role[]));
create policy "enroll own read" on public.enrollments for select to authenticated using (student_id = public.my_student_id() or public.has_any_role(auth.uid(), array['super_admin','academic_admin','admissions_admin']::public.app_role[]));
create policy "enroll staff" on public.enrollments for all to authenticated using (public.has_any_role(auth.uid(), array['super_admin','academic_admin']::public.app_role[])) with check (public.has_any_role(auth.uid(), array['super_admin','academic_admin']::public.app_role[]));
create trigger t1 before update on public.students for each row execute function public.touch_updated_at();
create trigger t1 before update on public.enrollments for each row execute function public.touch_updated_at();
create trigger a1 after insert or update or delete on public.students for each row execute function public.audit_row();

create or replace function public.next_student_number() returns text language sql security definer set search_path=public as $$
  select 'PRF/' || to_char(now(),'YYYY') || '/' || lpad(nextval('public.student_seq')::text, 4, '0') $$;
create or replace function public.set_student_number() returns trigger language plpgsql security definer set search_path=public as $$
begin if new.student_number is null or new.student_number='' then new.student_number := public.next_student_number(); end if; return new; end $$;
create trigger s_num before insert on public.students for each row execute function public.set_student_number();

create or replace function public.enroll_application(_application_id uuid) returns uuid
language plpgsql security definer set search_path=public as $$
declare a public.applications; sid uuid; email_matches int; enrollment_id uuid;
begin
  if not public.has_any_role(auth.uid(), array['super_admin','admissions_admin','academic_admin']::public.app_role[]) then raise exception 'Forbidden'; end if;
  select * into a from public.applications where id=_application_id for update;
  if not found then raise exception 'Not found'; end if;
  perform pg_advisory_xact_lock(hashtext(lower(a.email)));

  select id into sid from public.students where application_id = a.id for update;
  if sid is null then
    select count(*) into email_matches
      from public.students where lower(email) = lower(a.email);
    if email_matches > 1 then
      raise exception 'Multiple student records match this application email. Resolve the duplicate records before enrollment.';
    elsif email_matches = 1 then
      select id into sid from public.students
       where lower(email) = lower(a.email) for update;
    end if;
  end if;

  if sid is null then
    insert into public.students(student_number, application_id, first_name, middle_name, last_name, email, phone, alt_phone, national_id, date_of_birth, gender, county, town, address, course_id, intake_id, study_mode, current_semester)
    values (public.next_student_number(), a.id, a.first_name, a.middle_name, a.last_name, a.email, a.phone, a.alt_phone, a.national_id, a.date_of_birth, a.gender, a.county, a.town, a.address, a.course_id, a.intake_id, a.study_mode, 'Semester 1')
    returning id into sid;
  else
    update public.students set
      application_id = coalesce(application_id, a.id),
      first_name = a.first_name,
      middle_name = coalesce(a.middle_name, middle_name),
      last_name = a.last_name,
      phone = a.phone,
      alt_phone = coalesce(a.alt_phone, alt_phone),
      national_id = coalesce(a.national_id, national_id),
      date_of_birth = coalesce(a.date_of_birth, date_of_birth),
      gender = coalesce(a.gender, gender),
      county = coalesce(a.county, county),
      town = coalesce(a.town, town),
      address = coalesce(a.address, address),
      course_id = coalesce(a.course_id, course_id),
      intake_id = coalesce(a.intake_id, intake_id),
      study_mode = a.study_mode,
      current_semester = coalesce(current_semester, 'Semester 1')
    where id = sid;
  end if;

  if a.course_id is not null then
    select id into enrollment_id
      from public.enrollments
     where application_id = a.id
     order by created_at desc, id desc
     limit 1 for update;
    if enrollment_id is null then
      select id into enrollment_id
        from public.enrollments
       where student_id = sid
         and course_id = a.course_id
         and intake_id is not distinct from a.intake_id
         and status = 'active'
         and application_id is null
       order by created_at desc, id desc
       limit 1 for update;
    end if;
    if enrollment_id is null then
      insert into public.enrollments(student_id, application_id, course_id, intake_id)
      values (sid, a.id, a.course_id, a.intake_id);
    else
      update public.enrollments set application_id = a.id
       where id = enrollment_id and application_id is null;
    end if;
  end if;

  update public.applications set status='enrolled' where id=a.id and status <> 'enrolled';
  return sid;
end $$;
grant execute on function public.enroll_application(uuid) to authenticated;

create or replace function public.claim_student_record() returns uuid
language plpgsql security definer set search_path=public as $$
declare em text; confirmed timestamptz; sid uuid;
begin
  if auth.uid() is null then return null; end if;
  select id into sid from public.students where user_id = auth.uid(); if sid is not null then return sid; end if;
  select email, email_confirmed_at into em, confirmed from auth.users where id = auth.uid();
  if confirmed is null then return null; end if;
  update public.students set user_id = auth.uid() where id = (select id from public.students where lower(email)=lower(em) and user_id is null order by created_at limit 1) returning id into sid;
  if sid is not null then insert into public.user_roles(user_id, role) values (auth.uid(),'student') on conflict do nothing; end if;
  return sid;
end $$;
grant execute on function public.claim_student_record() to authenticated;

create or replace function public.update_my_contact(_phone text, _alt_phone text, _town text, _address text) returns void
language plpgsql security definer set search_path=public as $$
begin
  if _phone is not null and _phone !~ '^\+?[0-9 ]{9,15}$' then raise exception 'Invalid phone'; end if;
  update public.students set phone=coalesce(_phone, phone), alt_phone=left(_alt_phone,20), town=left(_town,60), address=left(_address,300) where user_id=auth.uid();
end $$;
grant execute on function public.update_my_contact(text,text,text,text) to authenticated;

create table public.results(
  id uuid primary key default gen_random_uuid(), student_id uuid not null references public.students(id) on delete cascade,
  unit_id uuid references public.course_units(id) on delete set null, unit_name text not null, score numeric(5,2), grade text,
  semester text, academic_year text, published boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.fees(
  id uuid primary key default gen_random_uuid(), student_id uuid not null references public.students(id) on delete cascade,
  description text not null, amount numeric(12,2) not null check (amount >= 0), academic_year text, due_date date,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.payments(
  id uuid primary key default gen_random_uuid(), student_id uuid not null references public.students(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0), method text not null default 'manual', provider text, reference text,
  status text not null default 'confirmed', paid_at timestamptz not null default now(), recorded_by uuid, raw jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
grant select, insert, update, delete on public.results, public.fees, public.payments to authenticated; grant all on public.results, public.fees, public.payments to service_role;
alter table public.results enable row level security; alter table public.fees enable row level security; alter table public.payments enable row level security;
create policy "results own" on public.results for select to authenticated using ((student_id = public.my_student_id() and published) or public.has_any_role(auth.uid(), array['super_admin','academic_admin']::public.app_role[]));
create policy "results staff" on public.results for all to authenticated using (public.has_any_role(auth.uid(), array['super_admin','academic_admin']::public.app_role[])) with check (public.has_any_role(auth.uid(), array['super_admin','academic_admin']::public.app_role[]));
create policy "fees own" on public.fees for select to authenticated using (student_id = public.my_student_id() or public.has_role(auth.uid(),'super_admin'));
create policy "fees super" on public.fees for all to authenticated using (public.has_role(auth.uid(),'super_admin')) with check (public.has_role(auth.uid(),'super_admin'));
create policy "pay own" on public.payments for select to authenticated using (student_id = public.my_student_id() or public.has_role(auth.uid(),'super_admin'));
create policy "pay super" on public.payments for all to authenticated using (public.has_role(auth.uid(),'super_admin')) with check (public.has_role(auth.uid(),'super_admin'));
create trigger t1 before update on public.results for each row execute function public.touch_updated_at();
create trigger t1 before update on public.fees for each row execute function public.touch_updated_at();
create trigger t1 before update on public.payments for each row execute function public.touch_updated_at();
create trigger a1 after insert or update or delete on public.results for each row execute function public.audit_row();
create trigger a1 after insert or update or delete on public.fees for each row execute function public.audit_row();
create trigger a1 after insert or update or delete on public.payments for each row execute function public.audit_row();

create table public.learning_materials(
  id uuid primary key default gen_random_uuid(), course_id uuid not null references public.courses(id) on delete cascade,
  unit_id uuid references public.course_units(id) on delete set null, title text not null, description text,
  material_type text not null default 'notes', file_path text, external_url text, published boolean not null default true, uploaded_by uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.assignments(
  id uuid primary key default gen_random_uuid(), course_id uuid not null references public.courses(id) on delete cascade,
  unit_id uuid references public.course_units(id) on delete set null, title text not null, instructions text, due_date timestamptz,
  file_path text, published boolean not null default true, created_by uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.submissions(
  id uuid primary key default gen_random_uuid(), assignment_id uuid not null references public.assignments(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade, file_path text, comment text,
  status text not null default 'submitted', grade text, feedback text, submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(assignment_id, student_id));
grant select, insert, update, delete on public.learning_materials, public.assignments, public.submissions to authenticated; grant all on public.learning_materials, public.assignments, public.submissions to service_role;
alter table public.learning_materials enable row level security; alter table public.assignments enable row level security; alter table public.submissions enable row level security;
create policy "materials read" on public.learning_materials for select to authenticated using ((published and course_id = public.my_course_id()) or public.has_any_role(auth.uid(), array['super_admin','academic_admin']::public.app_role[]));
create policy "materials staff" on public.learning_materials for all to authenticated using (public.has_any_role(auth.uid(), array['super_admin','academic_admin']::public.app_role[])) with check (public.has_any_role(auth.uid(), array['super_admin','academic_admin']::public.app_role[]));
create policy "assign read" on public.assignments for select to authenticated using ((published and course_id = public.my_course_id()) or public.has_any_role(auth.uid(), array['super_admin','academic_admin']::public.app_role[]));
create policy "assign staff" on public.assignments for all to authenticated using (public.has_any_role(auth.uid(), array['super_admin','academic_admin']::public.app_role[])) with check (public.has_any_role(auth.uid(), array['super_admin','academic_admin']::public.app_role[]));
create policy "subs own read" on public.submissions for select to authenticated using (student_id = public.my_student_id() or public.has_any_role(auth.uid(), array['super_admin','academic_admin']::public.app_role[]));
create policy "subs own insert" on public.submissions for insert to authenticated with check (student_id = public.my_student_id() and status='submitted' and grade is null);
create policy "subs own update" on public.submissions for update to authenticated using (student_id = public.my_student_id() and grade is null) with check (student_id = public.my_student_id() and grade is null and status='submitted');
create policy "subs staff" on public.submissions for all to authenticated using (public.has_any_role(auth.uid(), array['super_admin','academic_admin']::public.app_role[])) with check (public.has_any_role(auth.uid(), array['super_admin','academic_admin']::public.app_role[]));
create trigger t1 before update on public.learning_materials for each row execute function public.touch_updated_at();
create trigger t1 before update on public.assignments for each row execute function public.touch_updated_at();
create trigger t1 before update on public.submissions for each row execute function public.touch_updated_at();

create table public.announcements(
  id uuid primary key default gen_random_uuid(), title text not null, body text not null default '',
  category text not null default 'general', show_on_homepage boolean not null default false, show_to_students boolean not null default true,
  show_public boolean not null default true, published boolean not null default false, starts_at timestamptz, ends_at timestamptz, created_by uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.notifications(
  id uuid primary key default gen_random_uuid(), user_id uuid not null, title text not null, body text, category text not null default 'general',
  read boolean not null default false, created_at timestamptz not null default now());
grant select on public.announcements to anon, authenticated; grant insert, update, delete on public.announcements to authenticated; grant all on public.announcements to service_role;
grant select, insert, update, delete on public.notifications to authenticated; grant all on public.notifications to service_role;
alter table public.announcements enable row level security; alter table public.notifications enable row level security;
create policy "ann public" on public.announcements for select to anon, authenticated using (published or public.is_staff(auth.uid()));
create policy "ann students" on public.announcements for select to authenticated using (published and show_to_students and public.my_student_id() is not null);
create policy "ann write" on public.announcements for all to authenticated using (public.has_any_role(auth.uid(), array['super_admin']::public.app_role[])) with check (public.has_any_role(auth.uid(), array['super_admin']::public.app_role[]));
create policy "notif own" on public.notifications for select to authenticated using (user_id = auth.uid());
create policy "notif own read flag" on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "notif staff send" on public.notifications for insert to authenticated with check (public.is_staff(auth.uid()));
create trigger t1 before update on public.announcements for each row execute function public.touch_updated_at();

create or replace function public.notify_result() returns trigger language plpgsql security definer set search_path=public as $$
declare uid uuid;
begin
  if new.published and (tg_op='INSERT' or not old.published) then
    select user_id into uid from public.students where id=new.student_id;
    if uid is not null then insert into public.notifications(user_id, title, body, category) values (uid, 'New result published', new.unit_name || ' — ' || coalesce(new.grade,''), 'results'); end if;
  end if; return new;
end $$;
create trigger n_result after insert or update on public.results for each row execute function public.notify_result();

create table public.article_categories(id uuid primary key default gen_random_uuid(), name text not null, slug text unique not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.articles(
  id uuid primary key default gen_random_uuid(), slug text unique not null, title text not null, excerpt text, content text not null default '',
  featured_image text, og_image text, author text, category_id uuid references public.article_categories(id) on delete set null,
  tags text[] not null default '{}', status public.article_status not null default 'draft', published_at timestamptz,
  meta_title text, meta_description text, created_by uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create index on public.articles(status, published_at desc);
grant select on public.articles, public.article_categories to anon, authenticated; grant insert, update, delete on public.articles, public.article_categories to authenticated; grant all on public.articles, public.article_categories to service_role;
alter table public.articles enable row level security; alter table public.article_categories enable row level security;
create policy "art public" on public.articles for select to anon, authenticated using ((status = 'published' or (status = 'scheduled' and published_at <= now())) or public.has_any_role(auth.uid(), array['super_admin','content_admin']::public.app_role[]));
create policy "art write" on public.articles for all to authenticated using (public.has_any_role(auth.uid(), array['super_admin','content_admin']::public.app_role[])) with check (public.has_any_role(auth.uid(), array['super_admin','content_admin']::public.app_role[]));
create policy "cat public" on public.article_categories for select to anon, authenticated using (true);
create policy "cat write" on public.article_categories for all to authenticated using (public.has_any_role(auth.uid(), array['super_admin','content_admin']::public.app_role[])) with check (public.has_any_role(auth.uid(), array['super_admin','content_admin']::public.app_role[]));
create trigger t1 before update on public.articles for each row execute function public.touch_updated_at();
create trigger t1 before update on public.article_categories for each row execute function public.touch_updated_at();
create trigger a1 after insert or update or delete on public.articles for each row execute function public.audit_row();

create table public.media(
  id uuid primary key default gen_random_uuid(), url text not null, file_path text, category text not null default 'homepage',
  slot text, caption text, alt text, sort_order int not null default 0, published boolean not null default true, uploaded_by uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create index on public.media(category, sort_order);
grant select on public.media to anon, authenticated; grant insert, update, delete on public.media to authenticated; grant all on public.media to service_role;
alter table public.media enable row level security;
create policy "media public" on public.media for select to anon, authenticated using (published or public.is_staff(auth.uid()));
create policy "media write" on public.media for all to authenticated using (public.has_any_role(auth.uid(), array['super_admin','content_admin']::public.app_role[])) with check (public.has_any_role(auth.uid(), array['super_admin','content_admin']::public.app_role[]));
create trigger t1 before update on public.media for each row execute function public.touch_updated_at();
create trigger a1 after insert or delete on public.media for each row execute function public.audit_row();

create table public.contact_messages(
  id uuid primary key default gen_random_uuid(), name text not null, email text, phone text, subject text, message text not null,
  status text not null default 'new', created_at timestamptz not null default now(), updated_at timestamptz not null default now());
grant insert on public.contact_messages to anon, authenticated; grant select, update, delete on public.contact_messages to authenticated; grant all on public.contact_messages to service_role;
alter table public.contact_messages enable row level security;
create policy "contact submit" on public.contact_messages for insert to anon, authenticated with check (status='new' and length(name) between 1 and 100 and length(message) between 1 and 2000 and coalesce(length(email),0) <= 255 and coalesce(length(phone),0) <= 20);
create policy "contact staff" on public.contact_messages for select to authenticated using (public.has_any_role(auth.uid(), array['super_admin','admissions_admin']::public.app_role[]));
create policy "contact staff upd" on public.contact_messages for update to authenticated using (public.has_any_role(auth.uid(), array['super_admin','admissions_admin']::public.app_role[]));
create policy "contact staff del" on public.contact_messages for delete to authenticated using (public.has_role(auth.uid(),'super_admin'));
create trigger t1 before update on public.contact_messages for each row execute function public.touch_updated_at();

create or replace function public.claim_first_super_admin() returns boolean language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null then return false; end if;
  if exists(select 1 from public.user_roles where role='super_admin') then return false; end if;
  insert into public.user_roles(user_id, role) values (auth.uid(),'super_admin');
  insert into public.audit_logs(actor_id, action, entity) values (auth.uid(),'bootstrap_super_admin','user_roles');
  return true;
end $$;
grant execute on function public.claim_first_super_admin() to authenticated;
create or replace function public.super_admin_exists() returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.user_roles where role='super_admin') $$;
grant execute on function public.super_admin_exists() to anon, authenticated;

create or replace function public.set_role_by_email(_email text, _role public.app_role, _grant boolean) returns void
language plpgsql security definer set search_path=public as $$
declare uid uuid;
begin
  if not public.has_role(auth.uid(),'super_admin') then raise exception 'Forbidden'; end if;
  select id into uid from auth.users where lower(email)=lower(trim(_email));
  if uid is null then raise exception 'No account with that email. Ask them to create an account first.'; end if;
  if _grant then insert into public.user_roles(user_id, role) values (uid, _role) on conflict do nothing;
  else
    if uid = auth.uid() and _role='super_admin' then raise exception 'You cannot remove your own super admin role'; end if;
    delete from public.user_roles where user_id=uid and role=_role; end if;
  insert into public.audit_logs(actor_id, action, entity, entity_id, details) values (auth.uid(), case when _grant then 'grant_role' else 'revoke_role' end, 'user_roles', uid::text, jsonb_build_object('email', _email, 'role', _role));
end $$;
grant execute on function public.set_role_by_email(text, public.app_role, boolean) to authenticated;

create or replace function public.list_staff() returns table(user_id uuid, email text, full_name text, roles public.app_role[])
language sql stable security definer set search_path=public as $$
  select r.user_id, p.email, p.full_name, array_agg(r.role) from public.user_roles r left join public.profiles p on p.id=r.user_id
  where public.has_role(auth.uid(),'super_admin') and r.role <> 'student' group by r.user_id, p.email, p.full_name $$;
grant execute on function public.list_staff() to authenticated;

create policy "media obj read" on storage.objects for select to anon, authenticated using (bucket_id='media');
create policy "media obj write" on storage.objects for insert to authenticated with check (bucket_id='media' and public.has_any_role(auth.uid(), array['super_admin','content_admin']::public.app_role[]));
create policy "media obj update" on storage.objects for update to authenticated using (bucket_id='media' and public.has_any_role(auth.uid(), array['super_admin','content_admin']::public.app_role[]));
create policy "media obj delete" on storage.objects for delete to authenticated using (bucket_id='media' and public.has_any_role(auth.uid(), array['super_admin','content_admin']::public.app_role[]));
create policy "appdocs upload" on storage.objects for insert to anon, authenticated with check (bucket_id='application-docs' and (storage.foldername(name))[1] in (select id::text from public.applications where created_at > now() - interval '2 hours'));
create policy "appdocs read" on storage.objects for select to authenticated using (bucket_id='application-docs' and public.has_any_role(auth.uid(), array['super_admin','admissions_admin']::public.app_role[]));
create policy "learning read" on storage.objects for select to authenticated using (bucket_id='learning' and (public.has_any_role(auth.uid(), array['super_admin','academic_admin']::public.app_role[]) or (storage.foldername(name))[1] = public.my_course_id()::text));
create policy "learning write" on storage.objects for insert to authenticated with check (bucket_id='learning' and public.has_any_role(auth.uid(), array['super_admin','academic_admin']::public.app_role[]));
create policy "learning delete" on storage.objects for delete to authenticated using (bucket_id='learning' and public.has_any_role(auth.uid(), array['super_admin','academic_admin']::public.app_role[]));
create policy "subs upload" on storage.objects for insert to authenticated with check (bucket_id='submissions' and (storage.foldername(name))[1] = public.my_student_id()::text);
create policy "subs read" on storage.objects for select to authenticated using (bucket_id='submissions' and ((storage.foldername(name))[1] = public.my_student_id()::text or public.has_any_role(auth.uid(), array['super_admin','academic_admin']::public.app_role[])));


-- ===== 0001_course_intake_management.sql =====
alter table public.courses
  add column course_code text,
  add column study_mode public.study_mode not null default 'full_time',
  add column featured boolean not null default false,
  add column application_enabled boolean not null default true;

update public.courses
set study_mode = 'online'
where available_online;

create unique index courses_course_code_unique
  on public.courses(course_code)
  where course_code is not null;

create trigger a_intakes after insert or update or delete on public.intakes
  for each row execute function public.audit_row();


-- ===== 0002_admin_setup_and_student_ops.sql =====
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


-- ===== 0003_student_progression_followups.sql =====
create table public.progression_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  source_course_id uuid not null references public.courses(id) on delete cascade,
  next_course_id uuid not null references public.courses(id) on delete cascade,
  minimum_score numeric(5,2) not null default 50 check (minimum_score between 0 and 100),
  exam_name_pattern text not null default '%exam%',
  delay_days integer not null default 0 check (delay_days between 0 and 365),
  subject text not null default 'Continue your studies at Profia Institute',
  message text not null default 'Congratulations on completing your examinations. Enrol in your next level: {next_course}.',
  enabled boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (source_course_id <> next_course_id)
);

create index progression_rules_enabled_source_idx
  on public.progression_rules(source_course_id) where enabled;

create table public.progression_followups (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.progression_rules(id) on delete cascade,
  result_id uuid not null references public.results(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  due_at timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending','sending','sent','failed','cancelled')),
  attempts integer not null default 0,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(rule_id, result_id)
);

create index progression_followups_due_idx
  on public.progression_followups(due_at) where status in ('pending','failed');

alter table public.progression_rules enable row level security;
alter table public.progression_followups enable row level security;
grant select, insert, update, delete on public.progression_rules to authenticated;
grant select on public.progression_followups to authenticated;
grant all on public.progression_rules, public.progression_followups to service_role;

create policy "progression rules staff read"
  on public.progression_rules for select to authenticated
  using (public.has_any_role(auth.uid(), array['super_admin','academic_admin']::public.app_role[]));
create policy "progression rules staff manage"
  on public.progression_rules for all to authenticated
  using (public.has_any_role(auth.uid(), array['super_admin','academic_admin']::public.app_role[]))
  with check (public.has_any_role(auth.uid(), array['super_admin','academic_admin']::public.app_role[]));
create policy "progression followups staff read"
  on public.progression_followups for select to authenticated
  using (public.has_any_role(auth.uid(), array['super_admin','academic_admin']::public.app_role[]));

create trigger t_progression_rules_updated_at before update on public.progression_rules
  for each row execute function public.touch_updated_at();
create trigger t_progression_followups_updated_at before update on public.progression_followups
  for each row execute function public.touch_updated_at();

create or replace function public.queue_student_progression_followup()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.published and (tg_op = 'INSERT' or not old.published) then
    insert into public.progression_followups(rule_id, result_id, student_id, due_at)
    select rule.id, new.id, student.id, now() + make_interval(days => rule.delay_days)
      from public.progression_rules rule
      join public.students student on student.id = new.student_id
     where rule.enabled
       and rule.source_course_id = student.course_id
       and student.status = 'active'
       and coalesce(new.score, 0) >= rule.minimum_score
       and new.unit_name ilike rule.exam_name_pattern
    on conflict (rule_id, result_id) do nothing;
  end if;
  return new;
end $$;

create trigger t_queue_student_progression_followup
  after insert or update of published on public.results
  for each row execute function public.queue_student_progression_followup();

create or replace function public.claim_due_progression_followups(_limit integer default 50)
returns table(
  id uuid,
  student_email text,
  student_name text,
  student_number text,
  next_course text,
  next_course_id uuid,
  subject text,
  message text
)
language plpgsql security definer set search_path=public as $$
begin
  if auth.role() <> 'service_role' then raise exception 'Forbidden'; end if;
  return query
  with due as (
    select followup.id
      from public.progression_followups followup
      join public.progression_rules rule on rule.id = followup.rule_id and rule.enabled
      join public.students student
        on student.id = followup.student_id
       and student.status = 'active'
       and student.course_id = rule.source_course_id
     where followup.due_at <= now()
       and followup.attempts < 5
       and (
         followup.status in ('pending','failed')
         or (followup.status = 'sending' and followup.updated_at < now() - interval '15 minutes')
       )
     order by followup.due_at
     for update skip locked
     limit greatest(1, least(coalesce(_limit, 50), 100))
  ),
  claimed as (
    update public.progression_followups followup
       set status = 'sending',
           attempts = followup.attempts + 1,
           last_error = null
      from due
     where followup.id = due.id
     returning followup.id, followup.rule_id, followup.student_id
  )
  select claimed.id,
         student.email,
         concat_ws(' ', student.first_name, student.last_name),
         student.student_number,
         next_course.title,
         next_course.id,
         rule.subject,
         rule.message
    from claimed
    join public.students student on student.id = claimed.student_id
    join public.progression_rules rule on rule.id = claimed.rule_id
    join public.courses next_course on next_course.id = rule.next_course_id;
end $$;
revoke all on function public.claim_due_progression_followups(integer) from public, anon, authenticated;
grant execute on function public.claim_due_progression_followups(integer) to service_role;

create or replace function public.queue_existing_progression_followups()
returns integer language plpgsql security definer set search_path=public as $$
declare queued integer;
begin
  if not public.has_any_role(auth.uid(), array['super_admin','academic_admin']::public.app_role[]) then
    raise exception 'Forbidden';
  end if;
  insert into public.progression_followups(rule_id, result_id, student_id, due_at)
  select rule.id, result.id, student.id, now() + make_interval(days => rule.delay_days)
    from public.progression_rules rule
    join public.students student on student.course_id = rule.source_course_id and student.status = 'active'
    join public.results result on result.student_id = student.id and result.published
      and coalesce(result.score, 0) >= rule.minimum_score
      and result.unit_name ilike rule.exam_name_pattern
   where rule.enabled
  on conflict (rule_id, result_id) do nothing;
  get diagnostics queued = row_count;
  return queued;
end $$;
grant execute on function public.queue_existing_progression_followups() to authenticated;

create or replace function public.retry_progression_followup(_followup_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.has_any_role(auth.uid(), array['super_admin','academic_admin']::public.app_role[]) then
    raise exception 'Forbidden';
  end if;
  update public.progression_followups
     set status = 'pending', attempts = 0, due_at = now(), last_error = null
   where id = _followup_id and status = 'failed';
  if not found then raise exception 'Failed follow-up not found'; end if;
end $$;
grant execute on function public.retry_progression_followup(uuid) to authenticated;

create or replace function public.complete_progression_followup(
  _followup_id uuid,
  _sent boolean,
  _error text default null
) returns void language plpgsql security definer set search_path=public as $$
begin
  if auth.role() <> 'service_role' then raise exception 'Forbidden'; end if;
  update public.progression_followups
     set status = case when _sent then 'sent' else 'failed' end,
         sent_at = case when _sent then now() else null end,
         last_error = case when _sent then null else left(coalesce(_error,'Email delivery failed'),500) end
   where id = _followup_id and status = 'sending';
  if not found then raise exception 'Claimed follow-up not found'; end if;
end $$;
revoke all on function public.complete_progression_followup(uuid,boolean,text) from public, anon, authenticated;
grant execute on function public.complete_progression_followup(uuid,boolean,text) to service_role;


-- ===== 0004_application_document_storage.sql =====
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'application-docs',
  'application-docs',
  false,
  5242880,
  array['application/pdf', 'image/jpeg', 'image/png']::text[]
)
on conflict (id) do update
set name = excluded.name,
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;


-- ===== 0005_content_media_uploads.sql =====
alter table public.articles
  add column attachment_url text,
  add column attachment_type text,
  add column attachment_file_name text;

alter table public.announcements
  add column attachment_url text,
  add column attachment_type text,
  add column attachment_file_name text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'media',
    'media',
    true,
    104857600,
    array[
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'video/mp4',
      'video/webm',
      'video/quicktime',
      'video/ogg',
      'audio/mpeg',
      'audio/ogg',
      'audio/wav',
      'audio/mp4'
    ]::text[]
  ),
  (
    'learning',
    'learning',
    false,
    104857600,
    array[
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'video/mp4',
      'video/webm',
      'video/quicktime',
      'video/ogg',
      'audio/mpeg',
      'audio/ogg',
      'audio/wav',
      'audio/mp4'
    ]::text[]
  )
on conflict (id) do update
set name = excluded.name,
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;


-- ===== 0006_staff_directory.sql =====
drop function if exists public.list_staff();

create function public.list_staff()
returns table(
  user_id uuid,
  email text,
  full_name text,
  roles public.app_role[],
  status text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    u.id,
    coalesce(p.email, u.email, ''),
    coalesce(nullif(p.full_name, ''), u.raw_user_meta_data->>'full_name', ''),
    array_agg(r.role order by r.role),
    case
      when u.banned_until > now() then 'suspended'
      when u.email_confirmed_at is null then 'pending'
      else 'active'
    end,
    u.created_at
  from auth.users u
  join public.user_roles r on r.user_id = u.id
  left join public.profiles p on p.id = u.id
  where public.has_role(auth.uid(), 'super_admin')
    and r.role <> 'student'
  group by u.id, p.email, p.full_name
  order by lower(coalesce(p.full_name, u.raw_user_meta_data->>'full_name', u.email, ''));
$$;

grant execute on function public.list_staff() to authenticated;


-- ===== 0007_student_progression_directory.sql =====
create or replace function public.list_student_progression_followups()
returns table(
  id uuid,
  student_id uuid,
  student_name text,
  student_number text,
  student_email text,
  unit_name text,
  score numeric,
  grade text,
  source_course text,
  next_course text,
  status text,
  due_at timestamptz,
  last_error text,
  attempts integer,
  sent_at timestamptz,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.has_any_role(
    auth.uid(),
    array['super_admin', 'academic_admin']::public.app_role[]
  ) then
    raise exception 'Forbidden';
  end if;

  return query
  select
    followup.id,
    student.id,
    concat_ws(' ', student.first_name, student.middle_name, student.last_name),
    student.student_number,
    student.email,
    result.unit_name,
    result.score,
    result.grade,
    source_course.title,
    next_course.title,
    followup.status,
    followup.due_at,
    followup.last_error,
    followup.attempts,
    followup.sent_at,
    followup.created_at
  from public.progression_followups followup
  join public.students student on student.id = followup.student_id
  join public.results result on result.id = followup.result_id
  join public.progression_rules rule on rule.id = followup.rule_id
  join public.courses source_course on source_course.id = rule.source_course_id
  join public.courses next_course on next_course.id = rule.next_course_id
  order by followup.created_at desc
  limit 100;
end;
$$;

revoke all on function public.list_student_progression_followups() from public, anon;
grant execute on function public.list_student_progression_followups() to authenticated;


-- ===== 0008_online_course_lms.sql =====
alter table public.courses
  add column if not exists online_syllabus text,
  add column if not exists online_intro_video_url text,
  add column if not exists online_lecturer_name text,
  add column if not exists online_lecturer_email text,
  add column if not exists online_lecturer_phone text,
  add column if not exists online_certificate_fee numeric(12, 2) not null default 0,
  add column if not exists online_exam_fee numeric(12, 2) not null default 0;

create table if not exists public.online_course_lessons (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  section_title text not null default 'Course lessons',
  title text not null,
  description text,
  notes text,
  video_url text,
  file_path text,
  file_type text,
  duration_seconds integer not null default 0 check (duration_seconds >= 0),
  is_preview boolean not null default false,
  sort_order integer not null default 0,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists online_course_lessons_order_idx
  on public.online_course_lessons(course_id, sort_order, created_at);
alter table public.online_course_lessons enable row level security;
grant select, insert, update, delete on public.online_course_lessons to authenticated;
grant all on public.online_course_lessons to service_role;
drop policy if exists online_lesson_staff_manage on public.online_course_lessons;
create policy online_lesson_staff_manage on public.online_course_lessons for all to authenticated
  using (public.has_any_role(auth.uid(), array['super_admin','academic_admin']::public.app_role[]))
  with check (public.has_any_role(auth.uid(), array['super_admin','academic_admin']::public.app_role[]));
drop trigger if exists t_online_course_lessons_updated_at on public.online_course_lessons;
create trigger t_online_course_lessons_updated_at before update on public.online_course_lessons
  for each row execute function public.touch_updated_at();

create table if not exists public.online_course_enrollments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete restrict,
  tuition_fee numeric(12, 2) not null check (tuition_fee >= 0),
  certificate_fee numeric(12, 2) not null default 0 check (certificate_fee >= 0),
  exam_fee numeric(12, 2) not null default 0 check (exam_fee >= 0),
  status text not null default 'active' check (status in ('active','completed','cancelled')),
  created_at timestamptz not null default now(),
  unique (student_id, course_id)
);
create index if not exists online_course_enrollments_student_idx
  on public.online_course_enrollments(student_id, status);
alter table public.online_course_enrollments enable row level security;
grant select on public.online_course_enrollments to authenticated;
grant all on public.online_course_enrollments to service_role;
drop policy if exists online_course_enrollment_read on public.online_course_enrollments;
create policy online_course_enrollment_read on public.online_course_enrollments for select to authenticated
  using (student_id = public.my_student_id()
    or public.has_any_role(auth.uid(), array['super_admin','academic_admin']::public.app_role[]));

create table if not exists public.online_lesson_progress (
  lesson_id uuid not null references public.online_course_lessons(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  completed_at timestamptz not null default now(),
  primary key (lesson_id, student_id)
);
alter table public.online_lesson_progress enable row level security;
grant select on public.online_lesson_progress to authenticated;
grant all on public.online_lesson_progress to service_role;
drop policy if exists online_lesson_progress_read on public.online_lesson_progress;
create policy online_lesson_progress_read on public.online_lesson_progress for select to authenticated
  using (student_id = public.my_student_id()
    or public.has_any_role(auth.uid(), array['super_admin','academic_admin']::public.app_role[]));

create table if not exists public.online_course_payments (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.online_course_enrollments(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete restrict,
  stage text not null check (stage in ('tuition_30','tuition_balance','certificate_fee','exam_fee')),
  amount numeric(12, 2) not null check (amount > 0),
  reference text not null unique,
  provider_checkout_id text unique,
  provider_reference text unique,
  status text not null default 'pending' check (status in ('pending','confirmed','failed')),
  provider text not null default 'payhero',
  raw jsonb not null default '{}'::jsonb,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists online_course_payments_enrollment_status_idx
  on public.online_course_payments(enrollment_id, status);
create unique index if not exists online_course_payments_one_pending_per_enrollment_idx
  on public.online_course_payments(enrollment_id) where status = 'pending';
alter table public.online_course_payments enable row level security;
grant select on public.online_course_payments to authenticated;
grant all on public.online_course_payments to service_role;
drop policy if exists online_course_payment_read on public.online_course_payments;
create policy online_course_payment_read on public.online_course_payments for select to authenticated
  using (student_id = public.my_student_id()
    or public.has_any_role(auth.uid(), array['super_admin','academic_admin']::public.app_role[]));

create or replace function public.enroll_online_course(_course_id uuid, _phone text)
returns table(student_id uuid, enrollment_id uuid, student_number text)
language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(trim(coalesce(auth.jwt()->>'email', '')));
  v_name text := trim(coalesce(auth.jwt()->'user_metadata'->>'full_name', ''));
  v_first text := split_part(v_name, ' ', 1);
  v_last text := nullif(trim(substr(v_name, length(v_first) + 1)), '');
  v_student_id uuid;
  v_enrollment_id uuid;
  v_student_number text;
begin
  if auth.uid() is null or v_email = '' then raise exception 'Sign in with a confirmed email to enroll'; end if;
  if coalesce(trim(_phone), '') !~ '^\+?[0-9 ]{9,15}$' then raise exception 'Enter a valid mobile number for course payments'; end if;
  if not exists (
    select 1 from public.courses c where c.id = _course_id
      and c.published and c.available_online and c.fees is not null and c.fees >= 0
  ) then raise exception 'This online course is not available for enrollment'; end if;

  select s.id, s.student_number into v_student_id, v_student_number
    from public.students s where s.user_id = auth.uid() for update;
  if v_student_id is null then
    select s.id, s.student_number into v_student_id, v_student_number
      from public.students s
     where lower(s.email) = v_email and s.user_id is null
     order by s.created_at limit 1 for update;
    if v_student_id is not null then
      update public.students s set user_id = auth.uid(), phone = trim(_phone)
       where s.id = v_student_id;
    end if;
  else
    update public.students s set phone = trim(_phone) where s.id = v_student_id;
  end if;

  if v_student_id is null then
    insert into public.students as new_student (
      user_id, student_number, first_name, last_name, email, phone, study_mode, status
    ) values (
      auth.uid(), '', coalesce(nullif(v_first, ''), 'Online'), coalesce(v_last, 'Learner'),
      v_email, trim(_phone), 'online', 'active'
    ) returning new_student.id, new_student.student_number into v_student_id, v_student_number;
  end if;
  if exists (select 1 from public.students s where s.id = v_student_id and s.status = 'suspended') then
    raise exception 'This student account is suspended';
  end if;

  insert into public.online_course_enrollments (
    student_id, course_id, tuition_fee, certificate_fee, exam_fee
  )
  select v_student_id, c.id, c.fees, c.online_certificate_fee, c.online_exam_fee
    from public.courses c where c.id = _course_id
  on conflict on constraint online_course_enrollments_student_id_course_id_key do nothing;
  select e.id into v_enrollment_id from public.online_course_enrollments e
   where e.student_id = v_student_id and e.course_id = _course_id;
  return query select v_student_id, v_enrollment_id, v_student_number;
end;
$$;
revoke all on function public.enroll_online_course(uuid, text) from public, anon;
grant execute on function public.enroll_online_course(uuid, text) to authenticated;

create or replace function public.can_access_online_lesson(_lesson_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.online_course_lessons l
    join public.online_course_enrollments e on e.course_id = l.course_id and e.status = 'active'
    join public.students s on s.id = e.student_id and s.user_id = auth.uid()
    where l.id = _lesson_id and l.published
      and (
        l.is_preview
        or coalesce((select sum(p.amount) from public.online_course_payments p
          where p.enrollment_id = e.id and p.status = 'confirmed'
            and p.stage in ('tuition_30','tuition_balance')), 0) >= ceil(e.tuition_fee)
        or (
          e.tuition_fee > 0
          and coalesce((select sum(p.amount) from public.online_course_payments p
            where p.enrollment_id = e.id and p.status = 'confirmed'
              and p.stage in ('tuition_30','tuition_balance')), 0) >= ceil(e.tuition_fee * 0.30)
          and (
            select coalesce(sum(rest.duration_seconds), 0)
              from public.online_course_lessons rest
             where rest.course_id = l.course_id and rest.published and not rest.is_preview
          ) > 0
          and coalesce((
            select sum(prior.duration_seconds) from public.online_course_lessons prior
             where prior.course_id = l.course_id and prior.published and not prior.is_preview
               and (prior.sort_order, prior.created_at, prior.id) <= (l.sort_order, l.created_at, l.id)
          ), 0) <= (
            select coalesce(sum(rest.duration_seconds), 0) * 0.30
              from public.online_course_lessons rest
             where rest.course_id = l.course_id and rest.published and not rest.is_preview
          )
        )
      )
  );
$$;
revoke all on function public.can_access_online_lesson(uuid) from public, anon;
grant execute on function public.can_access_online_lesson(uuid) to authenticated;

create or replace function public.list_online_course_lessons(_course_id uuid)
returns table(
  id uuid, section_title text, title text, description text, notes text,
  video_url text, file_path text, file_type text, duration_seconds integer, is_preview boolean,
  sort_order integer, completed boolean, locked boolean
)
language sql stable security definer set search_path = public as $$
  select l.id, l.section_title, l.title, l.description,
    case when allowed.can_view then l.notes else null end,
    case when allowed.can_view then l.video_url else null end,
    case when allowed.can_view then l.file_path else null end,
    case when allowed.can_view then l.file_type else null end,
    l.duration_seconds, l.is_preview, l.sort_order,
    exists (select 1 from public.online_lesson_progress p
      where p.lesson_id = l.id and p.student_id = public.my_student_id()),
    not allowed.can_view
  from public.online_course_lessons l
  cross join lateral (select
    l.is_preview
    or public.can_access_online_lesson(l.id)
    or exists (
      select 1 from public.online_course_enrollments e
      join public.students s on s.id = e.student_id and s.user_id = auth.uid()
      join public.online_course_payments p on p.enrollment_id = e.id
        and p.status = 'confirmed' and p.stage in ('tuition_30','tuition_balance')
      where e.course_id = l.course_id and e.status = 'active'
      group by e.id, e.tuition_fee
      having sum(p.amount) >= ceil(e.tuition_fee)
    )
  ) allowed(can_view)
  where l.course_id = _course_id and l.published
    and exists (select 1 from public.courses c
      where c.id = l.course_id and c.published and c.available_online)
  order by l.sort_order, l.created_at;
$$;
revoke all on function public.list_online_course_lessons(uuid) from public;
grant execute on function public.list_online_course_lessons(uuid) to anon, authenticated;

create or replace function public.can_access_online_lesson_file(_file_path text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.online_course_lessons l
    where l.file_path = _file_path and l.published
      and (l.is_preview or public.can_access_online_lesson(l.id))
  );
$$;
revoke all on function public.can_access_online_lesson_file(text) from public, anon;
grant execute on function public.can_access_online_lesson_file(text) to anon, authenticated;

create or replace function public.complete_online_lesson(_lesson_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.my_student_id() is null then raise exception 'Student sign-in required'; end if;
  if not public.can_access_online_lesson(_lesson_id) then raise exception 'This lesson is locked'; end if;
  insert into public.online_lesson_progress(lesson_id, student_id)
  values (_lesson_id, public.my_student_id()) on conflict (lesson_id, student_id)
  do update set completed_at = now();
end;
$$;
revoke all on function public.complete_online_lesson(uuid) from public, anon;
grant execute on function public.complete_online_lesson(uuid) to authenticated;

drop policy if exists learning_online_lesson_access on storage.objects;
create policy learning_online_lesson_access on storage.objects for select to anon, authenticated
  using (bucket_id = 'learning' and public.can_access_online_lesson_file(storage.objects.name));

-- ===== 0009_online_course_enrollment_conflict.sql =====
create or replace function public.enroll_online_course(_course_id uuid, _phone text)
returns table(student_id uuid, enrollment_id uuid, student_number text)
language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(trim(coalesce(auth.jwt()->>'email', '')));
  v_name text := trim(coalesce(auth.jwt()->'user_metadata'->>'full_name', ''));
  v_first text := split_part(v_name, ' ', 1);
  v_last text := nullif(trim(substr(v_name, length(v_first) + 1)), '');
  v_student_id uuid;
  v_enrollment_id uuid;
  v_student_number text;
begin
  if auth.uid() is null or v_email = '' then
    raise exception 'Sign in with a confirmed email to enroll';
  end if;
  if coalesce(trim(_phone), '') !~ '^\+?[0-9 ]{9,15}$' then
    raise exception 'Enter a valid mobile number for course payments';
  end if;
  if not exists (
    select 1 from public.courses c
    where c.id = _course_id and c.published and c.available_online
      and c.fees is not null and c.fees >= 0
  ) then
    raise exception 'This online course is not available for enrollment';
  end if;

  select s.id, s.student_number into v_student_id, v_student_number
  from public.students s
  where s.user_id = auth.uid()
  for update;

  if v_student_id is null then
    select s.id, s.student_number into v_student_id, v_student_number
    from public.students s
    where lower(s.email) = v_email and s.user_id is null
    order by s.created_at
    limit 1
    for update;

    if v_student_id is not null then
      update public.students s
      set user_id = auth.uid(), phone = trim(_phone)
      where s.id = v_student_id;
    end if;
  else
    update public.students s
    set phone = trim(_phone)
    where s.id = v_student_id;
  end if;

  if v_student_id is null then
    insert into public.students as new_student (
      user_id, student_number, first_name, last_name, email, phone, study_mode, status
    ) values (
      auth.uid(), '', coalesce(nullif(v_first, ''), 'Online'),
      coalesce(v_last, 'Learner'), v_email, trim(_phone), 'online', 'active'
    )
    returning new_student.id, new_student.student_number
    into v_student_id, v_student_number;
  end if;

  if exists (
    select 1 from public.students s
    where s.id = v_student_id and s.status = 'suspended'
  ) then
    raise exception 'This student account is suspended';
  end if;

  insert into public.user_roles (user_id, role)
  values (auth.uid(), 'student')
  on conflict do nothing;

  insert into public.online_course_enrollments (
    student_id, course_id, tuition_fee, certificate_fee, exam_fee
  )
  select v_student_id, c.id, c.fees, c.online_certificate_fee, c.online_exam_fee
  from public.courses c
  where c.id = _course_id
  on conflict on constraint online_course_enrollments_student_id_course_id_key
  do nothing;

  select e.id into v_enrollment_id
  from public.online_course_enrollments e
  where e.student_id = v_student_id and e.course_id = _course_id;

  return query
  select v_student_id, v_enrollment_id, v_student_number;
end;
$$;

revoke all on function public.enroll_online_course(uuid, text) from public, anon;
grant execute on function public.enroll_online_course(uuid, text) to authenticated;


-- ===== 0010_student_documents.sql =====
create table if not exists public.student_documents (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  document_type text not null check (
    document_type in ('KCSE certificate', 'KCPE certificate', 'Other certificate', 'Birth certificate', 'ID or passport')
  ),
  file_path text not null unique,
  file_name text not null,
  uploaded_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists student_documents_student_created_idx
  on public.student_documents(student_id, created_at desc);

alter table public.student_documents enable row level security;
grant select, insert, delete on public.student_documents to authenticated;
grant all on public.student_documents to service_role;

drop policy if exists student_documents_staff_read on public.student_documents;
create policy student_documents_staff_read on public.student_documents
  for select to authenticated
  using (public.has_any_role(auth.uid(), array['super_admin','admissions_admin']::public.app_role[]));

drop policy if exists student_documents_staff_insert on public.student_documents;
create policy student_documents_staff_insert on public.student_documents
  for insert to authenticated
  with check (
    uploaded_by = auth.uid()
    and public.has_any_role(auth.uid(), array['super_admin','admissions_admin']::public.app_role[])
  );

drop policy if exists student_documents_staff_delete on public.student_documents;
create policy student_documents_staff_delete on public.student_documents
  for delete to authenticated
  using (public.has_any_role(auth.uid(), array['super_admin','admissions_admin']::public.app_role[]));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'student-documents',
  'student-documents',
  false,
  5242880,
  array['application/pdf', 'image/jpeg', 'image/png']::text[]
)
on conflict (id) do update
set name = excluded.name,
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists student_documents_storage_read on storage.objects;
create policy student_documents_storage_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'student-documents'
    and public.has_any_role(auth.uid(), array['super_admin','admissions_admin']::public.app_role[])
  );

drop policy if exists student_documents_storage_insert on storage.objects;
create policy student_documents_storage_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'student-documents'
    and public.has_any_role(auth.uid(), array['super_admin','admissions_admin']::public.app_role[])
    and exists (
      select 1 from public.students s
      where s.id::text = (storage.foldername(name))[1]
    )
  );

drop policy if exists student_documents_storage_delete on storage.objects;
create policy student_documents_storage_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'student-documents'
    and public.has_any_role(auth.uid(), array['super_admin','admissions_admin']::public.app_role[])
  );


-- ===== 0011_online_enrollment_admin_read.sql =====
drop policy if exists online_course_enrollment_read on public.online_course_enrollments;
create policy online_course_enrollment_read on public.online_course_enrollments
  for select to authenticated
  using (
    student_id = public.my_student_id()
    or public.has_any_role(
      auth.uid(),
      array['super_admin','academic_admin','admissions_admin']::public.app_role[]
    )
  );


-- ===== 0012_preserve_archived_course_access.sql =====
drop policy if exists "courses read" on public.courses;
create policy "courses read" on public.courses
  for select to anon, authenticated
  using (
    published
    or public.is_staff(auth.uid())
    or exists (
      select 1 from public.enrollments e
      where e.course_id = courses.id and e.student_id = public.my_student_id()
    )
    or exists (
      select 1 from public.online_course_enrollments e
      where e.course_id = courses.id and e.student_id = public.my_student_id()
    )
  );

create or replace function public.list_online_course_lessons(_course_id uuid)
returns table(
  id uuid, section_title text, title text, description text, notes text,
  video_url text, file_path text, file_type text, duration_seconds integer, is_preview boolean,
  sort_order integer, completed boolean, locked boolean
)
language sql stable security definer set search_path = public as $$
  select l.id, l.section_title, l.title, l.description,
    case when allowed.can_view then l.notes else null end,
    case when allowed.can_view then l.video_url else null end,
    case when allowed.can_view then l.file_path else null end,
    case when allowed.can_view then l.file_type else null end,
    l.duration_seconds, l.is_preview, l.sort_order,
    exists (select 1 from public.online_lesson_progress p
      where p.lesson_id = l.id and p.student_id = public.my_student_id()),
    not allowed.can_view
  from public.online_course_lessons l
  cross join lateral (select
    l.is_preview
    or public.can_access_online_lesson(l.id)
    or exists (
      select 1 from public.online_course_enrollments e
      join public.students s on s.id = e.student_id and s.user_id = auth.uid()
      join public.online_course_payments p on p.enrollment_id = e.id
        and p.status = 'confirmed' and p.stage in ('tuition_30','tuition_balance')
      where e.course_id = l.course_id and e.status = 'active'
      group by e.id, e.tuition_fee
      having sum(p.amount) >= ceil(e.tuition_fee)
    )
  ) allowed(can_view)
  where l.course_id = _course_id and l.published
    and (
      exists (
        select 1 from public.courses c
        where c.id = l.course_id and c.published and c.available_online
      )
      or exists (
        select 1 from public.online_course_enrollments e
        join public.students s on s.id = e.student_id
        where e.course_id = l.course_id and s.user_id = auth.uid()
      )
    )
  order by l.sort_order, l.created_at;
$$;

revoke all on function public.list_online_course_lessons(uuid) from public;
grant execute on function public.list_online_course_lessons(uuid) to anon, authenticated;


-- ===== 0013_faq_insights_and_query_indexes.sql =====
create index if not exists enrollments_student_course_idx
  on public.enrollments(student_id, course_id);

create index if not exists results_student_published_idx
  on public.results(student_id, published);

create index if not exists fees_student_created_idx
  on public.fees(student_id, created_at desc);

create index if not exists payments_student_status_paid_idx
  on public.payments(student_id, status, paid_at desc);

create index if not exists faqs_published_order_idx
  on public.faqs(sort_order) where published;

create table if not exists public.faq_search_insights (
  faq_id uuid not null references public.faqs(id) on delete cascade,
  search_date date not null default current_date,
  bucket smallint not null check (bucket between 0 and 15),
  search_count bigint not null default 0 check (search_count >= 0),
  primary key (faq_id, search_date, bucket)
);

create index if not exists faq_search_insights_date_faq_idx
  on public.faq_search_insights(search_date, faq_id);

alter table public.faq_search_insights enable row level security;
revoke all on public.faq_search_insights from anon, authenticated;
grant all on public.faq_search_insights to service_role;

create or replace function public.record_faq_search(_faq_id uuid, _bucket smallint)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if _bucket is null or _bucket < 0 or _bucket > 15 then
    raise exception 'Invalid search bucket';
  end if;

  if not exists (
    select 1 from public.faqs where id = _faq_id and published
  ) then
    raise exception 'FAQ search target is unavailable';
  end if;

  insert into public.faq_search_insights as existing(faq_id, search_date, bucket, search_count)
  values (_faq_id, current_date, _bucket, 1)
  on conflict (faq_id, search_date, bucket)
  do update set search_count = existing.search_count + 1;
end;
$$;

revoke all on function public.record_faq_search(uuid, smallint) from public;
grant execute on function public.record_faq_search(uuid, smallint) to anon, authenticated;

create or replace function public.list_faq_search_insights(_days integer default 30)
returns table(faq_id uuid, question text, category text, search_count bigint)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if not public.has_any_role(
    auth.uid(),
    array['super_admin', 'content_admin']::public.app_role[]
  ) then
    raise exception 'Forbidden';
  end if;

  if _days is null or _days < 1 or _days > 365 then
    raise exception 'Days must be between 1 and 365';
  end if;

  return query
  select f.id, f.question, f.category, sum(i.search_count)::bigint
  from public.faq_search_insights i
  join public.faqs f on f.id = i.faq_id
  where i.search_date >= current_date - (_days - 1)
  group by f.id, f.question, f.category
  order by sum(i.search_count) desc, f.question
  limit 100;
end;
$$;

revoke all on function public.list_faq_search_insights(integer) from public;
grant execute on function public.list_faq_search_insights(integer) to authenticated;


-- ===== 0014_course_billing_mpesa.sql =====
alter table public.fees
  add column if not exists enrollment_id uuid references public.enrollments(id) on delete cascade,
  add column if not exists online_enrollment_id uuid references public.online_course_enrollments(id) on delete cascade,
  add column if not exists charge_key text not null default 'general';

create unique index if not exists fees_enrollment_id_key
  on public.fees(enrollment_id);
create unique index if not exists fees_online_enrollment_charge_key
  on public.fees(online_enrollment_id, charge_key);
create unique index if not exists payments_provider_reference_key
  on public.payments(provider, reference);

insert into public.payments(student_id, amount, method, provider, reference, status, paid_at, raw)
select p.student_id,
       p.amount,
       'M-Pesa STK Push',
       p.provider,
       p.reference,
       'confirmed',
       coalesce(p.paid_at, p.created_at),
       jsonb_build_object('migrated_from_online_payment', p.id)
  from public.online_course_payments p
 where p.status = 'confirmed'
on conflict (provider, reference) do nothing;

create or replace function public.bill_course_enrollment_fee()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_course_title text;
  v_amount numeric(12, 2);
begin
  select c.title, c.fees
    into v_course_title, v_amount
    from public.courses c
   where c.id = new.course_id;

  if v_amount > 0 then
    insert into public.fees(student_id, description, amount, enrollment_id, charge_key)
    values (new.student_id, 'Course fee · ' || v_course_title, v_amount, new.id, 'course_fee')
    on conflict (enrollment_id) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists bill_course_enrollment_fee on public.enrollments;
create trigger bill_course_enrollment_fee
  after insert on public.enrollments
  for each row execute function public.bill_course_enrollment_fee();

create or replace function public.bill_online_course_enrollment_fees()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_course_title text;
begin
  select c.title into v_course_title
    from public.courses c
   where c.id = new.course_id;

  insert into public.fees(student_id, description, amount, online_enrollment_id, charge_key)
  select new.student_id, charge.description, charge.amount, new.id, charge.key
    from (values
      ('tuition', 'Course tuition · ' || v_course_title, new.tuition_fee),
      ('exam_fee', 'Examination fee · ' || v_course_title, new.exam_fee),
      ('certificate_fee', 'Certificate fee · ' || v_course_title, new.certificate_fee)
    ) as charge(key, description, amount)
   where charge.amount > 0
  on conflict (online_enrollment_id, charge_key) do nothing;

  return new;
end;
$$;

drop trigger if exists bill_online_course_enrollment_fees on public.online_course_enrollments;
create trigger bill_online_course_enrollment_fees
  after insert on public.online_course_enrollments
  for each row execute function public.bill_online_course_enrollment_fees();

insert into public.fees(student_id, description, amount, enrollment_id, charge_key)
select e.student_id, 'Course fee · ' || c.title, c.fees, e.id, 'course_fee'
  from public.enrollments e
  join public.courses c on c.id = e.course_id
 where c.fees > 0
on conflict (enrollment_id) do nothing;

insert into public.fees(student_id, description, amount, online_enrollment_id, charge_key)
select e.student_id, charge.description, charge.amount, e.id, charge.key
  from public.online_course_enrollments e
  join public.courses c on c.id = e.course_id
  cross join lateral (values
    ('tuition', 'Course tuition · ' || c.title, e.tuition_fee),
    ('exam_fee', 'Examination fee · ' || c.title, e.exam_fee),
    ('certificate_fee', 'Certificate fee · ' || c.title, e.certificate_fee)
  ) as charge(key, description, amount)
 where charge.amount > 0
on conflict (online_enrollment_id, charge_key) do nothing;

create table if not exists public.mpesa_c2b_receipts (
  transaction_id text primary key,
  business_shortcode text not null,
  student_reference text not null,
  amount numeric(12, 2) not null check (amount > 0),
  phone_number text,
  status text not null default 'unmatched' check (status in ('matched', 'unmatched')),
  payment_id uuid references public.payments(id) on delete set null,
  raw jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now()
);
alter table public.mpesa_c2b_receipts enable row level security;
revoke all on public.mpesa_c2b_receipts from anon, authenticated;
grant select on public.mpesa_c2b_receipts to authenticated;
grant all on public.mpesa_c2b_receipts to service_role;
drop policy if exists mpesa_c2b_receipts_staff_read on public.mpesa_c2b_receipts;
create policy mpesa_c2b_receipts_staff_read
  on public.mpesa_c2b_receipts for select to authenticated
  using (public.has_any_role(
    auth.uid(),
    array['super_admin','academic_admin','admissions_admin']::public.app_role[]
  ));


-- ===== 0015_staff_invite_password_setup.sql =====
revoke all on function public.set_role_by_email(text, public.app_role, boolean)
  from public, anon, authenticated;

-- ===== 0016_payhero_fee_payments_documents.sql =====
alter table public.notifications
  add column if not exists reference_id uuid;

create unique index if not exists notifications_reference_id_key
  on public.notifications(user_id, category, reference_id);

create unique index if not exists payments_one_pending_payhero_fee_per_student
  on public.payments(student_id)
  where provider = 'payhero'
    and status = 'pending'
    and raw ->> 'payment_type' = 'student_fees';

create table if not exists public.fee_documents (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  payment_id uuid unique references public.payments(id) on delete cascade,
  document_type text not null check (document_type in ('receipt', 'statement')),
  storage_path text not null unique,
  created_at timestamptz not null default now(),
  check ((document_type = 'receipt' and payment_id is not null) or
         (document_type = 'statement' and payment_id is null))
);

alter table public.fee_documents enable row level security;
revoke all on public.fee_documents from anon, authenticated;
grant select on public.fee_documents to authenticated;
grant all on public.fee_documents to service_role;

drop policy if exists fee_documents_student_read on public.fee_documents;
create policy fee_documents_student_read
  on public.fee_documents for select to authenticated
  using (
    student_id = public.my_student_id()
    or public.has_role(auth.uid(), 'super_admin')
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fee-documents', 'fee-documents', false, 5242880, array['application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists fee_documents_storage_read on storage.objects;
create policy fee_documents_storage_read
  on storage.objects for select to authenticated
  using (
    bucket_id = 'fee-documents'
    and (
      (storage.foldername(name))[1] = public.my_student_id()::text
      or public.has_role(auth.uid(), 'super_admin')
    )
  );

create or replace function public.admin_fee_account_summary()
returns table (
  student_id uuid,
  student_number text,
  first_name text,
  last_name text,
  billed numeric,
  paid numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with fee_totals as (
    select f.student_id, sum(f.amount) as total
      from public.fees f
     group by f.student_id
  ),
  payment_totals as (
    select p.student_id, sum(p.amount) as total
      from public.payments p
     where p.status = 'confirmed'
     group by p.student_id
  )
  select s.id,
         s.student_number,
         s.first_name,
         s.last_name,
         coalesce(f.total, 0),
         coalesce(p.total, 0)
    from public.students s
    left join fee_totals f on f.student_id = s.id
    left join payment_totals p on p.student_id = s.id
   where public.has_role(auth.uid(), 'super_admin')
   order by s.last_name, s.first_name;
$$;
revoke all on function public.admin_fee_account_summary() from public, anon;
grant execute on function public.admin_fee_account_summary() to authenticated;

-- ===== 0017_payhero_superadmin_settings.sql =====
create table public.payhero_settings (
  id boolean primary key default true check (id),
  api_username text not null,
  api_password text not null,
  channel_id text not null,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.payhero_settings enable row level security;
revoke all on public.payhero_settings from anon, authenticated;
grant all on public.payhero_settings to service_role;

-- ===== 0018_payhero_provider_references.sql =====
alter table public.online_course_payments
  add column if not exists provider_reference text;

create unique index if not exists online_course_payments_provider_reference_key
  on public.online_course_payments(provider_reference)
  where provider_reference is not null;

-- ===== 0019_assignment_submissions_storage.sql =====
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('submissions', 'submissions', false, 52428800, null)
on conflict (id) do update
  set name = excluded.name,
      public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "subs delete own" on storage.objects;
create policy "subs delete own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'submissions'
    and (
      (storage.foldername(name))[1] = public.my_student_id()::text
      or public.has_any_role(auth.uid(), array['super_admin','academic_admin']::public.app_role[])
    )
  );

-- ===== 0020_assignment_deadlines_marking.sql =====
alter table public.results
  add column if not exists source_submission_id uuid
    references public.submissions(id) on delete set null;

create unique index if not exists results_source_submission_id_key
  on public.results(source_submission_id)
  where source_submission_id is not null;

drop policy if exists "subs own update" on public.submissions;

create or replace function public.enforce_assignment_deadline()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  assignment_due_at timestamptz;
  assignment_published boolean;
  current_student_id uuid;
begin
  if public.has_any_role(
    auth.uid(),
    array['super_admin','academic_admin']::public.app_role[]
  ) then
    return new;
  end if;

  current_student_id := public.my_student_id();
  if current_student_id is null or new.student_id <> current_student_id then
    raise exception 'You can only submit assignments for your own student account.';
  end if;

  if tg_op = 'UPDATE' then
    raise exception 'Assignments can only be submitted once.';
  end if;

  if new.status <> 'submitted' or new.grade is not null then
    raise exception 'Invalid assignment submission.';
  end if;

  select due_date, published
    into assignment_due_at, assignment_published
    from public.assignments
    where id = new.assignment_id;

  if not found or not assignment_published then
    raise exception 'This assignment is not open for submission.';
  end if;
  if assignment_due_at is null then
    raise exception 'This assignment does not have a submission deadline.';
  end if;
  if assignment_due_at <= now() then
    raise exception 'The submission deadline has passed.';
  end if;

  return new;
end;
$$;

drop trigger if exists submissions_enforce_assignment_deadline on public.submissions;
create trigger submissions_enforce_assignment_deadline
  before insert or update on public.submissions
  for each row execute function public.enforce_assignment_deadline();

create or replace function public.require_assignment_deadline_when_published()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.published and new.due_date is null then
    raise exception 'Set a submission deadline before publishing this assignment.';
  end if;
  return new;
end;
$$;

drop trigger if exists assignments_require_deadline on public.assignments;
create trigger assignments_require_deadline
  before insert or update of published, due_date on public.assignments
  for each row execute function public.require_assignment_deadline_when_published();

create or replace function public.mark_assignment_submission(
  _submission_id uuid,
  _score numeric,
  _grade text,
  _feedback text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  submission_record public.submissions%rowtype;
  assignment_title text;
  result_record_id uuid;
begin
  if not public.has_any_role(
    auth.uid(),
    array['super_admin','academic_admin']::public.app_role[]
  ) then
    raise exception 'Only academic staff can mark assignments.';
  end if;
  if _score is null or _score < 0 or _score > 100 then
    raise exception 'Score must be between 0 and 100.';
  end if;
  if nullif(trim(_grade), '') is null then
    raise exception 'Enter a grade before saving the result.';
  end if;

  select submission, assignment.title
    into submission_record, assignment_title
    from public.submissions submission
    join public.assignments assignment on assignment.id = submission.assignment_id
    where submission.id = _submission_id
    for update of submission;

  if not found then
    raise exception 'Assignment submission not found.';
  end if;

  update public.submissions
    set grade = trim(_grade),
        feedback = nullif(trim(_feedback), ''),
        status = 'marked'
    where id = _submission_id;

  insert into public.results (
    student_id,
    source_submission_id,
    unit_name,
    score,
    grade,
    published
  )
  values (
    submission_record.student_id,
    submission_record.id,
    assignment_title,
    _score,
    trim(_grade),
    false
  )
  on conflict (source_submission_id) where source_submission_id is not null
  do update set
    unit_name = excluded.unit_name,
    score = excluded.score,
    grade = excluded.grade,
    published = false
  returning id into result_record_id;

  return result_record_id;
end;
$$;

revoke all on function public.mark_assignment_submission(uuid, numeric, text, text)
  from public, anon;
grant execute on function public.mark_assignment_submission(uuid, numeric, text, text)
  to authenticated;

-- ===== 0022_editorial_workflow.sql =====
alter table public.articles
  add column if not exists attachment_file_name text;

alter table public.announcements
  add column if not exists attachment_file_name text;

drop policy if exists "ann public" on public.announcements;
create policy "ann public" on public.announcements
  for select to anon, authenticated
  using (published or public.is_staff(auth.uid()));

drop policy if exists "ann write" on public.announcements;
create policy "ann write" on public.announcements
  for all to authenticated
  using (public.has_any_role(auth.uid(), array['super_admin']::public.app_role[]))
  with check (public.has_any_role(auth.uid(), array['super_admin']::public.app_role[]));

drop policy if exists "art public" on public.articles;
create policy "art public" on public.articles
  for select to anon, authenticated
  using (
    (status = 'published' or (status = 'scheduled' and published_at <= now()))
    or public.has_any_role(auth.uid(), array['super_admin','content_admin']::public.app_role[])
  );

-- ===== 0023_cat_assessments.sql =====
create table public.cat_assessments (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete restrict,
  title text not null check (length(trim(title)) between 1 and 160),
  instructions text,
  duration_minutes integer not null check (duration_minutes between 1 and 360),
  opens_at timestamptz not null,
  closes_at timestamptz not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (closes_at > opens_at)
);

create table public.cat_questions (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.cat_assessments(id) on delete cascade,
  prompt text not null check (length(trim(prompt)) between 1 and 4000),
  option_a text not null check (length(trim(option_a)) between 1 and 1000),
  option_b text not null check (length(trim(option_b)) between 1 and 1000),
  option_c text not null check (length(trim(option_c)) between 1 and 1000),
  option_d text not null check (length(trim(option_d)) between 1 and 1000),
  correct_option char(1) not null check (correct_option in ('A', 'B', 'C', 'D')),
  points integer not null default 1 check (points between 1 and 100),
  position integer not null check (position > 0),
  unique (assessment_id, position)
);

create table public.cat_attempts (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.cat_assessments(id) on delete restrict,
  student_id uuid not null references public.students(id) on delete cascade,
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  score integer,
  max_score integer,
  unique (assessment_id, student_id),
  check (
    (submitted_at is null and score is null and max_score is null)
    or (submitted_at is not null and score between 0 and max_score and max_score > 0)
  )
);

create table public.cat_answers (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.cat_attempts(id) on delete cascade,
  question_id uuid not null references public.cat_questions(id) on delete cascade,
  selected_option char(1) not null check (selected_option in ('A', 'B', 'C', 'D')),
  updated_at timestamptz not null default now(),
  unique (attempt_id, question_id)
);

create index cat_assessments_course_schedule_idx
  on public.cat_assessments(course_id, opens_at, closes_at);
create index cat_attempts_student_idx on public.cat_attempts(student_id, assessment_id);
create index cat_answers_attempt_idx on public.cat_answers(attempt_id);

alter table public.cat_assessments enable row level security;
alter table public.cat_questions enable row level security;
alter table public.cat_attempts enable row level security;
alter table public.cat_answers enable row level security;

revoke all on public.cat_assessments, public.cat_questions, public.cat_attempts, public.cat_answers
  from anon, authenticated;
grant all on public.cat_assessments, public.cat_questions, public.cat_attempts, public.cat_answers
  to service_role;

create or replace function public.create_cat_assessment(
  _course_id uuid,
  _title text,
  _instructions text,
  _duration_minutes integer,
  _opens_at timestamptz,
  _closes_at timestamptz,
  _questions jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  assessment_id uuid;
  question jsonb;
  question_position integer := 0;
begin
  if not public.has_any_role(
    auth.uid(),
    array['super_admin','academic_admin']::public.app_role[]
  ) then
    raise exception 'Only academic staff can create CATs.';
  end if;
  if _course_id is null or not exists (select 1 from public.courses where id = _course_id) then
    raise exception 'Select a valid course.';
  end if;
  if nullif(trim(_title), '') is null or length(trim(_title)) > 160 then
    raise exception 'Enter a CAT title of 1 to 160 characters.';
  end if;
  if _duration_minutes is null or _duration_minutes not between 1 and 360 then
    raise exception 'CAT duration must be between 1 and 360 minutes.';
  end if;
  if _opens_at is null or _opens_at <= now() or _closes_at is null or _closes_at <= _opens_at then
    raise exception 'Choose a future opening time and a closing time after it.';
  end if;
  if _questions is null or jsonb_typeof(_questions) is distinct from 'array' then
    raise exception 'A CAT must contain between 1 and 100 questions.';
  end if;
  if jsonb_array_length(_questions) not between 1 and 100 then
    raise exception 'A CAT must contain between 1 and 100 questions.';
  end if;

  insert into public.cat_assessments(
    course_id, title, instructions, duration_minutes, opens_at, closes_at, created_by
  )
  values (
    _course_id, trim(_title), nullif(trim(_instructions), ''), _duration_minutes,
    _opens_at, _closes_at, auth.uid()
  )
  returning id into assessment_id;

  for question in select value from jsonb_array_elements(_questions)
  loop
    question_position := question_position + 1;
    if jsonb_typeof(question) <> 'object'
      or nullif(trim(question->>'prompt'), '') is null
      or nullif(trim(question->>'option_a'), '') is null
      or nullif(trim(question->>'option_b'), '') is null
      or nullif(trim(question->>'option_c'), '') is null
      or nullif(trim(question->>'option_d'), '') is null
      or upper(coalesce(question->>'correct_option', '')) not in ('A', 'B', 'C', 'D')
      or coalesce((question->>'points')::integer, 0) not between 1 and 100 then
      raise exception 'Question % must have a prompt, four choices, a correct answer, and 1 to 100 points.', question_position;
    end if;
    insert into public.cat_questions(
      assessment_id, prompt, option_a, option_b, option_c, option_d,
      correct_option, points, position
    )
    values (
      assessment_id, trim(question->>'prompt'), trim(question->>'option_a'),
      trim(question->>'option_b'), trim(question->>'option_c'), trim(question->>'option_d'),
      upper(question->>'correct_option'), (question->>'points')::integer, question_position
    );
  end loop;

  return assessment_id;
end;
$$;

create or replace function public.list_my_cats()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  student_record public.students%rowtype;
  cats jsonb;
begin
  if auth.uid() is null then raise exception 'Student sign-in required.'; end if;
  select * into student_record from public.students where user_id = auth.uid();
  if not found or student_record.status <> 'active' then
    raise exception 'An active student record is required to access CATs.';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', assessment.id,
    'title', assessment.title,
    'instructions', assessment.instructions,
    'duration_minutes', assessment.duration_minutes,
    'opens_at', assessment.opens_at,
    'closes_at', assessment.closes_at,
    'attempt_id', attempt.id,
    'started_at', attempt.started_at,
    'submitted_at', attempt.submitted_at,
    'score', case when attempt.submitted_at is not null then attempt.score else null end,
    'max_score', case when attempt.submitted_at is not null then attempt.max_score else null end,
    'available', now() >= assessment.opens_at and now() < assessment.closes_at,
    'in_progress', attempt.id is not null and attempt.submitted_at is null
  ) order by assessment.opens_at desc), '[]'::jsonb)
  into cats
  from public.cat_assessments assessment
  left join public.cat_attempts attempt
    on attempt.assessment_id = assessment.id and attempt.student_id = student_record.id
  where assessment.course_id = student_record.course_id;

  return cats;
end;
$$;

create or replace function public.start_cat_attempt(_assessment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  student_record public.students%rowtype;
  assessment_record public.cat_assessments%rowtype;
  attempt_record public.cat_attempts%rowtype;
  question_list jsonb;
  effective_deadline timestamptz;
begin
  if auth.uid() is null then raise exception 'Student sign-in required.'; end if;
  select * into student_record from public.students where user_id = auth.uid();
  if not found or student_record.status <> 'active' then
    raise exception 'An active student record is required to access CATs.';
  end if;

  select * into assessment_record from public.cat_assessments
  where id = _assessment_id and course_id = student_record.course_id;
  if not found then raise exception 'CAT not found for your course.'; end if;

  select * into attempt_record from public.cat_attempts
  where assessment_id = assessment_record.id and student_id = student_record.id
  for update;

  if not found then
    if now() < assessment_record.opens_at or now() >= assessment_record.closes_at then
      raise exception 'This CAT is not currently available.';
    end if;
    insert into public.cat_attempts(assessment_id, student_id)
    values (assessment_record.id, student_record.id)
    on conflict (assessment_id, student_id) do nothing;
    select * into attempt_record from public.cat_attempts
    where assessment_id = assessment_record.id and student_id = student_record.id
    for update;
  end if;

  effective_deadline := least(
    attempt_record.started_at + make_interval(mins => assessment_record.duration_minutes),
    assessment_record.closes_at
  );

  if attempt_record.submitted_at is null then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', question.id,
      'prompt', question.prompt,
      'options', jsonb_build_array(
        jsonb_build_object('key', 'A', 'text', question.option_a),
        jsonb_build_object('key', 'B', 'text', question.option_b),
        jsonb_build_object('key', 'C', 'text', question.option_c),
        jsonb_build_object('key', 'D', 'text', question.option_d)
      ),
      'points', question.points,
      'selected_option', answer.selected_option
    ) order by question.position), '[]'::jsonb)
    into question_list
    from public.cat_questions question
    left join public.cat_answers answer
      on answer.question_id = question.id and answer.attempt_id = attempt_record.id
    where question.assessment_id = assessment_record.id;
  else
    question_list := '[]'::jsonb;
  end if;

  return jsonb_build_object(
    'id', attempt_record.id,
    'assessment_id', assessment_record.id,
    'title', assessment_record.title,
    'instructions', assessment_record.instructions,
    'duration_minutes', assessment_record.duration_minutes,
    'started_at', attempt_record.started_at,
    'deadline', effective_deadline,
    'submitted_at', attempt_record.submitted_at,
    'score', attempt_record.score,
    'max_score', attempt_record.max_score,
    'questions', question_list
  );
end;
$$;

create or replace function public.save_cat_answer(
  _attempt_id uuid,
  _question_id uuid,
  _selected_option text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  attempt_record public.cat_attempts%rowtype;
  assessment_record public.cat_assessments%rowtype;
begin
  if auth.uid() is null then raise exception 'Student sign-in required.'; end if;
  if _selected_option is null or upper(_selected_option) not in ('A', 'B', 'C', 'D') then
    raise exception 'Choose one of the listed answer options.';
  end if;

  select attempt.* into attempt_record
  from public.cat_attempts attempt
  join public.students student on student.id = attempt.student_id
  where attempt.id = _attempt_id and student.user_id = auth.uid() and student.status = 'active'
  for update of attempt;
  if not found then raise exception 'CAT attempt not found.'; end if;
  if attempt_record.submitted_at is not null then raise exception 'This CAT has already been submitted.'; end if;

  select * into assessment_record from public.cat_assessments
  where id = attempt_record.assessment_id;
  if now() >= least(
    attempt_record.started_at + make_interval(mins => assessment_record.duration_minutes),
    assessment_record.closes_at
  ) then
    raise exception 'The CAT time has expired.';
  end if;
  if not exists (
    select 1 from public.cat_questions
    where id = _question_id and assessment_id = assessment_record.id
  ) then
    raise exception 'Question does not belong to this CAT.';
  end if;

  insert into public.cat_answers(attempt_id, question_id, selected_option)
  values (_attempt_id, _question_id, upper(_selected_option))
  on conflict (attempt_id, question_id) do update
    set selected_option = excluded.selected_option, updated_at = now();
end;
$$;

create or replace function public.submit_cat_attempt(_attempt_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  attempt_record public.cat_attempts%rowtype;
  question_total integer;
  awarded_score integer;
begin
  if auth.uid() is null then raise exception 'Student sign-in required.'; end if;
  select attempt.* into attempt_record
  from public.cat_attempts attempt
  join public.students student on student.id = attempt.student_id
  where attempt.id = _attempt_id and student.user_id = auth.uid() and student.status = 'active'
  for update of attempt;
  if not found then raise exception 'CAT attempt not found.'; end if;

  if attempt_record.submitted_at is null then
    select coalesce(sum(question.points), 0)::integer,
      coalesce(sum(case when answer.selected_option = question.correct_option then question.points else 0 end), 0)::integer
    into question_total, awarded_score
    from public.cat_questions question
    left join public.cat_answers answer
      on answer.question_id = question.id and answer.attempt_id = attempt_record.id
    where question.assessment_id = attempt_record.assessment_id;

    if question_total <= 0 then raise exception 'CAT has no markable questions.'; end if;
    update public.cat_attempts
    set submitted_at = now(), score = awarded_score, max_score = question_total
    where id = attempt_record.id
    returning * into attempt_record;
  end if;

  return jsonb_build_object(
    'submitted_at', attempt_record.submitted_at,
    'score', attempt_record.score,
    'max_score', attempt_record.max_score
  );
end;
$$;

create or replace function public.list_cat_assessments()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cat_list jsonb;
begin
  if not public.has_any_role(
    auth.uid(),
    array['super_admin','academic_admin']::public.app_role[]
  ) then
    raise exception 'Only academic staff can review CATs.';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', assessment.id,
    'course_id', assessment.course_id,
    'course_title', course.title,
    'title', assessment.title,
    'instructions', assessment.instructions,
    'duration_minutes', assessment.duration_minutes,
    'opens_at', assessment.opens_at,
    'closes_at', assessment.closes_at,
    'questions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', question.id,
        'prompt', question.prompt,
        'option_a', question.option_a,
        'option_b', question.option_b,
        'option_c', question.option_c,
        'option_d', question.option_d,
        'correct_option', question.correct_option,
        'points', question.points
      ) order by question.position)
      from public.cat_questions question where question.assessment_id = assessment.id
    ), '[]'::jsonb),
    'attempts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', attempt.id,
        'student_number', student.student_number,
        'student_name', concat_ws(' ', student.first_name, student.middle_name, student.last_name),
        'started_at', attempt.started_at,
        'submitted_at', attempt.submitted_at,
        'score', attempt.score,
        'max_score', attempt.max_score,
        'answers', coalesce((
          select jsonb_agg(jsonb_build_object(
            'question_id', answer.question_id,
            'selected_option', answer.selected_option
          ))
          from public.cat_answers answer where answer.attempt_id = attempt.id
        ), '[]'::jsonb)
      ) order by attempt.started_at desc)
      from public.cat_attempts attempt
      join public.students student on student.id = attempt.student_id
      where attempt.assessment_id = assessment.id
    ), '[]'::jsonb)
  ) order by assessment.created_at desc), '[]'::jsonb)
  into cat_list
  from public.cat_assessments assessment
  join public.courses course on course.id = assessment.course_id;

  return cat_list;
end;
$$;

revoke all on function public.create_cat_assessment(uuid, text, text, integer, timestamptz, timestamptz, jsonb)
  from public, anon;
revoke all on function public.list_my_cats()
  from public, anon;
revoke all on function public.start_cat_attempt(uuid)
  from public, anon;
revoke all on function public.save_cat_answer(uuid, uuid, text)
  from public, anon;
revoke all on function public.submit_cat_attempt(uuid)
  from public, anon;
revoke all on function public.list_cat_assessments()
  from public, anon;
grant execute on function public.create_cat_assessment(uuid, text, text, integer, timestamptz, timestamptz, jsonb)
  to authenticated;
grant execute on function public.list_my_cats()
  to authenticated;
grant execute on function public.start_cat_attempt(uuid)
  to authenticated;
grant execute on function public.save_cat_answer(uuid, uuid, text)
  to authenticated;
grant execute on function public.submit_cat_attempt(uuid)
  to authenticated;
grant execute on function public.list_cat_assessments()
  to authenticated;
