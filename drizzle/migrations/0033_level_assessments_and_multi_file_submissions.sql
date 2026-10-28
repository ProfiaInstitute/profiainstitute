alter table public.assignments
  add column if not exists level_ids uuid[];

alter table public.submissions
  add column if not exists file_paths text[] not null default '{}';

alter table public.cat_assessments
  add column if not exists name text,
  add column if not exists level_ids uuid[],
  add column if not exists download_file_path text,
  add column if not exists download_file_name text;

update public.assignments assignment
set level_ids = array[unit.level_id]
from public.course_units unit
where assignment.unit_id = unit.id
  and unit.level_id is not null
  and assignment.level_ids is null;

update public.cat_assessments
set name = title
where name is null or btrim(name) = '';

update public.cat_assessments assessment
set level_ids = array[unit.level_id]
from public.course_units unit
where assessment.unit_id = unit.id
  and unit.level_id is not null
  and assessment.level_ids is null;

alter table public.cat_assessments
  alter column name set not null;

create index if not exists assignments_course_published_due_idx
  on public.assignments(course_id, published, due_date);
create index if not exists assignments_level_ids_gin_idx
  on public.assignments using gin(level_ids);
create index if not exists cat_assessments_level_ids_gin_idx
  on public.cat_assessments using gin(level_ids);
create index if not exists assignments_file_path_idx
  on public.assignments(file_path)
  where file_path is not null;
create index if not exists cat_assessments_download_file_path_idx
  on public.cat_assessments(download_file_path)
  where download_file_path is not null;

create or replace function public.validate_assignment_levels()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  unit_level_id uuid;
begin
  if new.level_ids is not null then
    if cardinality(new.level_ids) = 0 then
      raise exception 'Select at least one course level.';
    end if;
    if cardinality(new.level_ids) <> cardinality(array(select distinct unnest(new.level_ids))) then
      raise exception 'Course levels must not be duplicated.';
    end if;
    if exists (
      select 1
      from unnest(new.level_ids) target(level_id)
      left join public.course_levels level on level.id = target.level_id
      where level.id is null or level.course_id <> new.course_id
    ) then
      raise exception 'Select only levels that belong to this assignment course.';
    end if;
  end if;

  if new.unit_id is not null then
    select unit.level_id into unit_level_id
    from public.course_units unit
    where unit.id = new.unit_id and unit.course_id = new.course_id;
    if not found then
      raise exception 'The assignment unit must belong to its selected course.';
    end if;
    if unit_level_id is not null then
      if new.level_ids is null then
        new.level_ids := array[unit_level_id];
      elsif cardinality(new.level_ids) <> 1 or new.level_ids[1] <> unit_level_id then
        raise exception 'A level-specific unit can only target its own course level.';
      end if;
    end if;
  end if;
  return new;
end;
$$;

create trigger assignments_validate_levels
  before insert or update of course_id, unit_id, level_ids
  on public.assignments
  for each row execute function public.validate_assignment_levels();

drop policy if exists "assign read" on public.assignments;
create policy "assign read" on public.assignments
  for select to authenticated
  using (
    (
      published
      and course_id = public.my_course_id()
      and (
        level_ids is null
        or exists (
          select 1 from public.students student
          where student.id = public.my_student_id()
            and assignments.level_ids @> array[student.level_id]
        )
      )
    )
    or public.has_any_role(
      auth.uid(),
      array['super_admin','academic_admin']::public.app_role[]
    )
  );

drop policy if exists "subs own insert" on public.submissions;
create policy "subs own insert" on public.submissions
  for insert to authenticated
  with check (
    student_id = public.my_student_id()
    and status = 'submitted'
    and grade is null
    and exists (
      select 1
      from public.assignments assignment
      join public.students student on student.id = submissions.student_id
      where assignment.id = submissions.assignment_id
        and assignment.published
        and assignment.course_id = student.course_id
        and (
          assignment.level_ids is null
          or assignment.level_ids @> array[student.level_id]
        )
    )
  );

