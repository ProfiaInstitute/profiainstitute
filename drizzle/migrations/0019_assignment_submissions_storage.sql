insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('submissions', 'submissions', false, 52428800, null)
on conflict (id) do update
  set name = excluded.name,
      public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "subs delete own" on storage.objects;
create policy "subs delete own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'submissions'
    and (
      (storage.foldername(name))[1] = public.my_student_id()::text
      or public.has_any_role(auth.uid(), array['super_admin','academic_admin']::public.app_role[])
    )
  );
