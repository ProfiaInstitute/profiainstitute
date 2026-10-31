create table if not exists public.regulatory_action_items (
  id uuid primary key default gen_random_uuid(),
  agency text not null check (
    agency in ('KASNEB', 'TVETA', 'HELB', 'ICPAK', 'NITA', 'KRA/eTIMS', 'eCitizen', 'Other')
  ),
  category text not null check (
    category in (
      'Exam',
      'Accreditation',
      'Student funding',
      'Tax and invoicing',
      'Government service',
      'Other'
    )
  ),
  title text not null check (length(trim(title)) between 1 and 180),
  details text check (details is null or length(details) <= 2000),
  due_date date not null,
  status text not null default 'pending' check (
    status in ('pending', 'in_progress', 'submitted', 'completed')
  ),
  reference_url text check (
    reference_url is null
    or (length(reference_url) <= 1000 and reference_url ~* '^https?://')
  ),
  notes text check (notes is null or length(notes) <= 2000),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists regulatory_action_items_due_status_idx
  on public.regulatory_action_items(due_date, status);

grant select, insert, update, delete on public.regulatory_action_items to authenticated;
grant all on public.regulatory_action_items to service_role;
alter table public.regulatory_action_items enable row level security;

drop policy if exists regulatory_action_items_staff_manage
  on public.regulatory_action_items;
create policy regulatory_action_items_staff_manage
  on public.regulatory_action_items
  for all to authenticated
  using (
    public.has_any_role(
      auth.uid(),
      array['super_admin', 'admissions_admin', 'academic_admin']::public.app_role[]
    )
  )
  with check (
    public.has_any_role(
      auth.uid(),
      array['super_admin', 'admissions_admin', 'academic_admin']::public.app_role[]
    )
  );

drop trigger if exists regulatory_action_items_updated_at
  on public.regulatory_action_items;
create trigger regulatory_action_items_updated_at
  before update on public.regulatory_action_items
  for each row execute function public.touch_updated_at();

drop trigger if exists regulatory_action_items_audit
  on public.regulatory_action_items;
create trigger regulatory_action_items_audit
  after insert or update or delete on public.regulatory_action_items
  for each row execute function public.audit_row();
