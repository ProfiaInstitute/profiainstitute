drop function if exists public.list_staff();

create function public.list_staff()
returns table(
  user_id uuid,
  email text,
  full_name text,
  roles public.app_role[],
  status text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    u.id,
    coalesce(p.email, u.email, ''),
    coalesce(nullif(p.full_name, ''), u.raw_user_meta_data->>'full_name', ''),
    array_agg(r.role order by r.role),
    case
      when u.banned_until > now() then 'suspended'
      when u.email_confirmed_at is null then 'pending'
      else 'active'
    end,
    u.created_at
  from auth.users u
  join public.user_roles r on r.user_id = u.id
  left join public.profiles p on p.id = u.id
  where public.has_role(auth.uid(), 'super_admin')
    and r.role <> 'student'
  group by u.id, p.email, p.full_name
  order by lower(coalesce(p.full_name, u.raw_user_meta_data->>'full_name', u.email, ''));
$$;

grant execute on function public.list_staff() to authenticated;
