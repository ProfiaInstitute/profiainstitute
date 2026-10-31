create table if not exists public.regulatory_source_updates (
  id uuid primary key default gen_random_uuid(),
  source_key text not null check (source_key in ('kasneb', 'tveta', 'helb', 'icpak')),
  source_name text not null,
  title text not null check (length(trim(title)) between 1 and 300),
  article_url text not null check (article_url ~* '^https://'),
  summary text check (summary is null or length(summary) <= 1500),
  published_at timestamptz,
  fetched_at timestamptz not null default now(),
  unique (source_key, article_url)
);

create index if not exists regulatory_source_updates_published_idx
  on public.regulatory_source_updates(published_at desc nulls last, fetched_at desc);

create table if not exists public.regulatory_feed_syncs (
  source_key text primary key check (source_key in ('kasneb', 'tveta', 'helb', 'icpak')),
  source_name text not null,
  feed_url text not null check (feed_url ~* '^https://'),
  last_attempted_at timestamptz not null default now(),
  last_successful_at timestamptz,
  status text not null check (status in ('success', 'error')),
  items_received integer not null default 0 check (items_received >= 0),
  error_message text
);

grant select on public.regulatory_source_updates, public.regulatory_feed_syncs to authenticated;
grant all on public.regulatory_source_updates, public.regulatory_feed_syncs to service_role;
alter table public.regulatory_source_updates enable row level security;
alter table public.regulatory_feed_syncs enable row level security;

drop policy if exists regulatory_source_updates_staff_read
  on public.regulatory_source_updates;
create policy regulatory_source_updates_staff_read
  on public.regulatory_source_updates
  for select to authenticated
  using (
    public.has_any_role(
      auth.uid(),
      array['super_admin', 'admissions_admin', 'academic_admin']::public.app_role[]
    )
  );

drop policy if exists regulatory_feed_syncs_staff_read
  on public.regulatory_feed_syncs;
create policy regulatory_feed_syncs_staff_read
  on public.regulatory_feed_syncs
  for select to authenticated
  using (
    public.has_any_role(
      auth.uid(),
      array['super_admin', 'admissions_admin', 'academic_admin']::public.app_role[]
    )
  );
