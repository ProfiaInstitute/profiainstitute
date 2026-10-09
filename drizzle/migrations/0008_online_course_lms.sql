alter table public.courses
  add column if not exists online_syllabus text,
  add column if not exists online_intro_video_url text,
  add column if not exists online_lecturer_name text,
  add column if not exists online_lecturer_email text,
  add column if not exists online_lecturer_phone text,
  add column if not exists online_certificate_fee numeric(12, 2) not null default 0,
  add column if not exists online_exam_fee numeric(12, 2) not null default 0;

create table if not exists public.online_course_lessons (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  section_title text not null default 'Course lessons',
  title text not null,
  description text,
  notes text,
  video_url text,
  file_path text,
  file_type text,
  duration_seconds integer not null default 0 check (duration_seconds >= 0),
  is_preview boolean not null default false,
  sort_order integer not null default 0,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists online_course_lessons_order_idx
  on public.online_course_lessons(course_id, sort_order, created_at);
alter table public.online_course_lessons enable row level security;
grant select, insert, update, delete on public.online_course_lessons to authenticated;
grant all on public.online_course_lessons to service_role;
drop policy if exists online_lesson_staff_manage on public.online_course_lessons;
create policy online_lesson_staff_manage on public.online_course_lessons for all to authenticated
  using (public.has_any_role(auth.uid(), array['super_admin','academic_admin']::public.app_role[]))
  with check (public.has_any_role(auth.uid(), array['super_admin','academic_admin']::public.app_role[]));
drop trigger if exists t_online_course_lessons_updated_at on public.online_course_lessons;
create trigger t_online_course_lessons_updated_at before update on public.online_course_lessons
  for each row execute function public.touch_updated_at();

create table if not exists public.online_course_enrollments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete restrict,
  tuition_fee numeric(12, 2) not null check (tuition_fee >= 0),
  certificate_fee numeric(12, 2) not null default 0 check (certificate_fee >= 0),
  exam_fee numeric(12, 2) not null default 0 check (exam_fee >= 0),
  status text not null default 'active' check (status in ('active','completed','cancelled')),
  created_at timestamptz not null default now(),
  unique (student_id, course_id)
);
create index if not exists online_course_enrollments_student_idx
  on public.online_course_enrollments(student_id, status);
alter table public.online_course_enrollments enable row level security;
grant select on public.online_course_enrollments to authenticated;
grant all on public.online_course_enrollments to service_role;
drop policy if exists online_course_enrollment_read on public.online_course_enrollments;
create policy online_course_enrollment_read on public.online_course_enrollments for select to authenticated
  using (student_id = public.my_student_id()
    or public.has_any_role(auth.uid(), array['super_admin','academic_admin']::public.app_role[]));

