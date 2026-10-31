alter table public.students
  add column if not exists kasneb_number text;

alter table public.students
  drop constraint if exists students_kasneb_number_format_check;
alter table public.students
  add constraint students_kasneb_number_format_check
  check (
    kasneb_number is null
    or (
      kasneb_number = upper(btrim(kasneb_number))
      and length(kasneb_number) between 2 and 40
      and kasneb_number ~ '^[A-Z0-9][A-Z0-9 /.-]{1,39}$'
    )
  );

alter table public.cat_attempts
  add column if not exists course_level_id uuid
    references public.course_levels(id) on delete set null;

create or replace function public.set_cat_attempt_course_level()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  assessment_record public.cat_assessments%rowtype;
  student_record public.students%rowtype;
begin
  select * into assessment_record
  from public.cat_assessments
  where id = new.assessment_id;
  select * into student_record
  from public.students
  where id = new.student_id;

  if assessment_record.id is null or student_record.id is null then
    raise exception 'A valid CAT and student are required for an attempt.';
  end if;
  if student_record.kasneb_number is null then
    raise exception 'Save your KASNEB registration number before starting a CAT.';
  end if;

  select enrollment.level_id into new.course_level_id
  from public.enrollments enrollment
  where enrollment.student_id = student_record.id
    and enrollment.course_id = assessment_record.course_id
    and enrollment.status = 'active'
    and enrollment.level_id is not null
    and (
      assessment_record.level_ids is null
      or enrollment.level_id = any(assessment_record.level_ids)
    )
  order by enrollment.created_at desc
  limit 1;

  if new.course_level_id is null then
    select enrollment.level_id into new.course_level_id
    from public.online_course_enrollments enrollment
    where enrollment.student_id = student_record.id
      and enrollment.course_id = assessment_record.course_id
      and enrollment.status = 'active'
      and enrollment.level_id is not null
      and (
        assessment_record.level_ids is null
        or enrollment.level_id = any(assessment_record.level_ids)
      )
    order by enrollment.created_at desc
    limit 1;
  end if;

  if new.course_level_id is null
    and student_record.course_id = assessment_record.course_id
    and student_record.level_id is not null
    and (
      assessment_record.level_ids is null
      or student_record.level_id = any(assessment_record.level_ids)
    ) then
    new.course_level_id := student_record.level_id;
  end if;

  return new;
end;
$$;

drop trigger if exists cat_attempts_set_course_level on public.cat_attempts;
create trigger cat_attempts_set_course_level
  before insert on public.cat_attempts
  for each row execute function public.set_cat_attempt_course_level();

update public.cat_attempts attempt
set course_level_id = coalesce(
  (
    select enrollment.level_id
    from public.enrollments enrollment
    join public.cat_assessments assessment on assessment.id = attempt.assessment_id
    where enrollment.student_id = attempt.student_id
      and enrollment.course_id = assessment.course_id
      and enrollment.status = 'active'
      and enrollment.level_id is not null
      and (
        assessment.level_ids is null
        or enrollment.level_id = any(assessment.level_ids)
      )
    order by enrollment.created_at desc
    limit 1
  ),
  (
    select enrollment.level_id
    from public.online_course_enrollments enrollment
    join public.cat_assessments assessment on assessment.id = attempt.assessment_id
    where enrollment.student_id = attempt.student_id
      and enrollment.course_id = assessment.course_id
      and enrollment.status = 'active'
      and enrollment.level_id is not null
      and (
        assessment.level_ids is null
        or enrollment.level_id = any(assessment.level_ids)
      )
    order by enrollment.created_at desc
    limit 1
  ),
  (
    select student.level_id
    from public.students student
    join public.cat_assessments assessment on assessment.id = attempt.assessment_id
    where student.id = attempt.student_id
      and student.course_id = assessment.course_id
      and student.level_id is not null
      and (
        assessment.level_ids is null
        or student.level_id = any(assessment.level_ids)
      )
  )
)
where attempt.course_level_id is null;

create or replace function public.save_my_kasneb_number(_kasneb_number text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  student_record public.students%rowtype;
  normalized_number text := upper(btrim(coalesce(_kasneb_number, '')));
begin
  if auth.uid() is null then
    raise exception 'Student sign-in required.';
  end if;
  if length(normalized_number) not between 2 and 40
    or normalized_number !~ '^[A-Z0-9][A-Z0-9 /.-]{1,39}$' then
    raise exception 'Enter a valid KASNEB registration number (2 to 40 letters, numbers, spaces, dots, slashes, or hyphens).';
  end if;

  select * into student_record
  from public.students
  where user_id = auth.uid()
    and status = 'active'
  for update;
  if not found then
    raise exception 'An active student record is required to save your KASNEB number.';
  end if;
  if student_record.kasneb_number is not null then
    if student_record.kasneb_number <> normalized_number then
      raise exception 'A KASNEB number is already saved. Contact the Institute to correct it.';
    end if;
    return student_record.kasneb_number;
  end if;

  update public.students
  set kasneb_number = normalized_number
  where id = student_record.id;

  return normalized_number;
end;
$$;

revoke all on function public.save_my_kasneb_number(text) from public, anon;
grant execute on function public.save_my_kasneb_number(text) to authenticated;

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
