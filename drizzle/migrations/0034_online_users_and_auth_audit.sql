create table public.user_presence (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_seen_at timestamptz not null default now()
);

alter table public.user_presence enable row level security;
revoke all on public.user_presence from public, anon, authenticated;
grant all on public.user_presence to service_role;

create index user_presence_last_seen_idx
  on public.user_presence(last_seen_at desc);

create or replace function public.heartbeat_presence()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign-in required to update online status.';
  end if;

  insert into public.user_presence(user_id, last_seen_at)
  values (auth.uid(), now())
  on conflict (user_id) do update
    set last_seen_at = excluded.last_seen_at;
end;
$$;

create or replace function public.remove_my_presence()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign-in required to remove online status.';
  end if;

  delete from public.user_presence
  where user_id = auth.uid();
end;
$$;

create or replace function public.log_auth_event(_event text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign-in required to record authentication activity.';
  end if;
  if _event is null or _event not in ('sign_in', 'sign_out') then
    raise exception 'Unsupported authentication event.';
  end if;

  insert into public.audit_logs(actor_id, action, entity, entity_id, details)
  values (
    auth.uid(),
    case _event
      when 'sign_in' then 'auth_sign_in'
      when 'sign_out' then 'auth_sign_out'
    end,
    'authentication',
    auth.uid()::text,
    jsonb_build_object('event', _event)
  );
end;
$$;

create or replace function public.list_online_users()
returns table(name text, role text, last_seen_at timestamptz)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not public.has_role(auth.uid(), 'super_admin') then
    raise exception 'Only Super Admins can view online users.';
  end if;

  return query
  select
    coalesce(
      nullif(btrim(profile.full_name), ''),
      nullif(btrim(concat_ws(' ', student.first_name, student.middle_name, student.last_name)), ''),
      'User'
    ) as name,
    roles.role_names as role,
    presence.last_seen_at
  from public.user_presence presence
  left join public.profiles profile on profile.id = presence.user_id
  left join public.students student on student.user_id = presence.user_id
  join lateral (
    select string_agg(
      case user_role.role
        when 'super_admin' then 'Super Admin'
        when 'admissions_admin' then 'Admissions Admin'
        when 'academic_admin' then 'Academic Admin'
        when 'content_admin' then 'Content Admin'
        when 'facilitator' then 'Facilitator'
        when 'student' then 'Student'
      end,
      ', ' order by user_role.role::text
    ) as role_names
    from public.user_roles user_role
    where user_role.user_id = presence.user_id
  ) roles on roles.role_names is not null
  where presence.last_seen_at > now() - interval '75 seconds'
  order by presence.last_seen_at desc;
end;
$$;

revoke all on function public.heartbeat_presence() from public, anon;
revoke all on function public.remove_my_presence() from public, anon;
revoke all on function public.log_auth_event(text) from public, anon;
revoke all on function public.list_online_users() from public, anon, authenticated;

grant execute on function public.heartbeat_presence() to authenticated;
grant execute on function public.remove_my_presence() to authenticated;
grant execute on function public.log_auth_event(text) to authenticated;
grant execute on function public.list_online_users() to authenticated;
