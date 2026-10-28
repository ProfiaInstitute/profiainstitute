alter table public.online_course_enrollments
  add column if not exists level_id uuid references public.course_levels(id) on delete set null;

create or replace function public.my_course_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select enrollment.course_id
  from public.enrollments enrollment
  join public.students student on student.id = enrollment.student_id
  where student.user_id = auth.uid()
    and student.status = 'active'
    and enrollment.status = 'active'
  union
  select enrollment.course_id
  from public.online_course_enrollments enrollment
  join public.students student on student.id = enrollment.student_id
  where student.user_id = auth.uid()
    and student.status = 'active'
    and enrollment.status = 'active'
  union
  select student.course_id
  from public.students student
  where student.user_id = auth.uid()
    and student.status = 'active'
    and student.course_id is not null
    and not exists (
      select 1 from public.enrollments enrollment
      where enrollment.student_id = student.id
        and enrollment.course_id = student.course_id
    )
    and not exists (
      select 1 from public.online_course_enrollments enrollment
      where enrollment.student_id = student.id
        and enrollment.course_id = student.course_id
    );
$$;

create or replace function public.student_has_course_level(_course_id uuid, _level_ids uuid[])
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.students student
    left join public.enrollments enrollment
      on enrollment.student_id = student.id
      and enrollment.course_id = _course_id
      and enrollment.status = 'active'
    left join public.online_course_enrollments online_enrollment
      on online_enrollment.student_id = student.id
      and online_enrollment.course_id = _course_id
      and online_enrollment.status = 'active'
    where student.user_id = auth.uid()
      and student.status = 'active'
        and _course_id in (select public.my_course_ids())
      and (
        _level_ids is null
          or enrollment.level_id = any(_level_ids)
          or online_enrollment.level_id = any(_level_ids)
          or (
            student.course_id = _course_id
            and student.level_id = any(_level_ids)
            and not exists (
              select 1 from public.enrollments existing
              where existing.student_id = student.id and existing.course_id = _course_id
                and existing.status = 'active' and existing.level_id is not null
            )
            and not exists (
              select 1 from public.online_course_enrollments existing
              where existing.student_id = student.id and existing.course_id = _course_id
                and existing.status = 'active' and existing.level_id is not null
            )
          )
        )
    );
$$;

