create or replace function public.list_facilitator_cat_performance(_unit_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  unit_record public.course_units%rowtype;
  cat_list jsonb;
begin
  if auth.uid() is null or not (
    public.facilitator_unit_permission(auth.uid(), _unit_id, 'cats')
    or public.facilitator_unit_permission(auth.uid(), _unit_id, 'results')
  ) then
    raise exception 'You are not assigned CAT or results access for this unit.';
  end if;

  select * into unit_record
  from public.course_units
  where id = _unit_id;

  if not found then
    raise exception 'The assigned course unit could not be found.';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', assessment.id,
    'course_id', assessment.course_id,
    'course_title', course.title,
    'unit_id', assessment.unit_id,
    'title', assessment.title,
    'name', assessment.name,
    'level_ids', assessment.level_ids,
    'download_file_path', assessment.download_file_path,
    'download_file_name', assessment.download_file_name,
    'instructions', assessment.instructions,
    'duration_minutes', assessment.duration_minutes,
    'opens_at', assessment.opens_at,
    'closes_at', assessment.closes_at,
    'questions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', question.id,
        'prompt', question.prompt,
        'option_a', question.option_a,
        'option_b', question.option_b,
        'option_c', question.option_c,
        'option_d', question.option_d,
        'correct_option', question.correct_option,
        'points', question.points
      ) order by question.position)
      from public.cat_questions question
      where question.assessment_id = assessment.id
    ), '[]'::jsonb),
    'attempts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', attempt.id,
        'student_number', student.student_number,
        'student_name', concat_ws(' ', student.first_name, student.middle_name, student.last_name),
        'kasneb_number', student.kasneb_number,
        'level_name', course_level.name,
        'started_at', attempt.started_at,
        'submitted_at', attempt.submitted_at,
        'score', attempt.score,
        'max_score', attempt.max_score,
        'answers', coalesce((
          select jsonb_agg(jsonb_build_object(
            'question_id', answer.question_id,
            'selected_option', answer.selected_option
          ) order by question.position)
          from public.cat_answers answer
          join public.cat_questions question
            on question.id = answer.question_id
            and question.assessment_id = assessment.id
          where answer.attempt_id = attempt.id
        ), '[]'::jsonb)
      ) order by attempt.started_at desc)
      from public.cat_attempts attempt
      join public.students student on student.id = attempt.student_id
      left join public.course_levels course_level on course_level.id = student.level_id
      where attempt.assessment_id = assessment.id
        and student.course_id = assessment.course_id
        and student.status = 'active'
        and (unit_record.level_id is null or student.level_id = unit_record.level_id)
        and (
          assessment.level_ids is null
          or student.level_id = any(assessment.level_ids)
        )
    ), '[]'::jsonb)
  ) order by assessment.created_at desc), '[]'::jsonb)
  into cat_list
  from public.cat_assessments assessment
  join public.courses course on course.id = assessment.course_id
  where assessment.unit_id = unit_record.id
    and assessment.course_id = unit_record.course_id;

  return cat_list;
end;
$$;

revoke all on function public.list_facilitator_cat_performance(uuid) from public, anon;
grant execute on function public.list_facilitator_cat_performance(uuid) to authenticated;
