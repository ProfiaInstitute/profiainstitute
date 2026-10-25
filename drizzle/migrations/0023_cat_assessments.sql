create table public.cat_assessments (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete restrict,
  title text not null check (length(trim(title)) between 1 and 160),
  instructions text,
  duration_minutes integer not null check (duration_minutes between 1 and 360),
  opens_at timestamptz not null,
  closes_at timestamptz not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (closes_at > opens_at)
);

create table public.cat_questions (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.cat_assessments(id) on delete cascade,
  prompt text not null check (length(trim(prompt)) between 1 and 4000),
  option_a text not null check (length(trim(option_a)) between 1 and 1000),
  option_b text not null check (length(trim(option_b)) between 1 and 1000),
  option_c text not null check (length(trim(option_c)) between 1 and 1000),
  option_d text not null check (length(trim(option_d)) between 1 and 1000),
  correct_option char(1) not null check (correct_option in ('A', 'B', 'C', 'D')),
  points integer not null default 1 check (points between 1 and 100),
  position integer not null check (position > 0),
  unique (assessment_id, position)
);

create table public.cat_attempts (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.cat_assessments(id) on delete restrict,
  student_id uuid not null references public.students(id) on delete cascade,
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  score integer,
  max_score integer,
  unique (assessment_id, student_id),
  check (
    (submitted_at is null and score is null and max_score is null)
    or (submitted_at is not null and score between 0 and max_score and max_score > 0)
  )
);

create table public.cat_answers (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.cat_attempts(id) on delete cascade,
  question_id uuid not null references public.cat_questions(id) on delete cascade,
  selected_option char(1) not null check (selected_option in ('A', 'B', 'C', 'D')),
  updated_at timestamptz not null default now(),
  unique (attempt_id, question_id)
);

create index cat_assessments_course_schedule_idx
  on public.cat_assessments(course_id, opens_at, closes_at);
create index cat_attempts_student_idx on public.cat_attempts(student_id, assessment_id);
create index cat_answers_attempt_idx on public.cat_answers(attempt_id);

alter table public.cat_assessments enable row level security;
alter table public.cat_questions enable row level security;
alter table public.cat_attempts enable row level security;
alter table public.cat_answers enable row level security;

revoke all on public.cat_assessments, public.cat_questions, public.cat_attempts, public.cat_answers
  from anon, authenticated;
grant all on public.cat_assessments, public.cat_questions, public.cat_attempts, public.cat_answers
  to service_role;

