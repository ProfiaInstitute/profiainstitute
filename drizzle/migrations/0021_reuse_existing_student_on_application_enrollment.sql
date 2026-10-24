alter table public.enrollments
  add column if not exists application_id uuid
  references public.applications(id) on delete set null;

create unique index if not exists enrollments_application_id_key
  on public.enrollments(application_id)
  where application_id is not null;

create or replace function public.enroll_application(_application_id uuid) returns uuid
language plpgsql security definer set search_path=public as $$
declare
  a public.applications;
  sid uuid;
  email_matches int;
  enrollment_id uuid;
begin
  if not public.has_any_role(
    auth.uid(),
    array['super_admin','admissions_admin','academic_admin']::public.app_role[]
  ) then
    raise exception 'Forbidden';
  end if;

  select * into a
    from public.applications
   where id = _application_id
   for update;
  if not found then raise exception 'Not found'; end if;
  perform pg_advisory_xact_lock(hashtext(lower(a.email)));

  select id into sid
    from public.students
   where application_id = a.id
   for update;
  if sid is null then
    select count(*) into email_matches
      from public.students
     where lower(email) = lower(a.email);
    if email_matches > 1 then
      raise exception 'Multiple student records match this application email. Resolve the duplicate records before enrollment.';
    elsif email_matches = 1 then
      select id into sid
        from public.students
       where lower(email) = lower(a.email)
       for update;
    end if;
  end if;

  if sid is null then
    insert into public.students(
      student_number, application_id, first_name, middle_name, last_name, email,
      phone, alt_phone, national_id, date_of_birth, gender, county, town, address,
      course_id, intake_id, study_mode, current_semester
    ) values (
      public.next_student_number(), a.id, a.first_name, a.middle_name, a.last_name, a.email,
      a.phone, a.alt_phone, a.national_id, a.date_of_birth, a.gender, a.county, a.town, a.address,
      a.course_id, a.intake_id, a.study_mode, 'Semester 1'
    )
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
     limit 1
     for update;
    if enrollment_id is null then
      select id into enrollment_id
        from public.enrollments
       where student_id = sid
         and course_id = a.course_id
         and intake_id is not distinct from a.intake_id
         and status = 'active'
         and application_id is null
       order by created_at desc, id desc
       limit 1
       for update;
    end if;
    if enrollment_id is null then
      insert into public.enrollments(student_id, application_id, course_id, intake_id)
      values (sid, a.id, a.course_id, a.intake_id);
    else
      update public.enrollments
         set application_id = a.id
       where id = enrollment_id
         and application_id is null;
    end if;
  end if;

  update public.applications
     set status = 'enrolled'
   where id = a.id
     and status <> 'enrolled';
  return sid;
end;
$$;
