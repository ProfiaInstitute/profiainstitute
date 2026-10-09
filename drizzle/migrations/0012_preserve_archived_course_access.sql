drop policy if exists "courses read" on public.courses;
create policy "courses read" on public.courses
  for select to anon, authenticated
  using (
    published
    or public.is_staff(auth.uid())
    or exists (
      select 1 from public.enrollments e
      where e.course_id = courses.id and e.student_id = public.my_student_id()
    )
    or exists (
      select 1 from public.online_course_enrollments e
      where e.course_id = courses.id and e.student_id = public.my_student_id()
    )
  );

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
    and (
      exists (
        select 1 from public.courses c
        where c.id = l.course_id and c.published and c.available_online
      )
      or exists (
        select 1 from public.online_course_enrollments e
        join public.students s on s.id = e.student_id
        where e.course_id = l.course_id and s.user_id = auth.uid()
      )
    )
  order by l.sort_order, l.created_at;
$$;

revoke all on function public.list_online_course_lessons(uuid) from public;
grant execute on function public.list_online_course_lessons(uuid) to anon, authenticated;
