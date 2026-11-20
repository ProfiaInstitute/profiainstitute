create table if not exists public.live_class_sessions (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.course_units(id) on delete restrict,
  facilitator_id uuid not null references auth.users(id) on delete restrict,
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  title text not null check (length(trim(title)) between 3 and 160),
  description text,
  scheduled_at timestamptz not null,
  duration_minutes integer not null default 60 check (duration_minutes between 15 and 240),
  status text not null default 'scheduled'
    check (status in ('scheduled', 'live', 'ended', 'cancelled')),
  room_name text not null unique default ('profia-' || gen_random_uuid()::text),
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists live_class_sessions_unit_schedule_idx
  on public.live_class_sessions(unit_id, scheduled_at desc);
create index if not exists live_class_sessions_facilitator_schedule_idx
  on public.live_class_sessions(facilitator_id, scheduled_at desc);

create table if not exists public.live_class_members (
  session_id uuid not null references public.live_class_sessions(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  assigned_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (session_id, student_id)
);

create table if not exists public.live_class_attendance (
  session_id uuid not null references public.live_class_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  participant_role text not null check (participant_role in ('student', 'facilitator', 'admin')),
  first_joined_at timestamptz not null default now(),
  last_left_at timestamptz,
  join_count integer not null default 1 check (join_count > 0),
  primary key (session_id, user_id)
);

create or replace function public.record_live_class_join(
  _session_id uuid,
  _user_id uuid,
  _participant_role text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.role() = 'authenticated'
    or _participant_role not in ('student', 'facilitator', 'admin') then
    raise exception 'Live class attendance can only be recorded by the trusted service.';
  end if;

  insert into public.live_class_attendance(session_id, user_id, participant_role)
  values (_session_id, _user_id, _participant_role)
  on conflict (session_id, user_id) do update
    set participant_role = excluded.participant_role,
        last_left_at = null,
        join_count = public.live_class_attendance.join_count + 1;
end;
$$;

create or replace function public.record_live_class_leave(
  _session_id uuid,
  _user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Live class attendance can only be recorded by the trusted service.';
  end if;

  update public.live_class_attendance
  set last_left_at = now()
  where session_id = _session_id and user_id = _user_id;
end;
$$;

create or replace function public.audit_live_class_member_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  changed_member public.live_class_members%rowtype;
begin
  changed_member := case when tg_op = 'DELETE' then old else new end;
  perform public.log_action(
    'live_class_member_' || lower(tg_op),
    'live_class_members',
    changed_member.session_id::text || ':' || changed_member.student_id::text,
    jsonb_build_object(
      'session_id', changed_member.session_id,
      'student_id', changed_member.student_id
    )
  );
  return coalesce(new, old);
end;
$$;

create or replace function public.guard_live_class_status_updates()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if auth.role() is distinct from 'service_role'
    and (
      new.status is distinct from old.status
      or new.started_at is distinct from old.started_at
      or new.ended_at is distinct from old.ended_at
    ) then
    raise exception 'Use the live-class controls to change session status.';
  end if;
  return new;
end;
$$;

alter table public.live_class_sessions enable row level security;
alter table public.live_class_members enable row level security;
alter table public.live_class_attendance enable row level security;

grant select, insert, update on public.live_class_sessions to authenticated;
grant select, insert, delete on public.live_class_members to authenticated;
grant select on public.live_class_attendance to authenticated;
grant all on public.live_class_sessions to service_role;
grant all on public.live_class_members to service_role;
grant all on public.live_class_attendance to service_role;

create or replace function public.can_manage_live_class(_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null and exists (
    select 1
    from public.live_class_sessions session
    where session.id = _session_id
      and (
        public.has_any_role(
          auth.uid(),
          array['super_admin','academic_admin']::public.app_role[]
        )
        or (
          session.facilitator_id = auth.uid()
          and public.facilitator_unit_permission(auth.uid(), session.unit_id)
        )
      )
  );
$$;

create or replace function public.can_join_live_class(_session_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  session_record public.live_class_sessions%rowtype;
  unit_record public.course_units%rowtype;
  student_record public.students%rowtype;
begin
  if auth.uid() is null then
    return false;
  end if;

  select * into session_record
  from public.live_class_sessions
  where id = _session_id
    and status in ('scheduled', 'live');
  if not found then
    return false;
  end if;

  if public.has_any_role(
    auth.uid(),
    array['super_admin','academic_admin']::public.app_role[]
  ) then
    return true;
  end if;

  if session_record.facilitator_id = auth.uid()
    and public.facilitator_unit_permission(auth.uid(), session_record.unit_id) then
    return true;
  end if;

  select * into student_record
  from public.students
  where user_id = auth.uid() and status = 'active';
  if not found then
    return false;
  end if;

  if exists (
    select 1 from public.live_class_members member
    where member.session_id = _session_id and member.student_id = student_record.id
  ) then
    return true;
  end if;

  select * into unit_record
  from public.course_units
  where id = session_record.unit_id;
  if not found then
    return false;
  end if;

  if exists (
    select 1
    from public.enrollments enrollment
    where enrollment.student_id = student_record.id
      and enrollment.course_id = unit_record.course_id
      and enrollment.status = 'active'
      and (unit_record.level_id is null or enrollment.level_id is null
        or enrollment.level_id = unit_record.level_id)
  ) then
    return true;
  end if;

  if exists (
    select 1
    from public.online_course_enrollments enrollment
    where enrollment.student_id = student_record.id
      and enrollment.course_id = unit_record.course_id
      and enrollment.status = 'active'
      and (unit_record.level_id is null or enrollment.level_id is null
        or enrollment.level_id = unit_record.level_id)
      and (
        enrollment.tuition_fee = 0
        or coalesce((
          select sum(payment.amount)
          from public.online_course_payments payment
          where payment.enrollment_id = enrollment.id
            and payment.status = 'confirmed'
            and payment.stage in ('tuition_30', 'tuition_balance')
        ), 0) >= ceil(enrollment.tuition_fee * 0.30)
      )
  ) then
    return true;
  end if;

  return student_record.study_mode <> 'online'
    and student_record.course_id = unit_record.course_id
    and (unit_record.level_id is null or student_record.level_id is null
      or student_record.level_id = unit_record.level_id);
end;
$$;

revoke all on function public.can_manage_live_class(uuid) from public, anon;
revoke all on function public.can_join_live_class(uuid) from public, anon;
revoke all on function public.record_live_class_join(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.record_live_class_leave(uuid, uuid) from public, anon, authenticated;
grant execute on function public.can_manage_live_class(uuid) to authenticated, service_role;
grant execute on function public.can_join_live_class(uuid) to authenticated, service_role;
grant execute on function public.record_live_class_join(uuid, uuid, text) to service_role;
grant execute on function public.record_live_class_leave(uuid, uuid) to service_role;

drop policy if exists live_class_sessions_read on public.live_class_sessions;
create policy live_class_sessions_read on public.live_class_sessions
  for select to authenticated
  using (
    public.can_join_live_class(id)
    or public.can_manage_live_class(id)
    or public.has_any_role(
      auth.uid(),
      array['super_admin','academic_admin']::public.app_role[]
    )
  );

drop policy if exists live_class_sessions_insert on public.live_class_sessions;
create policy live_class_sessions_insert on public.live_class_sessions
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and status = 'scheduled'
    and started_at is null
    and ended_at is null
    and (
      public.has_any_role(
        auth.uid(),
        array['super_admin','academic_admin']::public.app_role[]
      )
      or (
        facilitator_id = auth.uid()
        and public.facilitator_unit_permission(auth.uid(), unit_id)
      )
    )
  );

drop policy if exists live_class_sessions_update on public.live_class_sessions;
create policy live_class_sessions_update on public.live_class_sessions
  for update to authenticated
  using (
    public.has_any_role(
      auth.uid(),
      array['super_admin','academic_admin']::public.app_role[]
    )
    or (
      facilitator_id = auth.uid()
      and public.facilitator_unit_permission(auth.uid(), unit_id)
    )
  )
  with check (
    public.has_any_role(
      auth.uid(),
      array['super_admin','academic_admin']::public.app_role[]
    )
    or (
      facilitator_id = auth.uid()
      and public.facilitator_unit_permission(auth.uid(), unit_id)
    )
  );

drop policy if exists live_class_members_read on public.live_class_members;
create policy live_class_members_read on public.live_class_members
  for select to authenticated
  using (
    student_id = public.my_student_id()
    or public.can_manage_live_class(session_id)
    or public.has_any_role(
      auth.uid(),
      array['super_admin','academic_admin']::public.app_role[]
    )
  );

drop policy if exists live_class_members_admin_manage on public.live_class_members;
create policy live_class_members_admin_manage on public.live_class_members
  for all to authenticated
  using (
    public.has_any_role(
      auth.uid(),
      array['super_admin','academic_admin']::public.app_role[]
    )
  )
  with check (
    public.has_any_role(
      auth.uid(),
      array['super_admin','academic_admin']::public.app_role[]
    )
    and assigned_by = auth.uid()
  );

drop policy if exists live_class_attendance_read on public.live_class_attendance;
create policy live_class_attendance_read on public.live_class_attendance
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.can_manage_live_class(session_id)
    or public.has_any_role(
      auth.uid(),
      array['super_admin','academic_admin']::public.app_role[]
    )
  );

drop trigger if exists live_class_sessions_updated_at on public.live_class_sessions;
create trigger live_class_sessions_updated_at
  before update on public.live_class_sessions
  for each row execute function public.touch_updated_at();

drop trigger if exists live_class_sessions_status_guard on public.live_class_sessions;
create trigger live_class_sessions_status_guard
  before update on public.live_class_sessions
  for each row execute function public.guard_live_class_status_updates();

drop trigger if exists live_class_members_audit on public.live_class_members;
create trigger live_class_members_audit
  after insert or delete on public.live_class_members
  for each row execute function public.audit_live_class_member_change();
