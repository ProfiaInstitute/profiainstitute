create or replace function public.update_cat_assessment(
  _assessment_id uuid,
  _title text,
  _name text,
  _instructions text,
  _duration_minutes integer,
  _opens_at timestamptz,
  _closes_at timestamptz,
  _download_file_path text,
  _download_file_name text,
  _questions jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  assessment_record public.cat_assessments%rowtype;
  question jsonb;
  question_position integer := 0;
  has_attempts boolean;
begin
  if not public.has_any_role(
    auth.uid(),
    array['super_admin', 'academic_admin']::public.app_role[]
  ) then
    raise exception 'Only academic staff can edit CATs.';
  end if;

  select * into assessment_record
  from public.cat_assessments
  where id = _assessment_id
  for update;
  if not found then
    raise exception 'CAT not found.';
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
  if _opens_at is null or _closes_at is null or _closes_at <= _opens_at then
    raise exception 'Choose a closing time later than the opening time.';
  end if;

  select exists (
    select 1 from public.cat_attempts where assessment_id = _assessment_id
  ) into has_attempts;

  if has_attempts then
    if _questions is not null then
      raise exception 'Questions and answer keys cannot be edited after a student starts this CAT.';
    end if;
    if _duration_minutes <> assessment_record.duration_minutes
      or _opens_at <> assessment_record.opens_at
      or _closes_at <> assessment_record.closes_at then
      raise exception 'The schedule and time limit cannot be changed after a student starts this CAT.';
    end if;
  else
    if _questions is null or jsonb_typeof(_questions) is distinct from 'array'
      or jsonb_array_length(_questions) not between 1 and 100 then
      raise exception 'A CAT must contain between 1 and 100 questions.';
    end if;

    for question in select value from jsonb_array_elements(_questions)
    loop
      question_position := question_position + 1;
      if jsonb_typeof(question) <> 'object'
        or nullif(btrim(question->>'prompt'), '') is null
        or length(btrim(question->>'prompt')) > 4000
        or nullif(btrim(question->>'option_a'), '') is null
        or length(btrim(question->>'option_a')) > 1000
        or nullif(btrim(question->>'option_b'), '') is null
        or length(btrim(question->>'option_b')) > 1000
        or nullif(btrim(question->>'option_c'), '') is null
        or length(btrim(question->>'option_c')) > 1000
        or nullif(btrim(question->>'option_d'), '') is null
        or length(btrim(question->>'option_d')) > 1000
        or upper(coalesce(question->>'correct_option', '')) not in ('A', 'B', 'C', 'D')
        or coalesce((question->>'points')::integer, 0) not between 1 and 100 then
        raise exception 'Question % must have a prompt, four choices, a correct answer, and 1 to 100 points.', question_position;
      end if;
    end loop;
    question_position := 0;
  end if;

  update public.cat_assessments
  set title = btrim(_title),
      name = btrim(_name),
      instructions = nullif(btrim(_instructions), ''),
      duration_minutes = _duration_minutes,
      opens_at = _opens_at,
      closes_at = _closes_at,
      download_file_path = _download_file_path,
      download_file_name = _download_file_name
  where id = _assessment_id;

  if not has_attempts then
    delete from public.cat_questions where assessment_id = _assessment_id;
    for question in select value from jsonb_array_elements(_questions)
    loop
      question_position := question_position + 1;
      insert into public.cat_questions(
        assessment_id, prompt, option_a, option_b, option_c, option_d,
        correct_option, points, position
      )
      values (
        _assessment_id, btrim(question->>'prompt'), btrim(question->>'option_a'),
        btrim(question->>'option_b'), btrim(question->>'option_c'), btrim(question->>'option_d'),
        upper(question->>'correct_option'), (question->>'points')::integer, question_position
      );
    end loop;
  end if;
end;
$$;

revoke all on function public.update_cat_assessment(
  uuid, text, text, text, integer, timestamptz, timestamptz, text, text, jsonb
) from public, anon;
grant execute on function public.update_cat_assessment(
  uuid, text, text, text, integer, timestamptz, timestamptz, text, text, jsonb
) to authenticated;

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
    and public.student_has_course_level(course_id, level_ids)
  for update;
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
    perform public.ensure_cat_attempt_option_order(attempt_record.id);
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', question.id,
      'prompt', question.prompt,
      'options', (
        select jsonb_agg(jsonb_build_object(
          'key', option_order.display_option,
          'text', case option_order.source_option
            when 'A' then question.option_a
            when 'B' then question.option_b
            when 'C' then question.option_c
            else question.option_d
          end
        ) order by option_order.display_option)
        from public.cat_attempt_option_orders option_order
        where option_order.attempt_id = attempt_record.id
          and option_order.question_id = question.id
      ),
      'points', question.points,
      'selected_option', (
        select option_order.display_option
        from public.cat_attempt_option_orders option_order
        where option_order.attempt_id = attempt_record.id
          and option_order.question_id = question.id
          and option_order.source_option = answer.selected_option
      )
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

revoke all on function public.start_cat_attempt(uuid) from public, anon;
grant execute on function public.start_cat_attempt(uuid) to authenticated;
