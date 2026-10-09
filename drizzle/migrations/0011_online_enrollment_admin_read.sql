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
