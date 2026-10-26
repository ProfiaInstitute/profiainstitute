create table if not exists public.course_levels (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  name text not null,
  code text,
  description text,
  fee_items jsonb not null default '[]'::jsonb check (jsonb_typeof(fee_items) = 'array'),
  total_fee numeric(12, 2) not null default 0 check (total_fee >= 0),
  fee_structure_url text,
  fee_structure_path text,
  sort_order integer not null default 0,
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (course_id, name)
);

create index if not exists course_levels_course_sort_idx
  on public.course_levels(course_id, sort_order, name);

alter table public.course_units
  add column if not exists level_id uuid references public.course_levels(id) on delete cascade;
alter table public.applications
  add column if not exists level_id uuid references public.course_levels(id) on delete set null;
alter table public.students
  add column if not exists level_id uuid references public.course_levels(id) on delete set null;
alter table public.enrollments
  add column if not exists level_id uuid references public.course_levels(id) on delete set null;

create index if not exists course_units_level_sort_idx
  on public.course_units(level_id, sort_order);
create index if not exists students_level_id_idx
  on public.students(level_id);
create index if not exists enrollments_level_id_idx
  on public.enrollments(level_id);

grant select on public.course_levels to anon, authenticated;
grant insert, update, delete on public.course_levels to authenticated;
grant all on public.course_levels to service_role;
alter table public.course_levels enable row level security;

drop policy if exists course_levels_read on public.course_levels;
create policy course_levels_read on public.course_levels
  for select to anon, authenticated
  using (published or public.is_staff(auth.uid()));

drop policy if exists course_levels_manage on public.course_levels;
create policy course_levels_manage on public.course_levels
  for all to authenticated
  using (public.has_any_role(auth.uid(), array['super_admin','academic_admin']::public.app_role[]))
  with check (public.has_any_role(auth.uid(), array['super_admin','academic_admin']::public.app_role[]));

drop trigger if exists course_levels_updated_at on public.course_levels;
create trigger course_levels_updated_at before update on public.course_levels
  for each row execute function public.touch_updated_at();

insert into public.course_levels(course_id, name, code, description, total_fee, sort_order)
select c.id, 'Level 1', 'L1', 'Course units currently configured for this course.', coalesce(c.fees, 0), 1
from public.courses c
where not exists (select 1 from public.course_levels l where l.course_id = c.id);

update public.course_units u
set level_id = levels.id
from (
  select distinct on (course_id) id, course_id
  from public.course_levels
  order by course_id, sort_order, created_at
) levels
where u.course_id = levels.course_id and u.level_id is null;

update public.applications a
set level_id = levels.id
from (
  select distinct on (course_id) id, course_id
  from public.course_levels
  order by course_id, sort_order, created_at
) levels
where a.course_id = levels.course_id and a.level_id is null;

update public.students s
set level_id = a.level_id
from public.applications a
where a.id = s.application_id and s.level_id is null and a.level_id is not null;

update public.enrollments e
set level_id = a.level_id
from public.applications a
where a.id = e.application_id and e.level_id is null and a.level_id is not null;

