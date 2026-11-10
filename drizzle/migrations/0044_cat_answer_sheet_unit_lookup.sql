create or replace function public.get_cat_answer_sheet_unit(_assessment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  assessment_record public.cat_assessments%rowtype;
  unit_record public.course_units%rowtype;
  attempt_level_id uuid;
  matching_units integer;
  is_student_attempt boolean := false;
  is_authorized_staff boolean := false;
begin
  if auth.uid() is null then
    raise exception 'Sign-in is required to load CAT unit details.';
  end if;

  select * into assessment_record
  from public.cat_assessments
  where id = _assessment_id;
  if not found then
    raise exception 'CAT not found.';
  end if;

  is_authorized_staff :=
    public.has_any_role(
      auth.uid(),
      array['super_admin', 'academic_admin']::public.app_role[]
    )
    or (
      assessment_record.unit_id is not null
      and public.facilitator_unit_permission(
        auth.uid(),
        assessment_record.unit_id,
        'cats'
      )
    );

  select attempt.course_level_id
  into attempt_level_id
  from public.cat_attempts attempt
  join public.students student on student.id = attempt.student_id
  where attempt.assessment_id = assessment_record.id
    and student.user_id = auth.uid()
    and attempt.submitted_at is not null;
  is_student_attempt := found;

  if not is_authorized_staff and not is_student_attempt then
    raise exception 'You are not authorized to view this CAT unit.';
  end if;

  if assessment_record.unit_id is not null then
    select * into unit_record
    from public.course_units unit
    where unit.id = assessment_record.unit_id
      and unit.course_id = assessment_record.course_id;
    if not found then
      raise exception 'The CAT linked unit is no longer available for its course.';
    end if;
    if nullif(btrim(unit_record.code), '') is null then
      raise exception 'The CAT linked unit does not have a configured unit code.';
    end if;
    return jsonb_build_object(
      'unit_name', unit_record.title,
      'unit_code', unit_record.code
    );
  end if;

  select count(*)
  into matching_units
  from public.course_units unit
  where unit.course_id = assessment_record.course_id
    and lower(btrim(unit.title)) in (
      lower(btrim(assessment_record.title)),
      lower(btrim(assessment_record.name))
    )
    and (
      attempt_level_id is null
      or unit.level_id = attempt_level_id
    )
    and (
      assessment_record.level_ids is null
      or unit.level_id = any(assessment_record.level_ids)
    )
    and nullif(btrim(unit.code), '') is not null;

  if matching_units <> 1 then
    raise exception 'A unique unit name and code could not be resolved for this CAT and course level.';
  end if;

  select * into unit_record
  from public.course_units unit
  where unit.course_id = assessment_record.course_id
    and lower(btrim(unit.title)) in (
      lower(btrim(assessment_record.title)),
      lower(btrim(assessment_record.name))
    )
    and (
      attempt_level_id is null
      or unit.level_id = attempt_level_id
    )
    and (
      assessment_record.level_ids is null
      or unit.level_id = any(assessment_record.level_ids)
    )
    and nullif(btrim(unit.code), '') is not null;

  return jsonb_build_object(
    'unit_name', unit_record.title,
    'unit_code', unit_record.code
  );
end;
$$;

revoke all on function public.get_cat_answer_sheet_unit(uuid) from public, anon;
grant execute on function public.get_cat_answer_sheet_unit(uuid) to authenticated;
