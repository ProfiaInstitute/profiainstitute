create table if not exists public.exam_sittings (
  id uuid primary key default gen_random_uuid(),
  exam_body text not null check (exam_body in ('KASNEB', 'TVETA', 'ICPAK', 'NITA', 'Other')),
  qualification text not null check (length(trim(qualification)) between 1 and 180),
  title text not null check (length(trim(title)) between 1 and 180),
  course_id uuid not null references public.courses(id) on delete restrict,
  level_id uuid not null references public.course_levels(id) on delete restrict,
  registration_deadline date,
  exam_date date,
  minimum_passing_score numeric(5,2) not null default 50 check (
    minimum_passing_score >= 0 and minimum_passing_score <= 100
  ),
  required_unit_ids uuid[] not null default '{}'::uuid[],
  status text not null default 'open' check (status in ('open', 'closed', 'completed')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.exam_sitting_candidates (
  id uuid primary key default gen_random_uuid(),
  sitting_id uuid not null references public.exam_sittings(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  status text not null default 'nominated' check (
    status in ('nominated', 'registered', 'sat', 'passed', 'failed', 'withdrawn')
  ),
  external_reference text,
  notes text,
  nominated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (sitting_id, student_id)
);

create index if not exists exam_sittings_course_level_idx
  on public.exam_sittings(course_id, level_id, status);
create index if not exists exam_candidates_sitting_status_idx
  on public.exam_sitting_candidates(sitting_id, status, created_at);
create index if not exists exam_candidates_student_idx
  on public.exam_sitting_candidates(student_id, created_at desc);

grant select, insert, update, delete on public.exam_sittings, public.exam_sitting_candidates to authenticated;
grant all on public.exam_sittings, public.exam_sitting_candidates to service_role;
alter table public.exam_sittings enable row level security;
alter table public.exam_sitting_candidates enable row level security;

drop policy if exists exam_sittings_staff_manage on public.exam_sittings;
create policy exam_sittings_staff_manage on public.exam_sittings
  for all to authenticated
  using (public.has_any_role(auth.uid(), array['super_admin', 'academic_admin']::public.app_role[]))
  with check (public.has_any_role(auth.uid(), array['super_admin', 'academic_admin']::public.app_role[]));

drop policy if exists exam_candidates_staff_manage on public.exam_sitting_candidates;
create policy exam_candidates_staff_manage on public.exam_sitting_candidates
  for all to authenticated
  using (public.has_any_role(auth.uid(), array['super_admin', 'academic_admin']::public.app_role[]))
  with check (public.has_any_role(auth.uid(), array['super_admin', 'academic_admin']::public.app_role[]));

create or replace function public.validate_exam_sitting()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1 from public.course_levels level
    where level.id = new.level_id and level.course_id = new.course_id
  ) then
    raise exception 'Choose a course level that belongs to the selected course.';
  end if;

  if exists (
    select 1
    from unnest(new.required_unit_ids) selected(unit_id)
    left join public.course_units unit
      on unit.id = selected.unit_id
      and unit.course_id = new.course_id
      and unit.level_id = new.level_id
    where unit.id is null
  ) then
    raise exception 'Required exam units must belong to the selected course level.';
  end if;

  if new.exam_date is not null
    and new.registration_deadline is not null
    and new.registration_deadline > new.exam_date then
    raise exception 'The registration deadline cannot be after the exam date.';
  end if;
  return new;
end;
$$;

drop trigger if exists exam_sittings_validate on public.exam_sittings;
create trigger exam_sittings_validate
  before insert or update on public.exam_sittings
  for each row execute function public.validate_exam_sitting();

drop trigger if exists exam_sittings_updated_at on public.exam_sittings;
create trigger exam_sittings_updated_at
  before update on public.exam_sittings
  for each row execute function public.touch_updated_at();

drop trigger if exists exam_candidates_updated_at on public.exam_sitting_candidates;
create trigger exam_candidates_updated_at
  before update on public.exam_sitting_candidates
  for each row execute function public.touch_updated_at();

drop trigger if exists exam_sittings_audit on public.exam_sittings;
create trigger exam_sittings_audit
  after insert or update or delete on public.exam_sittings
  for each row execute function public.audit_row();

drop trigger if exists exam_candidates_audit on public.exam_sitting_candidates;
create trigger exam_candidates_audit
  after insert or update or delete on public.exam_sitting_candidates
  for each row execute function public.audit_row();
