create table if not exists public.application_unit_selections (
  application_id uuid not null references public.applications(id) on delete cascade,
  unit_id uuid not null references public.course_units(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (application_id, unit_id)
);

alter table public.application_unit_selections enable row level security;
grant select on public.application_unit_selections to authenticated;
grant all on public.application_unit_selections to service_role;

drop policy if exists application_unit_selections_staff_read on public.application_unit_selections;
create policy application_unit_selections_staff_read on public.application_unit_selections
  for select to authenticated
  using (public.has_any_role(
    auth.uid(),
    array['super_admin','admissions_admin','academic_admin']::public.app_role[]
  ));

create table if not exists public.student_course_units (
  student_id uuid not null references public.students(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  level_id uuid references public.course_levels(id) on delete set null,
  unit_id uuid not null references public.course_units(id) on delete cascade,
  selected_at timestamptz not null default now(),
  primary key (student_id, course_id, unit_id)
);

create index if not exists student_course_units_student_course_idx
  on public.student_course_units(student_id, course_id);

alter table public.student_course_units enable row level security;
grant select on public.student_course_units to authenticated;
grant all on public.student_course_units to service_role;

drop policy if exists student_course_units_read on public.student_course_units;
create policy student_course_units_read on public.student_course_units
  for select to authenticated
  using (
    student_id = public.my_student_id()
    or public.has_any_role(
      auth.uid(),
      array['super_admin','academic_admin','admissions_admin']::public.app_role[]
    )
  );

create or replace function public.save_application_unit_selections(
  _application_id uuid,
  _token uuid,
  _unit_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  application_record public.applications%rowtype;
begin
  select * into application_record
  from public.applications
  where id = _application_id
    and upload_token = _token
    and created_at > now() - interval '2 hours'
  for update;
  if not found then
    raise exception 'This application is no longer available for updating.';
  end if;
  if application_record.status = 'enrolled' then
    raise exception 'Unit selections can no longer be changed on an enrolled application.';
  end if;
  if _unit_ids is null or cardinality(_unit_ids) > 100 then
    raise exception 'Select no more than 100 course units.';
  end if;
  if cardinality(_unit_ids) <> (
    select count(distinct selected.unit_id)::integer
    from unnest(_unit_ids) as selected(unit_id)
  ) then
    raise exception 'A course unit can only be selected once.';
  end if;
  if exists (
    select 1
    from unnest(_unit_ids) as selected(unit_id)
    left join public.course_units unit on unit.id = selected.unit_id
    where unit.id is null
      or unit.course_id is distinct from application_record.course_id
      or (unit.level_id is not null and unit.level_id is distinct from application_record.level_id)
  ) then
    raise exception 'Select units belonging to the chosen course and level.';
  end if;

  delete from public.application_unit_selections
  where application_id = _application_id;
  insert into public.application_unit_selections(application_id, unit_id)
  select _application_id, selected.unit_id
  from unnest(_unit_ids) as selected(unit_id);
end;
$$;

create or replace function public.admin_save_application_unit_selections(
  _application_id uuid,
  _unit_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  application_record public.applications%rowtype;
begin
  if not public.has_any_role(
    auth.uid(),
    array['super_admin','admissions_admin','academic_admin']::public.app_role[]
  ) then
    raise exception 'Only admissions or academic staff can update application unit selections.';
  end if;

  select * into application_record
  from public.applications
  where id = _application_id
  for update;
  if not found then
    raise exception 'Application not found.';
  end if;
  if application_record.status = 'enrolled' then
    raise exception 'Update the enrolled student units from the student record.';
  end if;
  if _unit_ids is null or cardinality(_unit_ids) > 100 then
    raise exception 'Select no more than 100 course units.';
  end if;
  if cardinality(_unit_ids) <> (
    select count(distinct selected.unit_id)::integer
    from unnest(_unit_ids) as selected(unit_id)
  ) then
    raise exception 'A course unit can only be selected once.';
  end if;
  if exists (
    select 1
    from unnest(_unit_ids) as selected(unit_id)
    left join public.course_units unit on unit.id = selected.unit_id
    where unit.id is null
      or unit.course_id is distinct from application_record.course_id
      or (unit.level_id is not null and unit.level_id is distinct from application_record.level_id)
  ) then
    raise exception 'Select units belonging to the chosen course and level.';
  end if;

  delete from public.application_unit_selections
  where application_id = _application_id;
  insert into public.application_unit_selections(application_id, unit_id)
  select _application_id, selected.unit_id
  from unnest(_unit_ids) as selected(unit_id);

  insert into public.audit_logs(actor_id, action, entity, entity_id, details)
  values (
    auth.uid(),
    'admin_application_units_updated',
    'application',
    _application_id::text,
    jsonb_build_object('unit_ids', to_jsonb(_unit_ids))
  );
end;
$$;

create or replace function public.replace_student_course_unit_selections(
  _student_id uuid,
  _course_id uuid,
  _unit_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  student_record public.students%rowtype;
  active_level_ids uuid[];
  has_active_enrollment boolean;
begin
  if _unit_ids is null or cardinality(_unit_ids) > 100 then
    raise exception 'Select no more than 100 course units.';
  end if;
  if cardinality(_unit_ids) <> (
    select count(distinct selected.unit_id)::integer
    from unnest(_unit_ids) as selected(unit_id)
  ) then
    raise exception 'A course unit can only be selected once.';
  end if;

  select * into student_record
  from public.students
  where id = _student_id and status = 'active';
  if not found then
    raise exception 'An active student record is required.';
  end if;

  select coalesce(array_agg(distinct enrollment.level_id)
      filter (where enrollment.level_id is not null), '{}'::uuid[]),
      coalesce(bool_or(true), false)
    into active_level_ids, has_active_enrollment
  from (
    select enrollment.level_id
    from public.enrollments enrollment
    where enrollment.student_id = _student_id
      and enrollment.course_id = _course_id
      and enrollment.status = 'active'
    union all
    select enrollment.level_id
    from public.online_course_enrollments enrollment
    where enrollment.student_id = _student_id
      and enrollment.course_id = _course_id
      and enrollment.status = 'active'
  ) enrollment;

  if not has_active_enrollment and student_record.course_id is distinct from _course_id then
    raise exception 'The student is not assigned to this active course.';
  end if;

  if exists (
    select 1
    from unnest(_unit_ids) as selected(unit_id)
    left join public.course_units unit on unit.id = selected.unit_id
    where unit.id is null
      or unit.course_id is distinct from _course_id
      or (
        unit.level_id is not null
        and cardinality(active_level_ids) > 0
        and not unit.level_id = any(active_level_ids)
      )
      or (
        unit.level_id is not null
        and cardinality(active_level_ids) = 0
        and not has_active_enrollment
        and student_record.level_id is not null
        and unit.level_id is distinct from student_record.level_id
      )
  ) then
    raise exception 'Select units belonging to the student''s active course and level.';
  end if;

  delete from public.student_course_units
  where student_id = _student_id and course_id = _course_id;
  insert into public.student_course_units(student_id, course_id, level_id, unit_id)
  select _student_id, _course_id, unit.level_id, unit.id
  from unnest(_unit_ids) as selected(unit_id)
  join public.course_units unit on unit.id = selected.unit_id;
end;
$$;

create or replace function public.save_my_course_unit_selections(
  _course_id uuid,
  _unit_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  student_id uuid;
begin
  student_id := public.my_student_id();
  if student_id is null then
    raise exception 'Your student record could not be found.';
  end if;
  perform public.replace_student_course_unit_selections(student_id, _course_id, _unit_ids);
end;
$$;

create or replace function public.admin_save_student_course_unit_selections(
  _student_id uuid,
  _course_id uuid,
  _unit_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.has_any_role(
    auth.uid(),
    array['super_admin','academic_admin']::public.app_role[]
  ) then
    raise exception 'Only academic administrators can update student unit selections.';
  end if;
  perform public.replace_student_course_unit_selections(_student_id, _course_id, _unit_ids);
  insert into public.audit_logs(actor_id, action, entity, entity_id, details)
  values (
    auth.uid(),
    'admin_student_units_updated',
    'student',
    _student_id::text,
    jsonb_build_object('course_id', _course_id, 'unit_ids', to_jsonb(_unit_ids))
  );
end;
$$;

create or replace function public.sync_application_unit_selections()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_student_id uuid;
begin
  if new.status = 'enrolled' and old.status is distinct from new.status then
    select coalesce(
      (
        select student.id
        from public.students student
        where student.application_id = new.id
        order by student.created_at desc
        limit 1
      ),
      (
        select enrollment.student_id
        from public.enrollments enrollment
        where enrollment.application_id = new.id
        order by enrollment.created_at desc
        limit 1
      ),
      (
        select enrollment.student_id
        from public.online_course_enrollments enrollment
        join public.students student on student.id = enrollment.student_id
        where enrollment.course_id = new.course_id
          and lower(student.email) = lower(new.email)
        order by enrollment.created_at desc
        limit 1
      )
    ) into v_student_id;

    if v_student_id is not null then
      update public.enrollments
      set level_id = new.level_id
      where application_id = new.id
        and course_id = new.course_id;

      update public.online_course_enrollments
      set level_id = new.level_id
      where student_id = v_student_id
        and course_id = new.course_id;

      insert into public.student_course_units(student_id, course_id, level_id, unit_id)
      select v_student_id, new.course_id, unit.level_id, selection.unit_id
      from public.application_unit_selections selection
      join public.course_units unit on unit.id = selection.unit_id
      where selection.application_id = new.id
        and unit.course_id = new.course_id
        and (unit.level_id is null or unit.level_id = new.level_id)
      on conflict (student_id, course_id, unit_id) do update
        set level_id = excluded.level_id,
            selected_at = now();
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists sync_application_unit_selections on public.applications;
create trigger sync_application_unit_selections
  after update of status on public.applications
  for each row execute function public.sync_application_unit_selections();

create or replace function public.admin_enroll_student_course(
  _student_id uuid,
  _course_id uuid,
  _level_id uuid default null,
  _intake_id uuid default null
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  student_record public.students%rowtype;
  course_record public.courses%rowtype;
  selected_level public.course_levels%rowtype;
  enrollment_id uuid;
  tuition numeric(12, 2);
  enrollment_exists boolean;
begin
  if not public.has_any_role(
    auth.uid(),
    array['super_admin','academic_admin']::public.app_role[]
  ) then
    raise exception 'Only academic administrators can enroll students in courses.';
  end if;

  select * into student_record
  from public.students
  where id = _student_id
  for update;
  if not found or student_record.status <> 'active' then
    raise exception 'An active student record is required.';
  end if;

  select * into course_record
  from public.courses
  where id = _course_id;
  if not found then
    raise exception 'The selected course could not be found.';
  end if;

  if _intake_id is not null and not exists (
    select 1 from public.intakes where id = _intake_id
  ) then
    raise exception 'The selected intake could not be found.';
  end if;

  if _level_id is not null then
    select * into selected_level
    from public.course_levels
    where id = _level_id and course_id = _course_id;
    if not found then
      raise exception 'The selected level does not belong to this course.';
    end if;
  end if;

  if student_record.study_mode = 'online' then
    if not course_record.available_online then
      raise exception 'This course is not available in the online study mode.';
    end if;
    select id into enrollment_id
    from public.online_course_enrollments
    where student_id = _student_id and course_id = _course_id and status = 'active'
    for update;
    enrollment_exists := found;

    if enrollment_exists then
      update public.online_course_enrollments
      set level_id = _level_id
      where id = enrollment_id;
    else
      tuition := coalesce(selected_level.total_fee, course_record.fees, 0);
      insert into public.online_course_enrollments(
        student_id, course_id, level_id, tuition_fee, certificate_fee, exam_fee, status
      ) values (
        _student_id, _course_id, _level_id, tuition,
        course_record.online_certificate_fee, course_record.online_exam_fee, 'active'
      )
      on conflict (student_id, course_id) do update
        set level_id = excluded.level_id,
            status = 'active'
      returning id into enrollment_id;
    end if;
  else
    select id into enrollment_id
    from public.enrollments
    where student_id = _student_id and course_id = _course_id and status = 'active'
    order by created_at desc
    limit 1
    for update;
    enrollment_exists := found;

    if enrollment_exists then
      update public.enrollments
      set level_id = _level_id,
          intake_id = coalesce(_intake_id, intake_id)
      where id = enrollment_id;
    else
      insert into public.enrollments(student_id, course_id, level_id, intake_id, status)
      values (_student_id, _course_id, _level_id, _intake_id, 'active')
      returning id into enrollment_id;
    end if;
  end if;

  delete from public.student_course_units selection
  using public.course_units unit
  where selection.student_id = _student_id
    and selection.course_id = _course_id
    and unit.id = selection.unit_id
    and unit.level_id is not null
    and unit.level_id is distinct from _level_id;

  update public.students
  set course_id = coalesce(course_id, _course_id),
      level_id = case when course_id is null or course_id = _course_id
        then _level_id else level_id end,
      intake_id = coalesce(intake_id, _intake_id)
  where id = _student_id;

  insert into public.audit_logs(actor_id, action, entity, entity_id, details)
  values (
    auth.uid(),
    case when enrollment_exists then 'admin_course_enrollment_updated'
      else 'admin_course_enrollment' end,
    'enrollments',
    enrollment_id::text,
    jsonb_build_object(
      'course', course_record.title,
      'level', selected_level.name,
      'student_number', student_record.student_number,
      'mode', student_record.study_mode
    )
  );

  if student_record.user_id is not null then
    insert into public.notifications(user_id, title, body, category)
    values (
      student_record.user_id,
      case when enrollment_exists then 'Course enrollment updated' else 'Course enrollment added' end,
      case when enrollment_exists
        then 'Your course level for ' || course_record.title || ' has been updated.'
        else 'You have been enrolled in ' || course_record.title || '. Course learning resources will appear in your portal.'
      end,
      'academics'
    );
  end if;

  if enrollment_exists then
    return case when student_record.study_mode = 'online'
      then 'updated_online' else 'updated_academic' end;
  end if;
  return case when student_record.study_mode = 'online' then 'online' else 'academic' end;
end;
$$;

revoke all on function public.save_application_unit_selections(uuid, uuid, uuid[]) from public, anon;
revoke all on function public.admin_save_application_unit_selections(uuid, uuid[]) from public, anon;
revoke all on function public.replace_student_course_unit_selections(uuid, uuid, uuid[]) from public, anon, authenticated;
revoke all on function public.save_my_course_unit_selections(uuid, uuid[]) from public, anon;
revoke all on function public.admin_save_student_course_unit_selections(uuid, uuid, uuid[]) from public, anon;
revoke all on function public.sync_application_unit_selections() from public, anon, authenticated;
revoke all on function public.admin_enroll_student_course(uuid, uuid, uuid, uuid) from public, anon;

grant execute on function public.save_application_unit_selections(uuid, uuid, uuid[]) to anon, authenticated;
grant execute on function public.admin_save_application_unit_selections(uuid, uuid[]) to authenticated;
grant execute on function public.save_my_course_unit_selections(uuid, uuid[]) to authenticated;
grant execute on function public.admin_save_student_course_unit_selections(uuid, uuid, uuid[]) to authenticated;
grant execute on function public.admin_enroll_student_course(uuid, uuid, uuid, uuid) to authenticated;
