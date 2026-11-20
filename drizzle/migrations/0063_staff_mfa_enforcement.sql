create or replace function public.staff_mfa_satisfied()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null
    and (
      not exists (
        select 1
        from public.user_roles
        where user_id = auth.uid()
          and role <> 'student'
      )
      or auth.jwt() ->> 'aal' = 'aal2'
    );
$$;

revoke all on function public.staff_mfa_satisfied() from public;
grant execute on function public.staff_mfa_satisfied() to authenticated, service_role;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(_user_id = auth.uid(), false)
    and public.staff_mfa_satisfied()
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
    and public.staff_mfa_satisfied()
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
    and auth.jwt() ->> 'aal' = 'aal2'
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

do $$
declare
  table_record record;
begin
  for table_record in
    select namespace.nspname as schema_name, relation.relname as table_name
    from pg_class relation
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relkind in ('r', 'p')
      and relation.relrowsecurity
      and relation.relname <> 'user_roles'
  loop
    execute format(
      'create policy staff_mfa_guard on %I.%I as restrictive for all to authenticated using (public.staff_mfa_satisfied()) with check (public.staff_mfa_satisfied())',
      table_record.schema_name,
      table_record.table_name
    );
  end loop;
end
$$;

create policy staff_mfa_guard on storage.objects
  as restrictive
  for all to authenticated
  using (public.staff_mfa_satisfied())
  with check (public.staff_mfa_satisfied());
