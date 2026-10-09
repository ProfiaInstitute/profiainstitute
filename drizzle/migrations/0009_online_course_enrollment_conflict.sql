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
