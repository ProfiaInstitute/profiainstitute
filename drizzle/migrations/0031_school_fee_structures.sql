alter table public.course_levels
  add column if not exists fee_structure_file_name text;

update public.course_levels
set fee_structure_file_name = regexp_replace(
  substring(fee_structure_path from '[^/]+$'),
  '^[0-9a-fA-F-]{36}-',
  ''
)
where fee_structure_path is not null
  and fee_structure_file_name is null;

update public.course_levels
set fee_structure_url = null
where fee_structure_path is not null
  and fee_structure_url like '%/storage/v1/object/public/course-fee-structures/%';

create table if not exists public.school_fee_structures (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  title text not null,
  description text,
  file_path text not null,
  file_name text not null,
  published boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint school_fee_structures_title_not_blank check (length(trim(title)) > 0)
);

create index if not exists school_fee_structures_school_order_idx
  on public.school_fee_structures(school_id, published, sort_order, created_at desc);

grant select on public.school_fee_structures to anon, authenticated;
grant insert, update, delete on public.school_fee_structures to authenticated;
grant all on public.school_fee_structures to service_role;
alter table public.school_fee_structures enable row level security;

drop policy if exists school_fee_structures_public_read on public.school_fee_structures;
create policy school_fee_structures_public_read on public.school_fee_structures
  for select to anon, authenticated using (
    (published and exists (
      select 1 from public.schools s
      where s.id = school_id and s.published
    ))
    or public.has_any_role(
      auth.uid(),
      array['super_admin','academic_admin']::public.app_role[]
    )
  );

drop policy if exists school_fee_structures_admin_manage on public.school_fee_structures;
create policy school_fee_structures_admin_manage on public.school_fee_structures
  for all to authenticated
  using (public.has_any_role(
    auth.uid(),
    array['super_admin','academic_admin']::public.app_role[]
  ))
  with check (public.has_any_role(
    auth.uid(),
    array['super_admin','academic_admin']::public.app_role[]
  ));

drop trigger if exists school_fee_structures_updated_at on public.school_fee_structures;
create trigger school_fee_structures_updated_at
  before update on public.school_fee_structures
  for each row execute function public.touch_updated_at();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'course-fee-structures',
  'course-fee-structures',
  false,
  10485760,
  array['application/pdf']::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists course_fee_structures_read on storage.objects;
create policy course_fee_structures_public_read on storage.objects
  for select to anon, authenticated using (
    bucket_id = 'course-fee-structures'
    and (
      exists (
        select 1
        from public.course_levels l
        join public.courses c on c.id = l.course_id
        where l.fee_structure_path = name
          and l.published
          and c.published
      )
      or exists (
        select 1
        from public.school_fee_structures f
        join public.schools s on s.id = f.school_id
        where f.file_path = name
          and f.published
          and s.published
      )
    )
  );

drop policy if exists course_fee_structures_authenticated_read on storage.objects;
create policy course_fee_structures_authenticated_read on storage.objects
  for select to authenticated using (
    bucket_id = 'course-fee-structures'
    and (
      public.has_any_role(
        auth.uid(),
        array['super_admin','academic_admin']::public.app_role[]
      )
      or exists (
        select 1
        from public.course_levels l
        join public.students st on st.level_id = l.id
        where l.fee_structure_path = name
          and st.user_id = auth.uid()
      )
    )
  );

drop policy if exists course_fee_structures_insert on storage.objects;
create policy course_fee_structures_insert on storage.objects
  for insert to authenticated with check (
    bucket_id = 'course-fee-structures'
    and public.has_any_role(
      auth.uid(),
      array['super_admin','academic_admin']::public.app_role[]
    )
  );

drop policy if exists course_fee_structures_update on storage.objects;
create policy course_fee_structures_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'course-fee-structures'
    and public.has_any_role(
      auth.uid(),
      array['super_admin','academic_admin']::public.app_role[]
    )
  )
  with check (
    bucket_id = 'course-fee-structures'
    and public.has_any_role(
      auth.uid(),
      array['super_admin','academic_admin']::public.app_role[]
    )
  );

drop policy if exists course_fee_structures_delete on storage.objects;
create policy course_fee_structures_delete on storage.objects
  for delete to authenticated using (
    bucket_id = 'course-fee-structures'
    and public.has_any_role(
      auth.uid(),
      array['super_admin','academic_admin']::public.app_role[]
    )
  );