create table if not exists public.online_lesson_progress (
  lesson_id uuid not null references public.online_course_lessons(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  completed_at timestamptz not null default now(),
  primary key (lesson_id, student_id)
);
alter table public.online_lesson_progress enable row level security;
grant select on public.online_lesson_progress to authenticated;
grant all on public.online_lesson_progress to service_role;
drop policy if exists online_lesson_progress_read on public.online_lesson_progress;
create policy online_lesson_progress_read on public.online_lesson_progress for select to authenticated
  using (student_id = public.my_student_id()
    or public.has_any_role(auth.uid(), array['super_admin','academic_admin']::public.app_role[]));

create table if not exists public.online_course_payments (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.online_course_enrollments(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete restrict,
  stage text not null check (stage in ('tuition_30','tuition_balance','certificate_fee','exam_fee')),
  amount numeric(12, 2) not null check (amount > 0),
  reference text not null unique,
  provider_checkout_id text unique,
  status text not null default 'pending' check (status in ('pending','confirmed','failed')),
  provider text not null default 'payhero',
  raw jsonb not null default '{}'::jsonb,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists online_course_payments_enrollment_status_idx
  on public.online_course_payments(enrollment_id, status);
create unique index if not exists online_course_payments_one_pending_per_enrollment_idx
  on public.online_course_payments(enrollment_id) where status = 'pending';
alter table public.online_course_payments enable row level security;
grant select on public.online_course_payments to authenticated;
grant all on public.online_course_payments to service_role;
drop policy if exists online_course_payment_read on public.online_course_payments;
create policy online_course_payment_read on public.online_course_payments for select to authenticated
  using (student_id = public.my_student_id()
    or public.has_any_role(auth.uid(), array['super_admin','academic_admin']::public.app_role[]));

create or replace function public.enroll_online_course(_course_id uuid, _phone text)
returns table(student_id uuid, enrollment_id uuid, student_number text)
language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(trim(coalesce(auth.jwt()->>'email', '')));
  v_name text := trim(coalesce(auth.jwt()->'user_metadata'->>'full_name', ''));
  v_first text := split_part(v_name, ' ', 1);
  v_last text := nullif(trim(substr(v_name, length(v_first) + 1)), '');
  v_student_id uuid;
  v_enrollment_id uuid;
  v_student_number text;
begin
  if auth.uid() is null or v_email = '' then raise exception 'Sign in with a confirmed email to enroll'; end if;
  if coalesce(trim(_phone), '') !~ '^\+?[0-9 ]{9,15}$' then raise exception 'Enter a valid mobile number for course payments'; end if;
  if not exists (
    select 1 from public.courses c where c.id = _course_id
      and c.published and c.available_online and c.fees is not null and c.fees >= 0
  ) then raise exception 'This online course is not available for enrollment'; end if;

  select s.id, s.student_number into v_student_id, v_student_number
    from public.students s where s.user_id = auth.uid() for update;
  if v_student_id is null then
    select s.id, s.student_number into v_student_id, v_student_number
      from public.students s
     where lower(s.email) = v_email and s.user_id is null
     order by s.created_at limit 1 for update;
    if v_student_id is not null then
      update public.students s set user_id = auth.uid(), phone = trim(_phone)
       where s.id = v_student_id;
    end if;
  else
    update public.students s set phone = trim(_phone) where s.id = v_student_id;
  end if;

  if v_student_id is null then
    insert into public.students as new_student (
      user_id, student_number, first_name, last_name, email, phone, study_mode, status
    ) values (
      auth.uid(), '', coalesce(nullif(v_first, ''), 'Online'), coalesce(v_last, 'Learner'),
      v_email, trim(_phone), 'online', 'active'
    ) returning new_student.id, new_student.student_number into v_student_id, v_student_number;
  end if;
  if exists (select 1 from public.students s where s.id = v_student_id and s.status = 'suspended') then
    raise exception 'This student account is suspended';
  end if;

  insert into public.online_course_enrollments (
    student_id, course_id, tuition_fee, certificate_fee, exam_fee
  )
  select v_student_id, c.id, c.fees, c.online_certificate_fee, c.online_exam_fee
    from public.courses c where c.id = _course_id
  on conflict on constraint online_course_enrollments_student_id_course_id_key do nothing;
  select e.id into v_enrollment_id from public.online_course_enrollments e
   where e.student_id = v_student_id and e.course_id = _course_id;
  return query select v_student_id, v_enrollment_id, v_student_number;
end;
$$;
revoke all on function public.enroll_online_course(uuid, text) from public, anon;
grant execute on function public.enroll_online_course(uuid, text) to authenticated;

create or replace function public.can_access_online_lesson(_lesson_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.online_course_lessons l
    join public.online_course_enrollments e on e.course_id = l.course_id and e.status = 'active'
    join public.students s on s.id = e.student_id and s.user_id = auth.uid()
    where l.id = _lesson_id and l.published
      and (
        l.is_preview
        or coalesce((select sum(p.amount) from public.online_course_payments p
          where p.enrollment_id = e.id and p.status = 'confirmed'
            and p.stage in ('tuition_30','tuition_balance')), 0) >= ceil(e.tuition_fee)
        or (
          e.tuition_fee > 0
          and coalesce((select sum(p.amount) from public.online_course_payments p
            where p.enrollment_id = e.id and p.status = 'confirmed'
              and p.stage in ('tuition_30','tuition_balance')), 0) >= ceil(e.tuition_fee * 0.30)
          and (
            select coalesce(sum(rest.duration_seconds), 0)
              from public.online_course_lessons rest
             where rest.course_id = l.course_id and rest.published and not rest.is_preview
          ) > 0
          and coalesce((
            select sum(prior.duration_seconds) from public.online_course_lessons prior
             where prior.course_id = l.course_id and prior.published and not prior.is_preview
               and (prior.sort_order, prior.created_at, prior.id) <= (l.sort_order, l.created_at, l.id)
          ), 0) <= (
            select coalesce(sum(rest.duration_seconds), 0) * 0.30
              from public.online_course_lessons rest
             where rest.course_id = l.course_id and rest.published and not rest.is_preview
          )
        )
      )
  );
$$;
revoke all on function public.can_access_online_lesson(uuid) from public, anon;
grant execute on function public.can_access_online_lesson(uuid) to authenticated;

create or replace function public.list_online_course_lessons(_course_id uuid)
returns table(
  id uuid, section_title text, title text, description text, notes text,
  video_url text, file_path text, file_type text, duration_seconds integer, is_preview boolean,
  sort_order integer, completed boolean, locked boolean
)
language sql stable security definer set search_path = public as $$
  select l.id, l.section_title, l.title, l.description,
    case when allowed.can_view then l.notes else null end,
    case when allowed.can_view then l.video_url else null end,
    case when allowed.can_view then l.file_path else null end,
    case when allowed.can_view then l.file_type else null end,
    l.duration_seconds, l.is_preview, l.sort_order,
    exists (select 1 from public.online_lesson_progress p
      where p.lesson_id = l.id and p.student_id = public.my_student_id()),
    not allowed.can_view
  from public.online_course_lessons l
  cross join lateral (select
    l.is_preview
    or public.can_access_online_lesson(l.id)
    or exists (
      select 1 from public.online_course_enrollments e
      join public.students s on s.id = e.student_id and s.user_id = auth.uid()
      join public.online_course_payments p on p.enrollment_id = e.id
        and p.status = 'confirmed' and p.stage in ('tuition_30','tuition_balance')
      where e.course_id = l.course_id and e.status = 'active'
      group by e.id, e.tuition_fee
      having sum(p.amount) >= ceil(e.tuition_fee)
    )
  ) allowed(can_view)
  where l.course_id = _course_id and l.published
    and exists (select 1 from public.courses c
      where c.id = l.course_id and c.published and c.available_online)
  order by l.sort_order, l.created_at;
$$;
revoke all on function public.list_online_course_lessons(uuid) from public;
grant execute on function public.list_online_course_lessons(uuid) to anon, authenticated;

create or replace function public.can_access_online_lesson_file(_file_path text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.online_course_lessons l
    where l.file_path = _file_path and l.published
      and (l.is_preview or public.can_access_online_lesson(l.id))
  );
$$;
revoke all on function public.can_access_online_lesson_file(text) from public, anon;
grant execute on function public.can_access_online_lesson_file(text) to anon, authenticated;

create or replace function public.complete_online_lesson(_lesson_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.my_student_id() is null then raise exception 'Student sign-in required'; end if;
  if not public.can_access_online_lesson(_lesson_id) then raise exception 'This lesson is locked'; end if;
  insert into public.online_lesson_progress(lesson_id, student_id)
  values (_lesson_id, public.my_student_id()) on conflict (lesson_id, student_id)
  do update set completed_at = now();
end;
$$;
revoke all on function public.complete_online_lesson(uuid) from public, anon;
grant execute on function public.complete_online_lesson(uuid) to authenticated;

drop policy if exists learning_online_lesson_access on storage.objects;
create policy learning_online_lesson_access on storage.objects for select to anon, authenticated
  using (bucket_id = 'learning' and public.can_access_online_lesson_file(storage.objects.name));