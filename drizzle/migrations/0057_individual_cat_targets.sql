create table public.cat_assessment_students (
  assessment_id uuid not null references public.cat_assessments(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (assessment_id, student_id)
);

create index cat_assessment_students_student_idx
  on public.cat_assessment_students(student_id, assessment_id);

alter table public.cat_assessment_students enable row level security;
revoke all on public.cat_assessment_students from public, anon, authenticated;

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
  assessment_id uuid;
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
      select count(distinct student_id)
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

  assessment_id := public.create_cat_assessment(
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
  select assessment_id, selected.student_id
  from unnest(coalesce(_student_ids, '{}'::uuid[])) as selected(student_id);

  delete from public.student_learning_notifications notification
  where notification.source_type = 'cat'
    and notification.source_id = assessment_id
    and not exists (
      select 1
      from public.cat_assessment_students target
      where target.assessment_id = assessment_id
        and target.student_id = notification.student_id
    );

  return assessment_id;
end;
$$;

revoke all on function public.create_targeted_cat_assessment(
  uuid, text, text, integer, timestamptz, timestamptz, jsonb, text, uuid[], text, text, uuid, uuid[]
) from public, anon;
grant execute on function public.create_targeted_cat_assessment(
  uuid, text, text, integer, timestamptz, timestamptz, jsonb, text, uuid[], text, text, uuid, uuid[]
) to authenticated;

create or replace function public.list_my_cats(_course_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
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
    'name', assessment.name,
    'download_file_path', assessment.download_file_path,
    'download_file_name', assessment.download_file_name,
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
  where (_course_id is null or assessment.course_id = _course_id)
    and assessment.course_id in (select public.my_course_ids())
    and public.student_has_course_level(assessment.course_id, assessment.level_ids)
    and (
      not exists (
        select 1
        from public.cat_assessment_students target
        where target.assessment_id = assessment.id
      )
      or exists (
        select 1
        from public.cat_assessment_students target
        where target.assessment_id = assessment.id
          and target.student_id = student_record.id
      )
    );

  return cats;
end;
$$;

revoke all on function public.list_my_cats(uuid) from public, anon;
grant execute on function public.list_my_cats(uuid) to authenticated;

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

  select assessment.* into assessment_record
  from public.cat_assessments assessment
  where assessment.id = _assessment_id
    and assessment.course_id in (select public.my_course_ids())
    and public.student_has_course_level(assessment.course_id, assessment.level_ids)
    and (
      not exists (
        select 1
        from public.cat_assessment_students target
        where target.assessment_id = assessment.id
      )
      or exists (
        select 1
        from public.cat_assessment_students target
        where target.assessment_id = assessment.id
          and target.student_id = student_record.id
      )
    )
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
    'target_students', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', student.id,
        'student_number', student.student_number,
        'student_name', concat_ws(' ', student.first_name, student.middle_name, student.last_name)
      ) order by student.last_name, student.first_name)
      from public.cat_assessment_students target
      join public.students student on student.id = target.student_id
      where target.assessment_id = assessment.id
    ), '[]'::jsonb),
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