drop policy if exists "subs own update" on public.submissions;
create policy "subs own update" on public.submissions
  for update to authenticated
  using (student_id = public.my_student_id() and grade is null)
  with check (
    student_id = public.my_student_id()
    and grade is null
    and status = 'submitted'
    and exists (
      select 1
      from public.assignments assignment
      join public.students student on student.id = submissions.student_id
      where assignment.id = submissions.assignment_id
        and assignment.published
        and assignment.course_id = student.course_id
        and (
          assignment.level_ids is null
          or assignment.level_ids @> array[student.level_id]
        )
    )
  );

create or replace function public.validate_submission_file_paths()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.file_paths is null then
    new.file_paths := case when new.file_path is null then '{}'::text[] else array[new.file_path] end;
  elsif cardinality(new.file_paths) = 0 and new.file_path is not null then
    new.file_paths := array[new.file_path];
  elsif cardinality(new.file_paths) > 0 then
    new.file_path := new.file_paths[1];
  end if;

  if exists (
    select 1
    from unnest(new.file_paths) submitted_path
    where submitted_path is null
      or split_part(submitted_path, '/', 1) <> new.student_id::text
      or split_part(submitted_path, '/', 2) <> new.assignment_id::text
      or array_length(string_to_array(submitted_path, '/'), 1) <> 3
      or split_part(submitted_path, '/', 3) in ('', '.', '..')
  ) then
    raise exception 'Submission files must belong to this student and assignment.';
  end if;
  return new;
end;
$$;

create trigger submissions_validate_file_paths
  before insert or update of assignment_id, student_id, file_path, file_paths
  on public.submissions
  for each row execute function public.validate_submission_file_paths();

create or replace function public.validate_cat_levels()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  unit_level_id uuid;
begin
  if nullif(btrim(new.name), '') is null or length(btrim(new.name)) > 160 then
    raise exception 'Enter a download name of 1 to 160 characters.';
  end if;
  if new.level_ids is null or cardinality(new.level_ids) = 0 then
    raise exception 'Select at least one course level.';
  end if;
  if cardinality(new.level_ids) <> cardinality(array(select distinct unnest(new.level_ids))) then
    raise exception 'Course levels must not be duplicated.';
  end if;
  if exists (
    select 1
    from unnest(new.level_ids) target(level_id)
    left join public.course_levels level on level.id = target.level_id
    where level.id is null or level.course_id <> new.course_id
  ) then
    raise exception 'Select only levels that belong to this CAT course.';
  end if;
  if new.unit_id is not null then
    select unit.level_id into unit_level_id
    from public.course_units unit
    where unit.id = new.unit_id and unit.course_id = new.course_id;
    if not found then
      raise exception 'The CAT unit must belong to its selected course.';
    end if;
    if unit_level_id is not null
      and (cardinality(new.level_ids) <> 1 or new.level_ids[1] <> unit_level_id) then
      raise exception 'A level-specific unit can only target its own course level.';
    end if;
  end if;
  if (new.download_file_path is null) <> (new.download_file_name is null) then
    raise exception 'CAT download path and filename must be provided together.';
  end if;
  if new.download_file_path is not null
    and split_part(new.download_file_path, '/', 1) <> new.course_id::text then
    raise exception 'The CAT download file must belong to its course.';
  end if;
  if new.download_file_name is not null
    and (length(new.download_file_name) > 200 or new.download_file_name ~ '[/\\]')
  then
    raise exception 'Enter a valid CAT download filename.';
  end if;
  return new;
end;
$$;

create trigger cat_assessments_validate_levels
  before insert or update of course_id, unit_id, name, level_ids, download_file_path, download_file_name
  on public.cat_assessments
  for each row execute function public.validate_cat_levels();

