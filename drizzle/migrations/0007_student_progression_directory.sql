create or replace function public.list_student_progression_followups()
returns table(
  id uuid,
  student_id uuid,
  student_name text,
  student_number text,
  student_email text,
  unit_name text,
  score numeric,
  grade text,
  source_course text,
  next_course text,
  status text,
  due_at timestamptz,
  last_error text,
  attempts integer,
  sent_at timestamptz,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.has_any_role(
    auth.uid(),
    array['super_admin', 'academic_admin']::public.app_role[]
  ) then
    raise exception 'Forbidden';
  end if;

  return query
  select
    followup.id,
    student.id,
    concat_ws(' ', student.first_name, student.middle_name, student.last_name),
    student.student_number,
    student.email,
    result.unit_name,
    result.score,
    result.grade,
    source_course.title,
    next_course.title,
    followup.status,
    followup.due_at,
    followup.last_error,
    followup.attempts,
    followup.sent_at,
    followup.created_at
  from public.progression_followups followup
  join public.students student on student.id = followup.student_id
  join public.results result on result.id = followup.result_id
  join public.progression_rules rule on rule.id = followup.rule_id
  join public.courses source_course on source_course.id = rule.source_course_id
  join public.courses next_course on next_course.id = rule.next_course_id
  order by followup.created_at desc
  limit 100;
end;
$$;

revoke all on function public.list_student_progression_followups() from public, anon;
grant execute on function public.list_student_progression_followups() to authenticated;
