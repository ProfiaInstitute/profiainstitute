create table public.cat_attempt_option_orders (
  attempt_id uuid not null references public.cat_attempts(id) on delete cascade,
  question_id uuid not null references public.cat_questions(id) on delete cascade,
  display_option char(1) not null check (display_option in ('A', 'B', 'C', 'D')),
  source_option char(1) not null check (source_option in ('A', 'B', 'C', 'D')),
  primary key (attempt_id, question_id, display_option),
  unique (attempt_id, question_id, source_option)
);

alter table public.cat_attempt_option_orders enable row level security;
revoke all on public.cat_attempt_option_orders from public, anon, authenticated;

create or replace function public.create_cat_assessment(
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
  _download_file_name text
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
begin
  if not public.has_any_role(auth.uid(), array['super_admin','academic_admin']::public.app_role[]) then
    raise exception 'Only academic staff can create CATs.';
  end if;
  if _course_id is null or not exists (select 1 from public.courses where id = _course_id) then
    raise exception 'Select a valid course.';
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
    course_id, title, name, level_ids, download_file_path, download_file_name,
    instructions, duration_minutes, opens_at, closes_at, created_by
  )
  values (
    _course_id, btrim(_title), btrim(_name), _level_ids, _download_file_path, _download_file_name,
    nullif(btrim(_instructions), ''), _duration_minutes, effective_opens_at, _closes_at, auth.uid()
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

create or replace function public.create_facilitator_cat(
  _unit_id uuid,
  _title text,
  _instructions text,
  _duration_minutes integer,
  _opens_at timestamptz,
  _closes_at timestamptz,
  _questions jsonb,
  _name text,
  _level_ids uuid[],
  _download_file_path text,
  _download_file_name text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  assessment_id uuid;
  course_id uuid;
  question jsonb;
  question_position integer := 0;
  effective_opens_at timestamptz;
begin
  if not public.facilitator_unit_permission(auth.uid(), _unit_id, 'cats') then
    raise exception 'CAT creation is not enabled for this assigned unit.';
  end if;
  select unit.course_id into course_id from public.course_units unit where unit.id = _unit_id;
  if course_id is null then raise exception 'Choose a valid assigned unit.'; end if;
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
  ) values (
    course_id, _unit_id, btrim(_title), btrim(_name), _level_ids, _download_file_path,
    _download_file_name, nullif(btrim(_instructions), ''), _duration_minutes,
    effective_opens_at, _closes_at, auth.uid()
  ) returning id into assessment_id;

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
    ) values (
      assessment_id, btrim(question->>'prompt'), btrim(question->>'option_a'),
      btrim(question->>'option_b'), btrim(question->>'option_c'), btrim(question->>'option_d'),
      upper(question->>'correct_option'), (question->>'points')::integer, question_position
    );
  end loop;
  return assessment_id;
end;
$$;

create or replace function public.ensure_cat_attempt_option_order(_attempt_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_assessment_id uuid;
begin
  select attempt.assessment_id into target_assessment_id
  from public.cat_attempts attempt
  where attempt.id = _attempt_id;
  if target_assessment_id is null then raise exception 'CAT attempt not found.'; end if;

  insert into public.cat_attempt_option_orders(
    attempt_id, question_id, display_option, source_option
  )
  select
    _attempt_id,
    shuffled.question_id,
    substr('ABCD', shuffled.display_position::integer, 1),
    shuffled.source_option
  from (
    select
      question.id as question_id,
      choice.source_option,
      row_number() over (
        partition by question.id
        order by gen_random_uuid()
      ) as display_position
    from public.cat_questions question
    cross join (values ('A'::char(1)), ('B'::char(1)), ('C'::char(1)), ('D'::char(1))) choice(source_option)
    where question.assessment_id = target_assessment_id
  ) shuffled
  on conflict do nothing;
end;
$$;

revoke all on function public.ensure_cat_attempt_option_order(uuid) from public, anon, authenticated;

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

create or replace function public.save_cat_answer(
  _attempt_id uuid,
  _question_id uuid,
  _selected_option text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  attempt_record public.cat_attempts%rowtype;
  assessment_record public.cat_assessments%rowtype;
  source_option char(1);
begin
  if auth.uid() is null then raise exception 'Student sign-in required.'; end if;
  if _selected_option is null or upper(_selected_option) not in ('A', 'B', 'C', 'D') then
    raise exception 'Choose one of the listed answer options.';
  end if;

  select attempt.* into attempt_record
  from public.cat_attempts attempt
  join public.students student on student.id = attempt.student_id
  where attempt.id = _attempt_id and student.user_id = auth.uid() and student.status = 'active'
  for update of attempt;
  if not found then raise exception 'CAT attempt not found.'; end if;
  if attempt_record.submitted_at is not null then raise exception 'This CAT has already been submitted.'; end if;

  select * into assessment_record from public.cat_assessments
  where id = attempt_record.assessment_id;
  if now() >= least(
    attempt_record.started_at + make_interval(mins => assessment_record.duration_minutes),
    assessment_record.closes_at
  ) then
    raise exception 'The CAT time has expired.';
  end if;
  if not exists (
    select 1 from public.cat_questions
    where id = _question_id and assessment_id = assessment_record.id
  ) then
    raise exception 'Question does not belong to this CAT.';
  end if;

  select option_order.source_option into source_option
  from public.cat_attempt_option_orders option_order
  where option_order.attempt_id = _attempt_id
    and option_order.question_id = _question_id
    and option_order.display_option = upper(_selected_option);
  if not found then
    raise exception 'Answer choices are not available for this CAT attempt. Reopen the CAT and try again.';
  end if;

  insert into public.cat_answers(attempt_id, question_id, selected_option)
  values (_attempt_id, _question_id, source_option)
  on conflict (attempt_id, question_id) do update
    set selected_option = excluded.selected_option, updated_at = now();
end;
$$;

revoke all on function public.create_cat_assessment(
  uuid, text, text, integer, timestamptz, timestamptz, jsonb, text, uuid[], text, text
) from public, anon;
grant execute on function public.create_cat_assessment(
  uuid, text, text, integer, timestamptz, timestamptz, jsonb, text, uuid[], text, text
) to authenticated;

revoke all on function public.create_facilitator_cat(
  uuid, text, text, integer, timestamptz, timestamptz, jsonb, text, uuid[], text, text
) from public, anon;
grant execute on function public.create_facilitator_cat(
  uuid, text, text, integer, timestamptz, timestamptz, jsonb, text, uuid[], text, text
) to authenticated;

revoke all on function public.start_cat_attempt(uuid) from public, anon;
grant execute on function public.start_cat_attempt(uuid) to authenticated;
revoke all on function public.save_cat_answer(uuid, uuid, text) from public, anon;
grant execute on function public.save_cat_answer(uuid, uuid, text) to authenticated;