drop function if exists public.create_cat_assessment(uuid, text, text, integer, timestamptz, timestamptz, jsonb);
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
  if _duration_minutes is null or _duration_minutes not between 1 and 360 then
    raise exception 'CAT duration must be between 1 and 360 minutes.';
  end if;
  if _opens_at is null or _opens_at <= now() or _closes_at is null or _closes_at <= _opens_at then
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
    nullif(btrim(_instructions), ''), _duration_minutes, _opens_at, _closes_at, auth.uid()
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
  uuid, text, text, integer, timestamptz, timestamptz, jsonb, text, uuid[], text, text
) from public, anon;
grant execute on function public.create_cat_assessment(
  uuid, text, text, integer, timestamptz, timestamptz, jsonb, text, uuid[], text, text
) to authenticated;

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
  position integer := 0;
begin
  if not public.facilitator_unit_permission(auth.uid(), _unit_id, 'cats') then
    raise exception 'CAT creation is not enabled for this assigned unit.';
  end if;
  select unit.course_id into course_id from public.course_units unit where unit.id = _unit_id;
  if course_id is null then raise exception 'Choose a valid assigned unit.'; end if;
  if nullif(btrim(_title), '') is null or length(btrim(_title)) > 160 then
    raise exception 'Enter a CAT title of 1 to 160 characters.';
  end if;
  if _duration_minutes is null or _duration_minutes not between 1 and 360
    or _opens_at is null or _opens_at <= now() or _closes_at is null or _closes_at <= _opens_at then
    raise exception 'Choose a valid duration and future opening and closing times.';
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
    _opens_at, _closes_at, auth.uid()
  ) returning id into assessment_id;

  for question in select value from jsonb_array_elements(_questions)
  loop
    position := position + 1;
    if jsonb_typeof(question) <> 'object'
      or nullif(btrim(question->>'prompt'), '') is null
      or nullif(btrim(question->>'option_a'), '') is null
      or nullif(btrim(question->>'option_b'), '') is null
      or nullif(btrim(question->>'option_c'), '') is null
      or nullif(btrim(question->>'option_d'), '') is null
      or upper(coalesce(question->>'correct_option', '')) not in ('A','B','C','D')
      or coalesce((question->>'points')::integer, 0) not between 1 and 100 then
      raise exception 'Question % must have a prompt, four choices, a correct answer, and 1 to 100 points.', position;
    end if;
    insert into public.cat_questions(
      assessment_id, prompt, option_a, option_b, option_c, option_d, correct_option, points, position
    ) values (
      assessment_id, btrim(question->>'prompt'), btrim(question->>'option_a'),
      btrim(question->>'option_b'), btrim(question->>'option_c'), btrim(question->>'option_d'),
      upper(question->>'correct_option'), (question->>'points')::integer, position
    );
  end loop;
  return assessment_id;
end;
$$;

revoke all on function public.create_facilitator_cat(
  uuid, text, text, integer, timestamptz, timestamptz, jsonb
) from public, anon, authenticated;
revoke all on function public.create_facilitator_cat(
  uuid, text, text, integer, timestamptz, timestamptz, jsonb, text, uuid[], text, text
) from public, anon;
grant execute on function public.create_facilitator_cat(
  uuid, text, text, integer, timestamptz, timestamptz, jsonb, text, uuid[], text, text
) to authenticated;

create or replace function public.list_my_cats()
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
  where assessment.course_id = student_record.course_id
    and (
      assessment.level_ids is null
      or assessment.level_ids @> array[student_record.level_id]
    );

  return cats;
end;
$$;

alter function public.start_cat_attempt(uuid) rename to start_cat_attempt_unscoped;
revoke all on function public.start_cat_attempt_unscoped(uuid) from public, anon, authenticated;

