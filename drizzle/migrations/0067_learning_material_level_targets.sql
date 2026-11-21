alter table public.learning_materials
  add column if not exists level_ids uuid[];

create or replace function public.validate_learning_material_target()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  target_unit record;
begin
  if new.level_ids is null then
    return new;
  end if;

  if cardinality(new.level_ids) = 0 or new.unit_id is null then
    raise exception 'Targeted learning materials require a course unit and at least one course level.';
  end if;

  select unit.course_id, unit.level_id
  into target_unit
  from public.course_units unit
  where unit.id = new.unit_id;

  if not found or target_unit.course_id <> new.course_id then
    raise exception 'The selected course unit does not belong to the selected course.';
  end if;

  if exists (
    select 1
    from unnest(new.level_ids) selected(level_id)
    left join public.course_levels level on level.id = selected.level_id
    where level.id is null or level.course_id <> new.course_id
  ) then
    raise exception 'Every target level must belong to the selected course.';
  end if;

  if target_unit.level_id is not null
    and (cardinality(new.level_ids) <> 1 or target_unit.level_id <> any(new.level_ids)) then
    raise exception 'The selected unit is only available to its assigned course level.';
  end if;

  return new;
end;
$$;

create trigger learning_material_target_validation
  before insert or update
  on public.learning_materials
  for each row execute function public.validate_learning_material_target();

drop policy if exists "materials read" on public.learning_materials;
create policy "materials read" on public.learning_materials
  for select to authenticated using (
    (
      published
      and course_id in (select public.my_course_ids())
      and public.student_has_course_level(course_id, level_ids)
    )
    or public.has_any_role(
      auth.uid(),
      array['super_admin','academic_admin']::public.app_role[]
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
    select 1 from public.learning_materials material
    where material.file_path = _path
  ) then
    return exists (
      select 1 from public.learning_materials material
      where material.file_path = _path
        and material.published
        and material.course_id in (select public.my_course_ids())
        and public.student_has_course_level(material.course_id, material.level_ids)
    );
  end if;

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

drop policy if exists "learning read" on storage.objects;
create policy "learning read" on storage.objects
  for select to authenticated using (
    bucket_id = 'learning'
    and (
      public.has_any_role(
        auth.uid(),
        array['super_admin','academic_admin']::public.app_role[]
      )
      or (
        (
          (storage.foldername(name))[1] in (
            select enrolled_course.course_id::text
            from public.my_course_ids() as enrolled_course(course_id)
          )
          or exists (
            select 1 from public.learning_materials material
            where material.file_path = storage.objects.name
              and material.published
              and material.course_id in (select public.my_course_ids())
              and public.student_has_course_level(material.course_id, material.level_ids)
          )
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