create or replace function public.submit_application(p jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  num text;
  rec public.applications;
  v_course uuid;
  v_level uuid;
  v_school uuid;
  v_intake uuid;
  v_study_mode public.study_mode;
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
  v_level := nullif(p->>'level_id','')::uuid;
  if v_course is null then raise exception 'Please choose a course'; end if;
  if v_level is null then raise exception 'Please choose a course level'; end if;
  select c.school_id into v_school
  from public.courses c
  join public.course_levels l on l.course_id = c.id and l.id = v_level and l.published
  where c.id = v_course and c.published and c.application_enabled;
  if v_school is null then raise exception 'Selected course or level is not accepting applications'; end if;
  v_study_mode := coalesce(nullif(p->>'study_mode',''),'full_time')::public.study_mode;
  if v_study_mode = 'online' and not exists (
    select 1 from public.courses c where c.id = v_course and c.available_online
  ) then
    raise exception 'Online study is not available for the selected course';
  end if;
  v_intake := nullif(p->>'intake_id','')::uuid;
  if v_intake is not null and not exists (
    select 1 from public.intakes
    where id=v_intake and is_open
      and (application_deadline is null or application_deadline >= current_date)
  ) then raise exception 'Selected intake is not accepting applications'; end if;

  num := 'PRF-' || to_char(now(),'YYYY') || '-' || lpad(nextval('public.application_seq')::text, 5, '0');
  insert into public.applications(application_number, first_name, middle_name, last_name, date_of_birth, gender, national_id, phone, alt_phone, email,
    county, town, address, highest_qualification, institution_attended, year_completed, kcse_grade, course_id, level_id, school_id, intake_id, study_mode,
    previous_training, work_experience, special_requirements, heard_about)
  values (num, trim(p->>'first_name'), nullif(trim(p->>'middle_name'),''), trim(p->>'last_name'), nullif(p->>'date_of_birth','')::date, left(p->>'gender',20),
    left(p->>'national_id',30), trim(p->>'phone'), left(p->>'alt_phone',20), lower(trim(p->>'email')), left(p->>'county',60), left(p->>'town',60), left(p->>'address',300),
    left(p->>'highest_qualification',120), left(p->>'institution_attended',160), nullif(p->>'year_completed','')::int, left(p->>'kcse_grade',4),
    v_course, v_level, v_school, v_intake, v_study_mode,
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

create or replace function public.enroll_application(_application_id uuid) returns uuid
language plpgsql security definer set search_path=public as $$
declare
  a public.applications;
  sid uuid;
  email_matches int;
  v_enrollment_id uuid;
  v_level_fee numeric(12, 2);
begin
  if not public.has_any_role(auth.uid(), array['super_admin','admissions_admin','academic_admin']::public.app_role[]) then
    raise exception 'Forbidden';
  end if;
  select * into a from public.applications where id = _application_id for update;
  if not found then raise exception 'Not found'; end if;
  if a.course_id is not null and (a.level_id is null or not exists (
    select 1 from public.course_levels where id = a.level_id and course_id = a.course_id
  )) then
    raise exception 'The application has no valid course level. Update the application before enrolling.';
  end if;
  perform pg_advisory_xact_lock(hashtext(lower(a.email)));

  select id into sid from public.students where application_id = a.id for update;
  if sid is null then
    select count(*) into email_matches from public.students where lower(email) = lower(a.email);
    if email_matches > 1 then
      raise exception 'Multiple student records match this application email. Resolve the duplicate records before enrollment.';
    elsif email_matches = 1 then
      select id into sid from public.students where lower(email) = lower(a.email) for update;
    end if;
  end if;

  if sid is null then
    insert into public.students(student_number, application_id, first_name, middle_name, last_name, email, phone, alt_phone, national_id, date_of_birth, gender, county, town, address, course_id, level_id, intake_id, study_mode, current_semester)
    values (public.next_student_number(), a.id, a.first_name, a.middle_name, a.last_name, a.email, a.phone, a.alt_phone, a.national_id, a.date_of_birth, a.gender, a.county, a.town, a.address, a.course_id, a.level_id, a.intake_id, a.study_mode, 'Semester 1')
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
      level_id = coalesce(a.level_id, level_id),
      intake_id = coalesce(a.intake_id, intake_id),
      study_mode = a.study_mode,
      current_semester = coalesce(current_semester, 'Semester 1')
    where id = sid;
  end if;

  if a.course_id is not null then
    if a.study_mode <> 'online' then
      select id into v_enrollment_id
        from public.enrollments
       where application_id = a.id
       order by created_at desc, id desc limit 1 for update;
      if v_enrollment_id is null then
        select id into v_enrollment_id
          from public.enrollments
         where student_id = sid and course_id = a.course_id
           and intake_id is not distinct from a.intake_id and status = 'active' and application_id is null
         order by created_at desc, id desc limit 1 for update;
      end if;
      if v_enrollment_id is null then
        insert into public.enrollments(student_id, application_id, course_id, level_id, intake_id)
        values (sid, a.id, a.course_id, a.level_id, a.intake_id)
        returning id into v_enrollment_id;
      else
        update public.enrollments
           set application_id = a.id, level_id = a.level_id
         where id = v_enrollment_id;
      end if;
    end if;

    if a.study_mode = 'online' then
      select total_fee into v_level_fee from public.course_levels where id = a.level_id;
      insert into public.online_course_enrollments(student_id, course_id, tuition_fee, certificate_fee, exam_fee)
      select sid, c.id, coalesce(v_level_fee, c.fees, 0), c.online_certificate_fee, c.online_exam_fee
        from public.courses c where c.id = a.course_id and c.available_online
      on conflict (student_id, course_id) do nothing;
    end if;
  end if;

  update public.applications set status = 'enrolled' where id = a.id and status <> 'enrolled';
  return sid;
end $$;
grant execute on function public.enroll_application(uuid) to authenticated;

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
  select c.title, coalesce(l.total_fee, c.fees)
    into v_course_title, v_amount
    from public.courses c
    left join public.course_levels l on l.id = new.level_id and l.course_id = c.id
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
create trigger bill_course_enrollment_fee after insert on public.enrollments
  for each row execute function public.bill_course_enrollment_fee();

insert into public.fees(student_id, description, amount, enrollment_id, charge_key)
select e.student_id, 'Course fee · ' || c.title, coalesce(l.total_fee, c.fees), e.id, 'course_fee'
from public.enrollments e
join public.courses c on c.id = e.course_id
left join public.course_levels l on l.id = e.level_id and l.course_id = c.id
where coalesce(l.total_fee, c.fees, 0) > 0
on conflict (enrollment_id) do nothing;

insert into public.online_course_enrollments(student_id, course_id, tuition_fee, certificate_fee, exam_fee)
select s.id, c.id, coalesce(l.total_fee, c.fees, 0), c.online_certificate_fee, c.online_exam_fee
from public.students s
join public.courses c on c.id = s.course_id and c.available_online
left join public.course_levels l on l.id = s.level_id and l.course_id = c.id
where s.study_mode = 'online'
on conflict (student_id, course_id) do nothing;

insert into public.fees(student_id, description, amount, online_enrollment_id, charge_key)
select oe.student_id, charge.description, charge.amount, oe.id, charge.key
from public.online_course_enrollments oe
join public.courses c on c.id = oe.course_id
cross join lateral (values
  ('tuition', 'Course tuition · ' || c.title, oe.tuition_fee),
  ('exam_fee', 'Examination fee · ' || c.title, oe.exam_fee),
  ('certificate_fee', 'Certificate fee · ' || c.title, oe.certificate_fee)
) as charge(key, description, amount)
where charge.amount > 0
on conflict (online_enrollment_id, charge_key) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('course-fee-structures', 'course-fee-structures', true, 10485760, array['application/pdf']::text[])
on conflict (id) do update
set name = excluded.name, public = excluded.public, file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists course_fee_structures_read on storage.objects;
create policy course_fee_structures_read on storage.objects for select to anon, authenticated
  using (bucket_id = 'course-fee-structures');
drop policy if exists course_fee_structures_insert on storage.objects;
create policy course_fee_structures_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'course-fee-structures'
    and public.has_any_role(auth.uid(), array['super_admin','academic_admin']::public.app_role[]));
drop policy if exists course_fee_structures_update on storage.objects;
create policy course_fee_structures_update on storage.objects for update to authenticated
  using (bucket_id = 'course-fee-structures'
    and public.has_any_role(auth.uid(), array['super_admin','academic_admin']::public.app_role[]))
  with check (bucket_id = 'course-fee-structures'
    and public.has_any_role(auth.uid(), array['super_admin','academic_admin']::public.app_role[]));
drop policy if exists course_fee_structures_delete on storage.objects;
create policy course_fee_structures_delete on storage.objects for delete to authenticated
  using (bucket_id = 'course-fee-structures'
    and public.has_any_role(auth.uid(), array['super_admin','academic_admin']::public.app_role[]));

drop policy if exists "media obj write" on storage.objects;
create policy "media obj write" on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and (
    public.has_any_role(auth.uid(), array['super_admin','content_admin']::public.app_role[])
    or (public.has_role(auth.uid(), 'academic_admin') and (storage.foldername(name))[1] = 'courses')
  ));
drop policy if exists "media obj update" on storage.objects;
create policy "media obj update" on storage.objects for update to authenticated
  using (bucket_id = 'media' and (
    public.has_any_role(auth.uid(), array['super_admin','content_admin']::public.app_role[])
    or (public.has_role(auth.uid(), 'academic_admin') and (storage.foldername(name))[1] = 'courses')
  ))
  with check (bucket_id = 'media' and (
    public.has_any_role(auth.uid(), array['super_admin','content_admin']::public.app_role[])
    or (public.has_role(auth.uid(), 'academic_admin') and (storage.foldername(name))[1] = 'courses')
  ));
drop policy if exists "media obj delete" on storage.objects;
create policy "media obj delete" on storage.objects for delete to authenticated
  using (bucket_id = 'media' and (
    public.has_any_role(auth.uid(), array['super_admin','content_admin']::public.app_role[])
    or (public.has_role(auth.uid(), 'academic_admin') and (storage.foldername(name))[1] = 'courses')
  ));
