insert into storage.buckets (id, name, public, file_size_limit)
values ('email-share-staging', 'email-share-staging', false, 5242880)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit;

drop policy if exists email_share_staging_staff_insert on storage.objects;
create policy email_share_staging_staff_insert
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'email-share-staging'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.has_any_role(
      auth.uid(),
      array['super_admin', 'admissions_admin']::public.app_role[]
    )
  );

drop policy if exists email_share_staging_staff_read on storage.objects;
create policy email_share_staging_staff_read
  on storage.objects for select to authenticated
  using (
    bucket_id = 'email-share-staging'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.has_any_role(
      auth.uid(),
      array['super_admin', 'admissions_admin']::public.app_role[]
    )
  );

drop policy if exists email_share_staging_staff_delete on storage.objects;
create policy email_share_staging_staff_delete
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'email-share-staging'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.has_any_role(
      auth.uid(),
      array['super_admin', 'admissions_admin']::public.app_role[]
    )
  );
