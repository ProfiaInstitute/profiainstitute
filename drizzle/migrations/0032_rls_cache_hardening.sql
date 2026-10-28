create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(_user_id = auth.uid(), false)
    and exists (
      select 1
      from public.user_roles
      where user_id = auth.uid()
        and role = _role
    );
$$;

create or replace function public.has_any_role(_user_id uuid, _roles public.app_role[])
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(_user_id = auth.uid(), false)
    and exists (
      select 1
      from public.user_roles
      where user_id = auth.uid()
        and role = any(_roles)
    );
$$;

create or replace function public.is_staff(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(_user_id = auth.uid(), false)
    and exists (
      select 1
      from public.user_roles
      where user_id = auth.uid()
        and role <> 'student'
    );
$$;

revoke all on function public.has_role(uuid, public.app_role) from public;
revoke all on function public.has_any_role(uuid, public.app_role[]) from public;
revoke all on function public.is_staff(uuid) from public;
grant execute on function public.has_role(uuid, public.app_role)
  to anon, authenticated, service_role;
grant execute on function public.has_any_role(uuid, public.app_role[])
  to anon, authenticated, service_role;
grant execute on function public.is_staff(uuid)
  to anon, authenticated, service_role;

drop policy if exists "own profile read" on public.profiles;
create policy profiles_read on public.profiles
  for select to authenticated
  using (
    id = auth.uid()
    or public.has_any_role(
      auth.uid(),
      array['super_admin', 'admissions_admin', 'academic_admin']::public.app_role[]
    )
    or exists (
      select 1
      from public.students s
      join public.facilitator_unit_assignments a
        on a.facilitator_id = auth.uid()
        and a.active
      join public.course_units u
        on u.id = a.unit_id
        and u.course_id = s.course_id
      where s.user_id = profiles.id
        and s.status = 'active'
        and (u.level_id is null or u.level_id = s.level_id)
    )
  );

drop policy if exists profile_photos_read on storage.objects;
create policy profile_photos_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'profile-photos'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.has_any_role(
        auth.uid(),
        array['super_admin', 'admissions_admin', 'academic_admin']::public.app_role[]
      )
      or exists (
        select 1
        from public.students s
        join public.facilitator_unit_assignments a
          on a.facilitator_id = auth.uid()
          and a.active
        join public.course_units u
          on u.id = a.unit_id
          and u.course_id = s.course_id
        where s.user_id::text = (storage.foldername(name))[1]
          and s.status = 'active'
          and (u.level_id is null or u.level_id = s.level_id)
      )
    )
  );

revoke insert, update, delete on public.notifications from authenticated;
grant update (read) on public.notifications to authenticated;
drop policy if exists "notif staff send" on public.notifications;

create index if not exists notifications_user_created_idx
  on public.notifications(user_id, created_at desc);
create index if not exists portal_conversations_updated_idx
  on public.portal_conversations(updated_at desc);

create or replace function public.application_upload_is_valid(
  _application_id text,
  _upload_token text
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.applications a
    where a.id::text = _application_id
      and a.upload_token::text = _upload_token
      and a.created_at > now() - interval '2 hours'
  );
$$;

revoke all on function public.application_upload_is_valid(text, text) from public;
grant execute on function public.application_upload_is_valid(text, text)
  to anon, authenticated, service_role;

create or replace function public.attach_application_document(
  _application_id uuid,
  _token uuid,
  _doc_type text,
  _file_path text,
  _file_name text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.application_upload_is_valid(_application_id::text, _token::text) then
    raise exception 'Not allowed';
  end if;
  if split_part(_file_path, '/', 1) <> _application_id::text
    or split_part(_file_path, '/', 2) <> _token::text
    or split_part(_file_path, '/', 3) not in (
      'kcse-certificate',
      'kcpe-certificate',
      'other-certificates',
      'birth-certificate',
      'id-or-passport'
    ) then
    raise exception 'Invalid path';
  end if;
  if _doc_type not in (
    'KCSE certificate',
    'KCPE certificate',
    'Other certificates',
    'Birth certificate',
    'ID or passport'
  ) then
    raise exception 'Invalid document type';
  end if;
  insert into public.application_documents(application_id, doc_type, file_path, file_name)
  values (_application_id, _doc_type, _file_path, left(_file_name, 200));
end;
$$;

revoke all on function public.attach_application_document(
  uuid, uuid, text, text, text
) from public;
grant execute on function public.attach_application_document(
  uuid, uuid, text, text, text
) to anon, authenticated, service_role;

drop policy if exists "appdocs upload" on storage.objects;
drop policy if exists application_docs_upload_secure on storage.objects;
create policy application_docs_upload_secure on storage.objects
  for insert to anon, authenticated
  with check (
    bucket_id = 'application-docs'
    and array_length(storage.foldername(name), 1) >= 3
    and (storage.foldername(name))[3] in (
      'kcse-certificate',
      'kcpe-certificate',
      'other-certificates',
      'birth-certificate',
      'id-or-passport'
    )
    and public.application_upload_is_valid(
      (storage.foldername(name))[1],
      (storage.foldername(name))[2]
    )
  );
