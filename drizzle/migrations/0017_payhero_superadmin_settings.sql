create table public.payhero_settings (
  id boolean primary key default true check (id),
  api_username text not null,
  api_password text not null,
  channel_id text not null,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.payhero_settings enable row level security;
revoke all on public.payhero_settings from anon, authenticated;
grant all on public.payhero_settings to service_role;
