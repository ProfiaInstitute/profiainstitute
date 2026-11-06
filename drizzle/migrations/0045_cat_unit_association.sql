drop function if exists public.create_cat_assessment(
  uuid, text, text, integer, timestamptz, timestamptz, jsonb, text, uuid[], text, text
);

create function public.create_cat_assessment(
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
  _unit_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  assessment_id uuid;
  question jsonb;
  question_position integer := 0;
  effective_opens_at timestamptz;
  unit_record public.course_units%rowtype;
  effective_level_ids uuid[];
begin
  if not public.has_any_role(auth.uid(), array['super_admin','academic_admin']::public.app_role[]) then
    raise exception 'Only academic staff can create CATs.';
  end if;
  if _course_id is null or not exists (select 1 from public.courses where id = _course_id) then
    raise exception 'Select a valid course.';
  end if;
  if _unit_id is null then
    raise exception 'Select the course unit this CAT assesses.';
  end if;
  select * into unit_record
  from public.course_units
  where id = _unit_id and course_id = _course_id;
  if not found then
    raise exception 'The selected unit does not belong to this course.';
  end if;
  if nullif(btrim(unit_record.code), '') is null then
    raise exception 'Add a unit code in the course setup before creating a CAT for this unit.';
  end if;
  if unit_record.level_id is not null then
    if cardinality(coalesce(_level_ids, '{}'::uuid[])) > 0
      and not (unit_record.level_id = any(_level_ids)) then
      raise exception 'The selected unit belongs to a level that is not selected for this CAT.';
    end if;
    effective_level_ids := array[unit_record.level_id];
  else
    effective_level_ids := _level_ids;
  end if;
  if nullif(btrim(_title), '') is null or length(btrim(_title)) > 160 then
    raise exception 'Enter a CAT title of 1 to 160 characters.';
  end if;
  if nullif(btrim(_name), '') is null or length(btrim(_name)) > 160 then
    raise exception 'Enter a CAT download name of 1 to 160 characters.';
  end if;
  if _duration_minutes is null or _duration_minutes not between 1 and 360 then
    raise exception 'CAT duration must be between 1 and 360 minutes.';
  end if;
  effective_opens_at := coalesce(_opens_at, now());
  if (_opens_at is not null and _opens_at <= now())
    or _closes_at is null or _closes_at <= effective_opens_at then
    raise exception 'Choose a future opening time and a closing time after it.';
  end if;
  if _questions is null or jsonb_typeof(_questions) is distinct from 'array'
    or jsonb_array_length(_questions) not between 1 and 100 then
    raise exception 'A CAT must contain between 1 and 100 questions.';
  end if;

  insert into public.cat_assessments(
    course_id, unit_id, title, name, level_ids, download_file_path, download_file_name,
    instructions, duration_minutes, opens_at, closes_at, created_by
  )
  values (
    _course_id, _unit_id, btrim(_title), btrim(_name), effective_level_ids,
    _download_file_path, _download_file_name, nullif(btrim(_instructions), ''),
    _duration_minutes, effective_opens_at, _closes_at, auth.uid()
  )
  returning id into assessment_id;

  for question in select value from jsonb_array_elements(_questions)
  loop
    question_position := question_position + 1;
    if jsonb_typeof(question) <> 'object'
      or nullif(btrim(question->>'prompt'), '') is null
      or nullif(btrim(question->>'option_a'), '') is null
      or nullif(btrim(question->>'option_b'), '') is null
      or nullif(btrim(question->>'option_c'), '') is null
      or nullif(btrim(question->>'option_d'), '') is null
      or upper(coalesce(question->>'correct_option', '')) not in ('A', 'B', 'C', 'D')
      or coalesce((question->>'points')::integer, 0) not between 1 and 100 then
      raise exception 'Question % must have a prompt, four choices, a correct answer, and 1 to 100 points.', question_position;
    end if;
    insert into public.cat_questions(
      assessment_id, prompt, option_a, option_b, option_c, option_d, correct_option, points, position
    )
    values (
      assessment_id, btrim(question->>'prompt'), btrim(question->>'option_a'),
      btrim(question->>'option_b'), btrim(question->>'option_c'), btrim(question->>'option_d'),
      upper(question->>'correct_option'), (question->>'points')::integer, question_position
    );
  end loop;
  return assessment_id;
end;
$$;

revoke all on function public.create_cat_assessment(
  uuid, text, text, integer, timestamptz, timestamptz, jsonb, text, uuid[], text, text, uuid
) from public, anon;
grant execute on function public.create_cat_assessment(
  uuid, text, text, integer, timestamptz, timestamptz, jsonb, text, uuid[], text, text, uuid
) to authenticated;

create or replace function public.set_cat_assessment_unit(_assessment_id uuid, _unit_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  assessment_record public.cat_assessments%rowtype;
  unit_record public.course_units%rowtype;
begin
  if not public.has_any_role(auth.uid(), array['super_admin','academic_admin']::public.app_role[]) then
    raise exception 'Only academic staff can update CAT unit details.';
  end if;
  select * into assessment_record from public.cat_assessments where id = _assessment_id for update;
  if not found then raise exception 'CAT not found.'; end if;
  select * into unit_record
  from public.course_units
  where id = _unit_id and course_id = assessment_record.course_id;
  if not found then raise exception 'Select a unit from the CAT course.'; end if;
  if nullif(btrim(unit_record.code), '') is null then
    raise exception 'Add a unit code in the course setup before linking this unit.';
  end if;
  if unit_record.level_id is not null
    and assessment_record.level_ids is not null
    and not (unit_record.level_id = any(assessment_record.level_ids)) then
    raise exception 'The selected unit belongs to a level not assigned to this CAT.';
  end if;
  update public.cat_assessments
  set unit_id = _unit_id,
      level_ids = case
        when unit_record.level_id is not null then array[unit_record.level_id]
        else assessment_record.level_ids
      end
  where id = assessment_record.id;
end;
$$;

revoke all on function public.set_cat_assessment_unit(uuid, uuid) from public, anon;
grant execute on function public.set_cat_assessment_unit(uuid, uuid) to authenticated;

create or replace function public.list_cat_assessments()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  cat_list jsonb;
begin
  if not public.has_any_role(
    auth.uid(),
    array['super_admin', 'academic_admin']::public.app_role[]
  ) then
    raise exception 'Only academic staff can review CATs.';
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
          ))
          from public.cat_answers answer
          where answer.attempt_id = attempt.id
        ), '[]'::jsonb)
      ) order by attempt.started_at desc)
      from public.cat_attempts attempt
      join public.students student on student.id = attempt.student_id
      left join public.course_levels course_level on course_level.id = attempt.course_level_id
      where attempt.assessment_id = assessment.id
    ), '[]'::jsonb)
  ) order by assessment.created_at desc), '[]'::jsonb)
  into cat_list
  from public.cat_assessments assessment
  join public.courses course on course.id = assessment.course_id;

  return cat_list;
end;
$$;

revoke all on function public.list_cat_assessments() from public, anon;
grant execute on function public.list_cat_assessments() to authenticated;