create function public.start_cat_attempt(_assessment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  student_record public.students%rowtype;
begin
  if auth.uid() is null then raise exception 'Student sign-in required.'; end if;
  select * into student_record from public.students where user_id = auth.uid();
  if not found or student_record.status <> 'active' then
    raise exception 'An active student record is required to access CATs.';
  end if;
  if not exists (
    select 1 from public.cat_assessments assessment
    where assessment.id = _assessment_id
      and assessment.course_id = student_record.course_id
      and (
        assessment.level_ids is null
        or assessment.level_ids @> array[student_record.level_id]
      )
  ) then
    raise exception 'CAT not found for your course level.';
  end if;
  return public.start_cat_attempt_unscoped(_assessment_id);
end;
$$;

revoke all on function public.list_my_cats() from public, anon;
revoke all on function public.start_cat_attempt(uuid) from public, anon;
grant execute on function public.list_my_cats() to authenticated;
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
  if not public.has_any_role(auth.uid(), array['super_admin','academic_admin']::public.app_role[]) then
    raise exception 'Only academic staff can review CATs.';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', assessment.id,
    'course_id', assessment.course_id,
    'course_title', course.title,
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
        'id', question.id, 'prompt', question.prompt, 'option_a', question.option_a,
        'option_b', question.option_b, 'option_c', question.option_c, 'option_d', question.option_d,
        'correct_option', question.correct_option, 'points', question.points
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
            'question_id', answer.question_id, 'selected_option', answer.selected_option
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

revoke all on function public.list_cat_assessments() from public, anon;
grant execute on function public.list_cat_assessments() to authenticated;

create or replace function public.can_access_learning_assessment_file(_path text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  student_record public.students%rowtype;
begin
  if auth.uid() is null then return false; end if;
  select * into student_record
  from public.students
  where user_id = auth.uid() and status = 'active';
  if not found then return false; end if;

  if exists (
    select 1 from public.assignments assignment
    where assignment.file_path = _path and assignment.course_id = student_record.course_id
  ) then
    return exists (
      select 1 from public.assignments assignment
      where assignment.file_path = _path
        and assignment.course_id = student_record.course_id
        and assignment.published
        and (
          assignment.level_ids is null
          or assignment.level_ids @> array[student_record.level_id]
        )
    );
  end if;

  if exists (
    select 1 from public.cat_assessments assessment
    where assessment.download_file_path = _path
      and assessment.course_id = student_record.course_id
  ) then
    return exists (
      select 1 from public.cat_assessments assessment
      where assessment.download_file_path = _path
        and assessment.course_id = student_record.course_id
        and (
          assessment.level_ids is null
          or assessment.level_ids @> array[student_record.level_id]
        )
    );
  end if;

  return true;
end;
$$;

revoke all on function public.can_access_learning_assessment_file(text) from public, anon;
grant execute on function public.can_access_learning_assessment_file(text) to authenticated;

create policy facilitator_cat_download_storage_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'learning'
    and (storage.foldername(name))[3] = 'cat-downloads'
    and exists (
      select 1
      from public.course_units unit
      where unit.id::text = (storage.foldername(name))[2]
        and unit.course_id::text = (storage.foldername(name))[1]
        and public.facilitator_unit_permission(auth.uid(), unit.id, 'cats')
    )
  );

create policy facilitator_submission_storage_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'submissions'
    and exists (
      select 1
      from public.assignments assignment
      join public.students student
        on student.id::text = (storage.foldername(name))[1]
      where assignment.id::text = (storage.foldername(name))[2]
        and assignment.course_id = student.course_id
        and assignment.unit_id is not null
        and assignment.published
        and student.status = 'active'
        and (
          assignment.level_ids is null
          or assignment.level_ids @> array[student.level_id]
        )
        and public.facilitator_unit_permission(auth.uid(), assignment.unit_id)
    )
  );

drop policy if exists "learning read" on storage.objects;
create policy "learning read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'learning'
    and (
      public.has_any_role(
        auth.uid(),
        array['super_admin','academic_admin']::public.app_role[]
      )
      or (
        (storage.foldername(name))[1] = public.my_course_id()::text
        and public.can_access_learning_assessment_file(name)
      )
    )
  );