create or replace function public.create_cat_assessment(
  _course_id uuid,
  _title text,
  _instructions text,
  _duration_minutes integer,
  _opens_at timestamptz,
  _closes_at timestamptz,
  _questions jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  assessment_id uuid;
  question jsonb;
  question_position integer := 0;
begin
  if not public.has_any_role(
    auth.uid(),
    array['super_admin','academic_admin']::public.app_role[]
  ) then
    raise exception 'Only academic staff can create CATs.';
  end if;
  if _course_id is null or not exists (select 1 from public.courses where id = _course_id) then
    raise exception 'Select a valid course.';
  end if;
  if nullif(trim(_title), '') is null or length(trim(_title)) > 160 then
    raise exception 'Enter a CAT title of 1 to 160 characters.';
  end if;
  if _duration_minutes is null or _duration_minutes not between 1 and 360 then
    raise exception 'CAT duration must be between 1 and 360 minutes.';
  end if;
  if _opens_at is null or _opens_at <= now() or _closes_at is null or _closes_at <= _opens_at then
    raise exception 'Choose a future opening time and a closing time after it.';
  end if;
  if _questions is null or jsonb_typeof(_questions) is distinct from 'array' then
    raise exception 'A CAT must contain between 1 and 100 questions.';
  end if;
  if jsonb_array_length(_questions) not between 1 and 100 then
    raise exception 'A CAT must contain between 1 and 100 questions.';
  end if;

  insert into public.cat_assessments(
    course_id, title, instructions, duration_minutes, opens_at, closes_at, created_by
  )
  values (
    _course_id, trim(_title), nullif(trim(_instructions), ''), _duration_minutes,
    _opens_at, _closes_at, auth.uid()
  )
  returning id into assessment_id;

  for question in select value from jsonb_array_elements(_questions)
  loop
    question_position := question_position + 1;
    if jsonb_typeof(question) <> 'object'
      or nullif(trim(question->>'prompt'), '') is null
      or nullif(trim(question->>'option_a'), '') is null
      or nullif(trim(question->>'option_b'), '') is null
      or nullif(trim(question->>'option_c'), '') is null
      or nullif(trim(question->>'option_d'), '') is null
      or upper(coalesce(question->>'correct_option', '')) not in ('A', 'B', 'C', 'D')
      or coalesce((question->>'points')::integer, 0) not between 1 and 100 then
      raise exception 'Question % must have a prompt, four choices, a correct answer, and 1 to 100 points.', question_position;
    end if;
    insert into public.cat_questions(
      assessment_id, prompt, option_a, option_b, option_c, option_d,
      correct_option, points, position
    )
    values (
      assessment_id, trim(question->>'prompt'), trim(question->>'option_a'),
      trim(question->>'option_b'), trim(question->>'option_c'), trim(question->>'option_d'),
      upper(question->>'correct_option'), (question->>'points')::integer, question_position
    );
  end loop;

  return assessment_id;
end;
$$;

create or replace function public.list_my_cats()
returns jsonb
language plpgsql
security definer
set search_path = public
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
  where assessment.course_id = student_record.course_id;

  return cats;
end;
$$;

create or replace function public.start_cat_attempt(_assessment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
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
  where id = _assessment_id and course_id = student_record.course_id;
  if not found then raise exception 'CAT not found for your course.'; end if;

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

create or replace function public.save_cat_answer(
  _attempt_id uuid,
  _question_id uuid,
  _selected_option text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  attempt_record public.cat_attempts%rowtype;
  assessment_record public.cat_assessments%rowtype;
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

  insert into public.cat_answers(attempt_id, question_id, selected_option)
  values (_attempt_id, _question_id, upper(_selected_option))
  on conflict (attempt_id, question_id) do update
    set selected_option = excluded.selected_option, updated_at = now();
end;
$$;

create or replace function public.submit_cat_attempt(_attempt_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  attempt_record public.cat_attempts%rowtype;
  question_total integer;
  awarded_score integer;
begin
  if auth.uid() is null then raise exception 'Student sign-in required.'; end if;
  select attempt.* into attempt_record
  from public.cat_attempts attempt
  join public.students student on student.id = attempt.student_id
  where attempt.id = _attempt_id and student.user_id = auth.uid() and student.status = 'active'
  for update of attempt;
  if not found then raise exception 'CAT attempt not found.'; end if;

  if attempt_record.submitted_at is null then
    select coalesce(sum(question.points), 0)::integer,
      coalesce(sum(case when answer.selected_option = question.correct_option then question.points else 0 end), 0)::integer
    into question_total, awarded_score
    from public.cat_questions question
    left join public.cat_answers answer
      on answer.question_id = question.id and answer.attempt_id = attempt_record.id
    where question.assessment_id = attempt_record.assessment_id;

    if question_total <= 0 then raise exception 'CAT has no markable questions.'; end if;
    update public.cat_attempts
    set submitted_at = now(), score = awarded_score, max_score = question_total
    where id = attempt_record.id
    returning * into attempt_record;
  end if;

  return jsonb_build_object(
    'submitted_at', attempt_record.submitted_at,
    'score', attempt_record.score,
    'max_score', attempt_record.max_score
  );
end;
$$;

create or replace function public.list_cat_assessments()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cat_list jsonb;
begin
  if not public.has_any_role(
    auth.uid(),
    array['super_admin','academic_admin']::public.app_role[]
  ) then
    raise exception 'Only academic staff can review CATs.';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', assessment.id,
    'course_id', assessment.course_id,
    'course_title', course.title,
    'title', assessment.title,
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
      from public.cat_questions question where question.assessment_id = assessment.id
    ), '[]'::jsonb),
    'attempts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', attempt.id,
        'student_number', student.student_number,
        'student_name', concat_ws(' ', student.first_name, student.middle_name, student.last_name),
        'started_at', attempt.started_at,
        'submitted_at', attempt.submitted_at,
        'score', attempt.score,
        'max_score', attempt.max_score,
        'answers', coalesce((
          select jsonb_agg(jsonb_build_object(
            'question_id', answer.question_id,
            'selected_option', answer.selected_option
          ))
          from public.cat_answers answer where answer.attempt_id = attempt.id
        ), '[]'::jsonb)
      ) order by attempt.started_at desc)
      from public.cat_attempts attempt
      join public.students student on student.id = attempt.student_id
      where attempt.assessment_id = assessment.id
    ), '[]'::jsonb)
  ) order by assessment.created_at desc), '[]'::jsonb)
  into cat_list
  from public.cat_assessments assessment
  join public.courses course on course.id = assessment.course_id;

  return cat_list;
end;
$$;

revoke all on function public.create_cat_assessment(uuid, text, text, integer, timestamptz, timestamptz, jsonb)
  from public, anon;
revoke all on function public.list_my_cats()
  from public, anon;
revoke all on function public.start_cat_attempt(uuid)
  from public, anon;
revoke all on function public.save_cat_answer(uuid, uuid, text)
  from public, anon;
revoke all on function public.submit_cat_attempt(uuid)
  from public, anon;
revoke all on function public.list_cat_assessments()
  from public, anon;
grant execute on function public.create_cat_assessment(uuid, text, text, integer, timestamptz, timestamptz, jsonb)
  to authenticated;
grant execute on function public.list_my_cats()
  to authenticated;
grant execute on function public.start_cat_attempt(uuid)
  to authenticated;
grant execute on function public.save_cat_answer(uuid, uuid, text)
  to authenticated;
grant execute on function public.submit_cat_attempt(uuid)
  to authenticated;
grant execute on function public.list_cat_assessments()
  to authenticated;