create or replace function public.admin_enroll_student_course(
  _student_id uuid,
  _course_id uuid,
  _level_id uuid default null,
  _intake_id uuid default null
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  student_record public.students%rowtype;
  course_record public.courses%rowtype;
  selected_level public.course_levels%rowtype;
  enrollment_id uuid;
  tuition numeric(12, 2);
begin
  if not public.has_any_role(
    auth.uid(),
    array['super_admin','academic_admin']::public.app_role[]
  ) then
    raise exception 'Only academic administrators can enroll students in courses.';
  end if;

  select * into student_record
  from public.students
  where id = _student_id
  for update;
  if not found or student_record.status <> 'active' then
    raise exception 'An active student record is required.';
  end if;

  select * into course_record
  from public.courses
  where id = _course_id;
  if not found then
    raise exception 'The selected course could not be found.';
  end if;

  if _intake_id is not null and not exists (
    select 1 from public.intakes where id = _intake_id
  ) then
    raise exception 'The selected intake could not be found.';
  end if;

  if _level_id is not null then
    select * into selected_level
    from public.course_levels
    where id = _level_id and course_id = _course_id;
    if not found then
      raise exception 'The selected level does not belong to this course.';
    end if;
  end if;

  if student_record.study_mode = 'online' then
    if not course_record.available_online then
      raise exception 'This course is not available in the online study mode.';
    end if;
    if exists (
      select 1 from public.online_course_enrollments
      where student_id = _student_id and course_id = _course_id and status = 'active'
    ) then
      return 'already_enrolled';
    end if;

    tuition := coalesce(selected_level.total_fee, course_record.fees, 0);
    insert into public.online_course_enrollments(
      student_id, course_id, level_id, tuition_fee, certificate_fee, exam_fee, status
    ) values (
      _student_id, _course_id, _level_id, tuition,
      course_record.online_certificate_fee, course_record.online_exam_fee, 'active'
    )
    on conflict (student_id, course_id) do update
      set level_id = excluded.level_id,
          status = 'active'
    returning id into enrollment_id;
  else
    if exists (
      select 1 from public.enrollments
      where student_id = _student_id and course_id = _course_id and status = 'active'
    ) then
      return 'already_enrolled';
    end if;

    insert into public.enrollments(student_id, course_id, level_id, intake_id, status)
    values (_student_id, _course_id, _level_id, _intake_id, 'active')
    returning id into enrollment_id;
  end if;

  update public.students
  set course_id = coalesce(course_id, _course_id),
      level_id = case when course_id is null then _level_id else level_id end,
      intake_id = coalesce(intake_id, _intake_id)
  where id = _student_id;

  insert into public.audit_logs(actor_id, action, entity, entity_id, details)
  values (
    auth.uid(),
    'admin_course_enrollment',
    'enrollments',
    enrollment_id::text,
    jsonb_build_object(
      'course', course_record.title,
      'level', selected_level.name,
      'student_number', student_record.student_number,
      'mode', student_record.study_mode
    )
  );

  if student_record.user_id is not null then
    insert into public.notifications(user_id, title, body, category)
    values (
      student_record.user_id,
      'Course enrollment updated',
      'You have been enrolled in ' || course_record.title || '. Course learning resources will appear in your portal.',
      'academics'
    );
  end if;

  return case when student_record.study_mode = 'online' then 'online' else 'academic' end;
end;
$$;

revoke all on function public.my_course_ids() from public, anon;
revoke all on function public.student_has_course_level(uuid, uuid[]) from public, anon;
revoke all on function public.admin_enroll_student_course(uuid, uuid, uuid, uuid) from public, anon;
grant execute on function public.my_course_ids() to authenticated;
grant execute on function public.student_has_course_level(uuid, uuid[]) to authenticated;
grant execute on function public.admin_enroll_student_course(uuid, uuid, uuid, uuid) to authenticated;

drop policy if exists "materials read" on public.learning_materials;
create policy "materials read" on public.learning_materials
  for select to authenticated using (
    (published and course_id in (select public.my_course_ids()))
    or public.has_any_role(auth.uid(), array['super_admin','academic_admin']::public.app_role[])
  );

drop policy if exists "assign read" on public.assignments;
create policy "assign read" on public.assignments
  for select to authenticated using (
    (
      published
      and course_id in (select public.my_course_ids())
      and public.student_has_course_level(course_id, level_ids)
    )
    or public.has_any_role(auth.uid(), array['super_admin','academic_admin']::public.app_role[])
  );

drop policy if exists "subs own insert" on public.submissions;
create policy "subs own insert" on public.submissions
  for insert to authenticated with check (
    student_id = public.my_student_id()
    and status = 'submitted'
    and grade is null
    and exists (
      select 1 from public.assignments assignment
      where assignment.id = submissions.assignment_id
        and assignment.published
        and assignment.course_id in (select public.my_course_ids())
        and public.student_has_course_level(assignment.course_id, assignment.level_ids)
    )
  );

drop policy if exists "subs own update" on public.submissions;
create policy "subs own update" on public.submissions
  for update to authenticated
  using (student_id = public.my_student_id() and grade is null)
  with check (
    student_id = public.my_student_id()
    and grade is null
    and status = 'submitted'
    and exists (
      select 1 from public.assignments assignment
      where assignment.id = submissions.assignment_id
        and assignment.published
        and assignment.course_id in (select public.my_course_ids())
        and public.student_has_course_level(assignment.course_id, assignment.level_ids)
    )
  );

drop policy if exists "learning read" on storage.objects;
create policy "learning read" on storage.objects
  for select to authenticated using (
    bucket_id = 'learning'
    and (
      public.has_any_role(auth.uid(), array['super_admin','academic_admin']::public.app_role[])
      or (
        (storage.foldername(name))[1] in (
          select enrolled_course.course_id::text
          from public.my_course_ids() as enrolled_course(course_id)
        )
        and (
          not exists (
            select 1 from public.online_course_lessons lesson
            where lesson.file_path = storage.objects.name
          )
          or public.can_access_online_lesson_file(storage.objects.name)
        )
        and public.can_access_learning_assessment_file(name)
      )
    )
  );

create or replace function public.can_access_learning_assessment_file(_path text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then return false; end if;

  if exists (
    select 1 from public.assignments assignment
    where assignment.file_path = _path
      and assignment.course_id in (select public.my_course_ids())
  ) then
    return exists (
      select 1 from public.assignments assignment
      where assignment.file_path = _path
        and assignment.published
        and assignment.course_id in (select public.my_course_ids())
        and public.student_has_course_level(assignment.course_id, assignment.level_ids)
    );
  end if;

  if exists (
    select 1 from public.cat_assessments assessment
    where assessment.download_file_path = _path
      and assessment.course_id in (select public.my_course_ids())
  ) then
    return exists (
      select 1 from public.cat_assessments assessment
      where assessment.download_file_path = _path
        and assessment.course_id in (select public.my_course_ids())
        and public.student_has_course_level(assessment.course_id, assessment.level_ids)
    );
  end if;

  return true;
end;
$$;
revoke all on function public.can_access_learning_assessment_file(text) from public, anon;
grant execute on function public.can_access_learning_assessment_file(text) to authenticated;

drop policy if exists facilitator_students_read on public.students;
create policy facilitator_students_read on public.students
  for select to authenticated using (
    exists (
      select 1
      from public.facilitator_unit_assignments assignment
      join public.course_units unit on unit.id = assignment.unit_id
      left join public.enrollments enrollment
        on enrollment.student_id = students.id
        and enrollment.course_id = unit.course_id
        and enrollment.status = 'active'
      left join public.online_course_enrollments online_enrollment
        on online_enrollment.student_id = students.id
        and online_enrollment.course_id = unit.course_id
        and online_enrollment.status = 'active'
      where assignment.facilitator_id = auth.uid()
        and assignment.active
        and students.status = 'active'
        and (
          exists (
            select 1 from public.enrollments active_enrollment
            where active_enrollment.student_id = students.id
              and active_enrollment.course_id = unit.course_id
              and active_enrollment.status = 'active'
          )
          or exists (
            select 1 from public.online_course_enrollments active_enrollment
            where active_enrollment.student_id = students.id
              and active_enrollment.course_id = unit.course_id
              and active_enrollment.status = 'active'
          )
          or (
            students.course_id = unit.course_id
            and not exists (
              select 1 from public.enrollments existing
              where existing.student_id = students.id and existing.course_id = unit.course_id
            )
            and not exists (
              select 1 from public.online_course_enrollments existing
              where existing.student_id = students.id and existing.course_id = unit.course_id
            )
          )
        )
        and (
          unit.level_id is null
          or unit.level_id = enrollment.level_id
          or unit.level_id = online_enrollment.level_id
          or (
            students.course_id = unit.course_id
            and students.level_id = unit.level_id
            and not exists (
              select 1 from public.enrollments current_enrollment
              where current_enrollment.student_id = students.id
                and current_enrollment.course_id = unit.course_id
                and current_enrollment.status = 'active'
                and current_enrollment.level_id is not null
            )
            and not exists (
              select 1 from public.online_course_enrollments current_enrollment
              where current_enrollment.student_id = students.id
                and current_enrollment.course_id = unit.course_id
                and current_enrollment.status = 'active'
                and current_enrollment.level_id is not null
            )
          )
        )
    )
  );

drop policy if exists facilitator_submissions_grade on public.submissions;
create policy facilitator_submissions_grade on public.submissions
  for update to authenticated
  using (
    exists (
      select 1
      from public.assignments assignment
      join public.course_units unit on unit.id = assignment.unit_id
      join public.students student on student.id = submissions.student_id
      where assignment.id = submissions.assignment_id
        and assignment.course_id = unit.course_id
        and unit.course_id in (
          select enrollment.course_id from public.enrollments enrollment
          where enrollment.student_id = student.id and enrollment.status = 'active'
          union
          select enrollment.course_id from public.online_course_enrollments enrollment
          where enrollment.student_id = student.id and enrollment.status = 'active'
          union
          select student.course_id where student.course_id is not null
            and not exists (
              select 1 from public.enrollments enrollment
              where enrollment.student_id = student.id and enrollment.course_id = student.course_id
            )
            and not exists (
              select 1 from public.online_course_enrollments enrollment
              where enrollment.student_id = student.id and enrollment.course_id = student.course_id
            )
        )
        and student.status = 'active'
        and (
          unit.level_id is null
          or exists (
            select 1 from public.enrollments enrollment
            where enrollment.student_id = student.id
              and enrollment.course_id = unit.course_id
              and enrollment.status = 'active'
              and enrollment.level_id = unit.level_id
          )
          or exists (
            select 1 from public.online_course_enrollments enrollment
            where enrollment.student_id = student.id
              and enrollment.course_id = unit.course_id
              and enrollment.status = 'active'
              and enrollment.level_id = unit.level_id
          )
          or (
            student.course_id = unit.course_id
            and student.level_id = unit.level_id
            and not exists (
              select 1 from public.enrollments enrollment
              where enrollment.student_id = student.id
                and enrollment.course_id = unit.course_id
                and enrollment.status = 'active' and enrollment.level_id is not null
            )
            and not exists (
              select 1 from public.online_course_enrollments enrollment
              where enrollment.student_id = student.id
                and enrollment.course_id = unit.course_id
                and enrollment.status = 'active' and enrollment.level_id is not null
            )
          )
        )
        and public.facilitator_unit_permission(auth.uid(), unit.id, 'assignments')
    )
  )
  with check (
    exists (
      select 1
      from public.assignments assignment
      join public.course_units unit on unit.id = assignment.unit_id
      join public.students student on student.id = submissions.student_id
      where assignment.id = submissions.assignment_id
        and assignment.course_id = unit.course_id
        and unit.course_id in (
          select enrollment.course_id from public.enrollments enrollment
          where enrollment.student_id = student.id and enrollment.status = 'active'
          union
          select enrollment.course_id from public.online_course_enrollments enrollment
          where enrollment.student_id = student.id and enrollment.status = 'active'
          union
          select student.course_id where student.course_id is not null
            and not exists (
              select 1 from public.enrollments enrollment
              where enrollment.student_id = student.id and enrollment.course_id = student.course_id
            )
            and not exists (
              select 1 from public.online_course_enrollments enrollment
              where enrollment.student_id = student.id and enrollment.course_id = student.course_id
            )
        )
        and student.status = 'active'
        and (
          unit.level_id is null
          or exists (
            select 1 from public.enrollments enrollment
            where enrollment.student_id = student.id
              and enrollment.course_id = unit.course_id
              and enrollment.status = 'active'
              and enrollment.level_id = unit.level_id
          )
          or exists (
            select 1 from public.online_course_enrollments enrollment
            where enrollment.student_id = student.id
              and enrollment.course_id = unit.course_id
              and enrollment.status = 'active'
              and enrollment.level_id = unit.level_id
          )
          or (
            student.course_id = unit.course_id
            and student.level_id = unit.level_id
            and not exists (
              select 1 from public.enrollments enrollment
              where enrollment.student_id = student.id
                and enrollment.course_id = unit.course_id
                and enrollment.status = 'active' and enrollment.level_id is not null
            )
            and not exists (
              select 1 from public.online_course_enrollments enrollment
              where enrollment.student_id = student.id
                and enrollment.course_id = unit.course_id
                and enrollment.status = 'active' and enrollment.level_id is not null
            )
          )
        )
        and public.facilitator_unit_permission(auth.uid(), unit.id, 'assignments')
    )
  );

drop policy if exists facilitator_results_read on public.results;
create policy facilitator_results_read on public.results
  for select to authenticated using (
    unit_id is not null
    and exists (
      select 1
      from public.course_units unit
      join public.students student on student.id = results.student_id
      where unit.id = results.unit_id
        and (
          exists (
            select 1 from public.enrollments enrollment
            where enrollment.student_id = student.id
              and enrollment.course_id = unit.course_id and enrollment.status = 'active'
              and (unit.level_id is null or enrollment.level_id = unit.level_id)
          )
          or exists (
            select 1 from public.online_course_enrollments enrollment
            where enrollment.student_id = student.id
              and enrollment.course_id = unit.course_id and enrollment.status = 'active'
              and (unit.level_id is null or enrollment.level_id = unit.level_id)
          )
          or (
            student.course_id = unit.course_id and student.status = 'active'
            and (unit.level_id is null or unit.level_id = student.level_id)
            and not exists (
              select 1 from public.enrollments enrollment
              where enrollment.student_id = student.id and enrollment.course_id = unit.course_id
            )
            and not exists (
              select 1 from public.online_course_enrollments enrollment
              where enrollment.student_id = student.id and enrollment.course_id = unit.course_id
            )
          )
        )
    )
    and public.facilitator_unit_permission(auth.uid(), unit_id, 'results')
  );

drop policy if exists facilitator_results_manage on public.results;
create policy facilitator_results_manage on public.results
  for insert to authenticated with check (
    unit_id is not null
    and exists (
      select 1
      from public.course_units unit
      join public.students student on student.id = results.student_id
      where unit.id = results.unit_id
        and (
          exists (
            select 1 from public.enrollments enrollment
            where enrollment.student_id = student.id
              and enrollment.course_id = unit.course_id and enrollment.status = 'active'
              and (unit.level_id is null or enrollment.level_id = unit.level_id)
          )
          or exists (
            select 1 from public.online_course_enrollments enrollment
            where enrollment.student_id = student.id
              and enrollment.course_id = unit.course_id and enrollment.status = 'active'
              and (unit.level_id is null or enrollment.level_id = unit.level_id)
          )
          or (
            student.course_id = unit.course_id and student.status = 'active'
            and (unit.level_id is null or unit.level_id = student.level_id)
            and not exists (
              select 1 from public.enrollments enrollment
              where enrollment.student_id = student.id and enrollment.course_id = unit.course_id
            )
            and not exists (
              select 1 from public.online_course_enrollments enrollment
              where enrollment.student_id = student.id and enrollment.course_id = unit.course_id
            )
          )
        )
    )
    and public.facilitator_unit_permission(auth.uid(), unit_id, 'results')
  );

create or replace function public.facilitator_can_message_student(_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null and exists (
    select 1
    from public.facilitator_unit_assignments assignment
    join public.course_units unit on unit.id = assignment.unit_id
    join public.user_roles role on role.user_id = assignment.facilitator_id and role.role::text = 'facilitator'
    where assignment.facilitator_id = auth.uid()
      and assignment.active
      and (
        exists (
          select 1 from public.enrollments active_enrollment
          where active_enrollment.student_id = _student_id
            and active_enrollment.course_id = unit.course_id
            and active_enrollment.status = 'active'
        )
        or exists (
          select 1 from public.online_course_enrollments active_enrollment
          where active_enrollment.student_id = _student_id
            and active_enrollment.course_id = unit.course_id
            and active_enrollment.status = 'active'
        )
        or exists (
          select 1 from public.students primary_student
          where primary_student.id = _student_id
            and primary_student.course_id = unit.course_id
            and not exists (
              select 1 from public.enrollments existing
              where existing.student_id = primary_student.id and existing.course_id = unit.course_id
            )
            and not exists (
              select 1 from public.online_course_enrollments existing
              where existing.student_id = primary_student.id and existing.course_id = unit.course_id
            )
        )
      )
      and (unit.level_id is null or exists (
        select 1 from public.enrollments enrollment
        left join public.online_course_enrollments online_enrollment
          on online_enrollment.student_id = enrollment.student_id
          and online_enrollment.course_id = unit.course_id
          and online_enrollment.status = 'active'
        join public.students student on student.id = _student_id
        where enrollment.student_id = _student_id
          and enrollment.course_id = unit.course_id
          and enrollment.status = 'active'
          and enrollment.level_id = unit.level_id
        union all
        select 1 from public.online_course_enrollments enrollment
        where enrollment.student_id = _student_id
          and enrollment.course_id = unit.course_id
          and enrollment.status = 'active'
          and enrollment.level_id = unit.level_id
        union all
        select 1 from public.students student
        where student.id = _student_id
          and student.course_id = unit.course_id
          and student.level_id = unit.level_id
          and not exists (
            select 1 from public.enrollments enrollment
            where enrollment.student_id = student.id and enrollment.course_id = unit.course_id
              and enrollment.status = 'active' and enrollment.level_id is not null
          )
          and not exists (
            select 1 from public.online_course_enrollments enrollment
            where enrollment.student_id = student.id and enrollment.course_id = unit.course_id
              and enrollment.status = 'active' and enrollment.level_id is not null
          )
      ))
      and exists (select 1 from public.students student where student.id = _student_id and student.status = 'active')
  );
$$;
grant execute on function public.facilitator_can_message_student(uuid) to authenticated;

create or replace function public.facilitator_can_access_student_unit(
  _student_id uuid,
  _unit_id uuid,
  _permission text
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null
    and _permission in ('assignments', 'results')
    and exists (
      select 1
      from public.facilitator_unit_assignments assignment
      join public.course_units unit on unit.id = assignment.unit_id
      join public.students student on student.id = _student_id
      where assignment.facilitator_id = auth.uid()
        and assignment.active
        and unit.id = _unit_id
        and student.status = 'active'
        and public.facilitator_unit_permission(auth.uid(), unit.id, _permission)
        and (
          exists (
            select 1 from public.enrollments enrollment
            where enrollment.student_id = student.id
              and enrollment.course_id = unit.course_id
              and enrollment.status = 'active'
              and (unit.level_id is null or enrollment.level_id = unit.level_id)
          )
          or exists (
            select 1 from public.online_course_enrollments enrollment
            where enrollment.student_id = student.id
              and enrollment.course_id = unit.course_id
              and enrollment.status = 'active'
              and (unit.level_id is null or enrollment.level_id = unit.level_id)
          )
          or (
            student.course_id = unit.course_id
            and (unit.level_id is null or student.level_id = unit.level_id)
            and not exists (
              select 1 from public.enrollments enrollment
              where enrollment.student_id = student.id
                and enrollment.course_id = unit.course_id
                and enrollment.status = 'active' and enrollment.level_id is not null
            )
            and not exists (
              select 1 from public.online_course_enrollments enrollment
              where enrollment.student_id = student.id
                and enrollment.course_id = unit.course_id
                and enrollment.status = 'active' and enrollment.level_id is not null
            )
          )
        )
    );
$$;
revoke all on function public.facilitator_can_access_student_unit(uuid, uuid, text)
  from public, anon;
grant execute on function public.facilitator_can_access_student_unit(uuid, uuid, text)
  to authenticated;

drop policy if exists facilitator_students_read on public.students;
create policy facilitator_students_read on public.students
  for select to authenticated
  using (public.facilitator_can_message_student(id));

drop policy if exists facilitator_submissions_grade on public.submissions;
create policy facilitator_submissions_grade on public.submissions
  for update to authenticated
  using (
    exists (
      select 1 from public.assignments assignment
      where assignment.id = submissions.assignment_id
        and assignment.unit_id is not null
        and public.facilitator_can_access_student_unit(
          submissions.student_id, assignment.unit_id, 'assignments'
        )
    )
  )
  with check (
    exists (
      select 1 from public.assignments assignment
      where assignment.id = submissions.assignment_id
        and assignment.unit_id is not null
        and public.facilitator_can_access_student_unit(
          submissions.student_id, assignment.unit_id, 'assignments'
        )
    )
  );

drop policy if exists facilitator_results_read on public.results;
create policy facilitator_results_read on public.results
  for select to authenticated
  using (
    unit_id is not null
    and public.facilitator_can_access_student_unit(student_id, unit_id, 'results')
  );

drop policy if exists facilitator_results_manage on public.results;
create policy facilitator_results_manage on public.results
  for insert to authenticated
  with check (
    unit_id is not null
    and public.facilitator_can_access_student_unit(student_id, unit_id, 'results')
  );

drop policy if exists facilitator_submission_storage_read on storage.objects;
create policy facilitator_submission_storage_read on storage.objects
  for select to authenticated using (
    bucket_id = 'submissions'
    and exists (
      select 1
      from public.assignments assignment
      join public.students student
        on student.id::text = (storage.foldername(name))[1]
      where assignment.id::text = (storage.foldername(name))[2]
        and assignment.unit_id is not null
        and public.facilitator_can_access_student_unit(
          student.id, assignment.unit_id, 'assignments'
        )
    )
  );

drop function if exists public.list_my_cats();
create function public.list_my_cats(_course_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
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
    'name', assessment.name,
    'download_file_path', assessment.download_file_path,
    'download_file_name', assessment.download_file_name,
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
  where (_course_id is null or assessment.course_id = _course_id)
    and assessment.course_id in (select public.my_course_ids())
    and public.student_has_course_level(assessment.course_id, assessment.level_ids);

  return cats;
end;
$$;

create or replace function public.start_cat_attempt(_assessment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
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
  where id = _assessment_id
    and course_id in (select public.my_course_ids())
    and public.student_has_course_level(course_id, level_ids);
  if not found then
    raise exception 'CAT not found for your enrolled course level.';
  end if;

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

revoke all on function public.list_my_cats(uuid) from public, anon;
revoke all on function public.start_cat_attempt(uuid) from public, anon;
grant execute on function public.list_my_cats(uuid) to authenticated;
grant execute on function public.start_cat_attempt(uuid) to authenticated;
