
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
declare a public.applications; sid uuid;
begin
  if not public.has_any_role(auth.uid(), array['super_admin','admissions_admin','academic_admin']::public.app_role[]) then raise exception 'Forbidden'; end if;
  select * into a from public.applications where id=_application_id;
  if not found then raise exception 'Not found'; end if;
  select id into sid from public.students where application_id = a.id;
  if sid is not null then return sid; end if;
  insert into public.students(student_number, application_id, first_name, middle_name, last_name, email, phone, alt_phone, national_id, date_of_birth, gender, county, town, address, course_id, intake_id, study_mode, current_semester)
  values (public.next_student_number(), a.id, a.first_name, a.middle_name, a.last_name, a.email, a.phone, a.alt_phone, a.national_id, a.date_of_birth, a.gender, a.county, a.town, a.address, a.course_id, a.intake_id, a.study_mode, 'Semester 1')
  returning id into sid;
  if a.course_id is not null then insert into public.enrollments(student_id, course_id, intake_id) values (sid, a.course_id, a.intake_id); end if;
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
create policy "ann public" on public.announcements for select to anon, authenticated using ((published and (show_public or show_on_homepage)) or public.is_staff(auth.uid()));
create policy "ann students" on public.announcements for select to authenticated using (published and show_to_students and public.my_student_id() is not null);
create policy "ann write" on public.announcements for all to authenticated using (public.has_any_role(auth.uid(), array['super_admin','content_admin']::public.app_role[])) with check (public.has_any_role(auth.uid(), array['super_admin','content_admin']::public.app_role[]));
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
create policy "art public" on public.articles for select to anon, authenticated using ((status in ('published','scheduled') and published_at <= now()) or public.has_any_role(auth.uid(), array['super_admin','content_admin']::public.app_role[]));
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
