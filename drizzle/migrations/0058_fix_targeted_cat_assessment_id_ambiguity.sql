create or replace function public.create_targeted_cat_assessment(
  _course_id uuid,
  _title text,
  _instructions text,
  _duration_minutes integer,
  _opens_at timestamptz,
  _closes_at timestamptz,
  _questions jsonb,
  _name text,
  _level_ids uuid[],
  _download_file_path text,
  _download_file_name text,
  _unit_id uuid,
  _student_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  created_assessment_id uuid;
  unit_record public.course_units%rowtype;
  effective_level_ids uuid[];
  valid_student_count integer;
begin
  if not public.has_any_role(
    auth.uid(),
    array['super_admin', 'academic_admin']::public.app_role[]
  ) then
    raise exception 'Only academic staff can create CATs.';
  end if;

  if coalesce(cardinality(_student_ids), 0) > 500 then
    raise exception 'A CAT can be assigned to at most 500 individual students.';
  end if;
  if coalesce(cardinality(_student_ids), 0) > 0 then
    if cardinality(_student_ids) <> (
      select count(distinct selected.student_id)
      from unnest(_student_ids) as selected(student_id)
    ) then
      raise exception 'Each student can only be selected once.';
    end if;

    select * into unit_record
    from public.course_units
    where id = _unit_id and course_id = _course_id;
    if not found then
      raise exception 'Select a valid unit for this CAT before choosing students.';
    end if;
    effective_level_ids := case
      when unit_record.level_id is not null then array[unit_record.level_id]
      else coalesce(_level_ids, '{}'::uuid[])
    end;

    select count(distinct student.id)
    into valid_student_count
    from unnest(_student_ids) as selected(student_id)
    join public.students student
      on student.id = selected.student_id
      and student.status = 'active'
    where (
      exists (
        select 1
        from public.enrollments enrollment
        where enrollment.student_id = student.id
          and enrollment.course_id = _course_id
          and enrollment.status = 'active'
          and (
            cardinality(effective_level_ids) = 0
            or enrollment.level_id = any(effective_level_ids)
          )
      )
      or exists (
        select 1
        from public.online_course_enrollments enrollment
        where enrollment.student_id = student.id
          and enrollment.course_id = _course_id
          and enrollment.status = 'active'
          and (
            cardinality(effective_level_ids) = 0
            or enrollment.level_id = any(effective_level_ids)
          )
      )
      or (
        student.course_id = _course_id
        and (
          cardinality(effective_level_ids) = 0
          or student.level_id = any(effective_level_ids)
        )
        and not exists (
          select 1
          from public.enrollments enrollment
          where enrollment.student_id = student.id
            and enrollment.course_id = _course_id
            and enrollment.status = 'active'
            and enrollment.level_id is not null
        )
        and not exists (
          select 1
          from public.online_course_enrollments enrollment
          where enrollment.student_id = student.id
            and enrollment.course_id = _course_id
            and enrollment.status = 'active'
            and enrollment.level_id is not null
        )
      )
    );

    if valid_student_count <> cardinality(_student_ids) then
      raise exception 'Select only active students enrolled in this course and the CAT level.';
    end if;
  end if;

  created_assessment_id := public.create_cat_assessment(
    _course_id,
    _title,
    _instructions,
    _duration_minutes,
    _opens_at,
    _closes_at,
    _questions,
    _name,
    _level_ids,
    _download_file_path,
    _download_file_name,
    _unit_id
  );

  insert into public.cat_assessment_students (assessment_id, student_id)
  select created_assessment_id, selected.student_id
  from unnest(coalesce(_student_ids, '{}'::uuid[])) as selected(student_id);

  delete from public.student_learning_notifications notification
  where notification.source_type = 'cat'
    and notification.source_id = created_assessment_id
    and not exists (
      select 1
      from public.cat_assessment_students target
      where target.assessment_id = created_assessment_id
        and target.student_id = notification.student_id
    );

  return created_assessment_id;
end;
$$;

revoke all on function public.create_targeted_cat_assessment(
  uuid, text, text, integer, timestamptz, timestamptz, jsonb, text, uuid[], text, text, uuid, uuid[]
) from public, anon;
grant execute on function public.create_targeted_cat_assessment(
  uuid, text, text, integer, timestamptz, timestamptz, jsonb, text, uuid[], text, text, uuid, uuid[]
) to authenticated;
