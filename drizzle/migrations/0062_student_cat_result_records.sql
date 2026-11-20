create or replace function public.list_student_cat_results(_student_id uuid)
returns table (
  attempt_id uuid,
  course_title text,
  level_name text,
  unit_name text,
  cat_name text,
  score integer,
  max_score integer,
  submitted_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not public.has_any_role(
    auth.uid(),
    array['super_admin', 'academic_admin']::public.app_role[]
  ) then
    raise exception 'Only academic staff can review student CAT results.';
  end if;

  if not exists (select 1 from public.students where id = _student_id) then
    raise exception 'Student record not found.';
  end if;

  return query
  select attempt.id,
         course.title,
         course_level.name,
         coalesce(unit.title, 'Unit not assigned'),
         coalesce(nullif(btrim(assessment.name), ''), assessment.title),
         attempt.score,
         attempt.max_score,
         attempt.submitted_at
    from public.cat_attempts attempt
    join public.cat_assessments assessment on assessment.id = attempt.assessment_id
    join public.courses course on course.id = assessment.course_id
    left join public.course_levels course_level on course_level.id = attempt.course_level_id
    left join public.course_units unit on unit.id = assessment.unit_id
   where attempt.student_id = _student_id
     and attempt.submitted_at is not null
   order by attempt.submitted_at desc;
end;
$$;

revoke all on function public.list_student_cat_results(uuid) from public, anon;
grant execute on function public.list_student_cat_results(uuid) to authenticated;
