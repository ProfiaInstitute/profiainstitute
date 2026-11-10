create table public.password_reset_challenges (
  user_id uuid primary key references auth.users(id) on delete cascade,
  password_salt text not null,
  password_hash text not null,
  created_at timestamptz not null default now()
);

alter table public.password_reset_challenges enable row level security;
revoke all on public.password_reset_challenges from public, anon, authenticated;
grant all on public.password_reset_challenges to service_role;
