create or replace function public.save_cat_assessment_mark(
  _assessment_id uuid,
  _student_number text,
  _score integer
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  assessment_record public.cat_assessments%rowtype;
  student_record public.students%rowtype;
  effective_level_ids uuid[];
  unit_level_id uuid;
  attempt_level_id uuid;
  maximum_score integer;
  is_eligible boolean;
begin
  if not public.has_any_role(
    auth.uid(),
    array['super_admin', 'academic_admin']::public.app_role[]
  ) then
    raise exception 'Only academic staff can enter or edit CAT marks.';
  end if;

  select * into assessment_record
  from public.cat_assessments
  where id = _assessment_id
  for update;
  if not found then
    raise exception 'CAT not found.';
  end if;

  select coalesce(sum(question.points), 0)::integer into maximum_score
  from public.cat_questions question
  where question.assessment_id = assessment_record.id;
  if maximum_score <= 0 or _score is null or _score < 0 or _score > maximum_score then
    raise exception 'Enter a mark from 0 to the CAT maximum of %.', maximum_score;
  end if;

  select * into student_record
  from public.students
  where student_number = nullif(btrim(_student_number), '') and status = 'active';
  if not found then
    raise exception 'Select an active student.';
  end if;

  if exists (
    select 1 from public.cat_assessment_students target
    where target.assessment_id = assessment_record.id
  ) then
    if not exists (
      select 1 from public.cat_assessment_students target
      where target.assessment_id = assessment_record.id
        and target.student_id = student_record.id
    ) then
      raise exception 'This student is not assigned to the selected CAT.';
    end if;
  else
    select unit.level_id into unit_level_id
    from public.course_units unit
    where unit.id = assessment_record.unit_id;

    effective_level_ids := case
      when unit_level_id is not null then array[unit_level_id]
      else coalesce(assessment_record.level_ids, '{}'::uuid[])
    end;

    select exists (
      select 1
      from public.enrollments enrollment
      where enrollment.student_id = student_record.id
        and enrollment.course_id = assessment_record.course_id
        and enrollment.status = 'active'
        and (
          cardinality(effective_level_ids) = 0
          or enrollment.level_id = any(effective_level_ids)
        )
    ) or exists (
      select 1
      from public.online_course_enrollments enrollment
      where enrollment.student_id = student_record.id
        and enrollment.course_id = assessment_record.course_id
        and enrollment.status = 'active'
        and (
          cardinality(effective_level_ids) = 0
          or enrollment.level_id = any(effective_level_ids)
        )
    ) or (
      student_record.course_id = assessment_record.course_id
      and (
        cardinality(effective_level_ids) = 0
        or student_record.level_id = any(effective_level_ids)
      )
      and not exists (
        select 1 from public.enrollments enrollment
        where enrollment.student_id = student_record.id
          and enrollment.course_id = assessment_record.course_id
          and enrollment.status = 'active'
          and enrollment.level_id is not null
      )
      and not exists (
        select 1 from public.online_course_enrollments enrollment
        where enrollment.student_id = student_record.id
          and enrollment.course_id = assessment_record.course_id
          and enrollment.status = 'active'
          and enrollment.level_id is not null
      )
    ) into is_eligible;

    if not is_eligible then
      raise exception 'Select an active student enrolled in this CAT course and level.';
    end if;
  end if;

    if exists (
      select 1
      from public.cat_attempts attempt
      where attempt.assessment_id = assessment_record.id
        and attempt.student_id = student_record.id
        and attempt.submitted_at is null
    ) then
      raise exception 'This student has an in-progress CAT attempt. Wait for submission before adding a manual mark.';
    end if;

  select enrollment.level_id into attempt_level_id
  from public.enrollments enrollment
  where enrollment.student_id = student_record.id
    and enrollment.course_id = assessment_record.course_id
    and enrollment.status = 'active'
    and (cardinality(coalesce(effective_level_ids, '{}'::uuid[])) = 0
      or enrollment.level_id = any(effective_level_ids))
  order by enrollment.created_at desc
  limit 1;

  if attempt_level_id is null then
    select enrollment.level_id into attempt_level_id
    from public.online_course_enrollments enrollment
    where enrollment.student_id = student_record.id
      and enrollment.course_id = assessment_record.course_id
      and enrollment.status = 'active'
      and (cardinality(coalesce(effective_level_ids, '{}'::uuid[])) = 0
        or enrollment.level_id = any(effective_level_ids))
    order by enrollment.created_at desc
    limit 1;
  end if;
  attempt_level_id := coalesce(attempt_level_id, student_record.level_id);

  insert into public.cat_attempts as existing_attempt (
    assessment_id, student_id, course_level_id, submitted_at, score, max_score
  ) values (
    assessment_record.id, student_record.id, attempt_level_id, now(), _score, maximum_score
  )
  on conflict (assessment_id, student_id) do update
    set course_level_id = coalesce(existing_attempt.course_level_id, excluded.course_level_id),
      submitted_at = coalesce(existing_attempt.submitted_at, excluded.submitted_at),
        score = excluded.score,
        max_score = excluded.max_score;
end;
$$;

revoke all on function public.save_cat_assessment_mark(uuid, text, integer) from public, anon;
grant execute on function public.save_cat_assessment_mark(uuid, text, integer) to authenticated;

create or replace function public.list_cat_mark_candidates(_assessment_id uuid)
returns table (student_number text, student_name text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  assessment_record public.cat_assessments%rowtype;
  unit_level_id uuid;
  effective_level_ids uuid[];
begin
  if not public.has_any_role(
    auth.uid(),
    array['super_admin', 'academic_admin']::public.app_role[]
  ) then
    raise exception 'Only academic staff can review CAT students.';
  end if;

  select * into assessment_record
  from public.cat_assessments
  where id = _assessment_id;
  if not found then
    raise exception 'CAT not found.';
  end if;

  select unit.level_id into unit_level_id
  from public.course_units unit
  where unit.id = assessment_record.unit_id;
  effective_level_ids := case
    when unit_level_id is not null then array[unit_level_id]
    else coalesce(assessment_record.level_ids, '{}'::uuid[])
  end;

  return query
  select student.student_number,
         concat_ws(' ', student.first_name, student.middle_name, student.last_name)
    from public.students student
   where student.status = 'active'
     and (
       exists (
         select 1 from public.cat_assessment_students target
         where target.assessment_id = assessment_record.id
           and target.student_id = student.id
       )
       or (
         not exists (
           select 1 from public.cat_assessment_students target
           where target.assessment_id = assessment_record.id
         )
         and (
           exists (
             select 1 from public.enrollments enrollment
             where enrollment.student_id = student.id
               and enrollment.course_id = assessment_record.course_id
               and enrollment.status = 'active'
               and (cardinality(effective_level_ids) = 0
                 or enrollment.level_id = any(effective_level_ids))
           )
           or exists (
             select 1 from public.online_course_enrollments enrollment
             where enrollment.student_id = student.id
               and enrollment.course_id = assessment_record.course_id
               and enrollment.status = 'active'
               and (cardinality(effective_level_ids) = 0
                 or enrollment.level_id = any(effective_level_ids))
           )
           or (
             student.course_id = assessment_record.course_id
             and (cardinality(effective_level_ids) = 0
               or student.level_id = any(effective_level_ids))
             and not exists (
               select 1 from public.enrollments enrollment
               where enrollment.student_id = student.id
                 and enrollment.course_id = assessment_record.course_id
                 and enrollment.status = 'active'
                 and enrollment.level_id is not null
             )
             and not exists (
               select 1 from public.online_course_enrollments enrollment
               where enrollment.student_id = student.id
                 and enrollment.course_id = assessment_record.course_id
                 and enrollment.status = 'active'
                 and enrollment.level_id is not null
             )
           )
         )
       )
     )
   order by student.last_name, student.first_name, student.student_number;
end;
$$;

revoke all on function public.list_cat_mark_candidates(uuid) from public, anon;
grant execute on function public.list_cat_mark_candidates(uuid) to authenticated;

create or replace function public.save_fee_balance_reminder_template(_template jsonb)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.has_role(auth.uid(), 'super_admin') then
    raise exception 'Only super admins can edit the fee reminder template.';
  end if;
  if jsonb_typeof(_template) is distinct from 'object'
    or nullif(btrim(_template->>'subject'), '') is null
    or length(btrim(_template->>'subject')) > 200
    or _template->>'subject' ~ E'[\\r\\n]'
    or nullif(btrim(_template->>'body'), '') is null
    or length(_template->>'body') > 10000 then
    raise exception 'Enter a valid fee reminder subject and message.';
  end if;

  insert into public.site_settings (key, value, updated_by)
  values ('fees.balance_reminder_template', _template, auth.uid())
  on conflict (key) do update
    set value = excluded.value,
        updated_by = excluded.updated_by,
        updated_at = now();
end;
$$;

revoke all on function public.save_fee_balance_reminder_template(jsonb) from public, anon;
grant execute on function public.save_fee_balance_reminder_template(jsonb) to authenticated;
