create table if not exists public.student_documents (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  document_type text not null check (
    document_type in ('KCSE certificate', 'KCPE certificate', 'Other certificate', 'Birth certificate', 'ID or passport')
  ),
  file_path text not null unique,
  file_name text not null,
  uploaded_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists student_documents_student_created_idx
  on public.student_documents(student_id, created_at desc);

alter table public.student_documents enable row level security;
grant select, insert, delete on public.student_documents to authenticated;
grant all on public.student_documents to service_role;

drop policy if exists student_documents_staff_read on public.student_documents;
create policy student_documents_staff_read on public.student_documents
  for select to authenticated
  using (public.has_any_role(auth.uid(), array['super_admin','admissions_admin']::public.app_role[]));

drop policy if exists student_documents_staff_insert on public.student_documents;
create policy student_documents_staff_insert on public.student_documents
  for insert to authenticated
  with check (
    uploaded_by = auth.uid()
    and public.has_any_role(auth.uid(), array['super_admin','admissions_admin']::public.app_role[])
  );

drop policy if exists student_documents_staff_delete on public.student_documents;
create policy student_documents_staff_delete on public.student_documents
  for delete to authenticated
  using (public.has_any_role(auth.uid(), array['super_admin','admissions_admin']::public.app_role[]));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'student-documents',
  'student-documents',
  false,
  5242880,
  array['application/pdf', 'image/jpeg', 'image/png']::text[]
)
on conflict (id) do update
set name = excluded.name,
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists student_documents_storage_read on storage.objects;
create policy student_documents_storage_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'student-documents'
    and public.has_any_role(auth.uid(), array['super_admin','admissions_admin']::public.app_role[])
  );

drop policy if exists student_documents_storage_insert on storage.objects;
create policy student_documents_storage_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'student-documents'
    and public.has_any_role(auth.uid(), array['super_admin','admissions_admin']::public.app_role[])
    and exists (
      select 1 from public.students s
      where s.id::text = (storage.foldername(name))[1]
    )
  );

drop policy if exists student_documents_storage_delete on storage.objects;
create policy student_documents_storage_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'student-documents'
    and public.has_any_role(auth.uid(), array['super_admin','admissions_admin']::public.app_role[])
  );
