create table public.holiday_program_tracks (
  id uuid primary key default gen_random_uuid(),
  track_key text not null unique check (track_key in ('general', 'kids')),
  title text not null,
  subtitle text not null default '',
  description text not null default '',
  location text not null default '',
  contact_phone text not null default '',
  contact_email text not null default '',
  min_age integer,
  max_age integer,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (min_age is null or min_age >= 0),
  check (max_age is null or max_age >= 0),
  check (min_age is null or max_age is null or min_age <= max_age)
);

insert into public.holiday_program_tracks (track_key, title, subtitle, description, location, contact_phone, contact_email, min_age, max_age, published)
values
  ('general', 'Holiday Computer Training', 'Learn skills. Build your future.', 'Build practical computer skills through hands-on holiday training.', 'Site Estate, Homa Bay', '0742 676542', 'profiainstitute@gmail.com', null, null, true),
  ('kids', 'Kids Holiday Program', 'A fun, practical holiday learning experience.', 'A supervised, age-appropriate introduction to digital and creative skills.', 'Site Estate, Homa Bay', '0742 676542', 'profiainstitute@gmail.com', 6, 17, true)
on conflict (track_key) do nothing;

create table public.holiday_program_periods (
  id uuid primary key default gen_random_uuid(),
  track_id uuid not null references public.holiday_program_tracks(id) on delete restrict,
  title text not null,
  starts_on date not null,
  ends_on date not null,
  schedule text not null default '',
  location text not null default '',
  capacity integer check (capacity is null or capacity > 0),
  registration_deadline date,
  fee_amount numeric(10,2) not null default 0 check (fee_amount >= 0),
  deposit_amount numeric(10,2) not null default 0 check (deposit_amount >= 0),
  discount_percent numeric(5,2) not null default 0 check (discount_percent between 0 and 100),
  offer_deadline date,
  status text not null default 'draft' check (status in ('draft', 'open', 'closed', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on >= starts_on),
  check (deposit_amount <= fee_amount)
);

create index holiday_program_periods_track_status_idx
  on public.holiday_program_periods (track_id, status, starts_on);

create table public.holiday_program_modules (
  id uuid primary key default gen_random_uuid(),
  track_id uuid not null references public.holiday_program_tracks(id) on delete restrict,
  title text not null,
  description text not null default '',
  duration text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, track_id)
);

create index holiday_program_modules_track_active_idx
  on public.holiday_program_modules (track_id, active, title);

create table public.holiday_program_period_modules (
  period_id uuid not null references public.holiday_program_periods(id) on delete cascade,
  module_id uuid not null references public.holiday_program_modules(id) on delete restrict,
  primary key (period_id, module_id)
);

create table public.holiday_program_applications (
  id uuid primary key default gen_random_uuid(),
  confirmation_code text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
  track_id uuid not null references public.holiday_program_tracks(id) on delete restrict,
  period_id uuid not null references public.holiday_program_periods(id) on delete restrict,
  applicant_name text not null,
  applicant_age integer,
  phone text not null,
  email text,
  location text not null,
  guardian_name text,
  guardian_phone text,
  guardian_email text,
  guardian_consent boolean not null default false,
  module_ids uuid[] not null,
  fee_amount numeric(10,2) not null,
  discount_percent numeric(5,2) not null,
  amount_due numeric(10,2) not null,
  deposit_amount numeric(10,2) not null,
  status text not null default 'submitted' check (status in ('submitted', 'under_review', 'accepted', 'waitlisted', 'rejected', 'withdrawn')),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid', 'deposit_paid', 'paid', 'waived')),
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  admin_notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (applicant_age is null or applicant_age >= 0),
  check (fee_amount >= 0 and amount_due >= 0 and deposit_amount >= 0)
);

create index holiday_program_applications_period_idx
  on public.holiday_program_applications (period_id, submitted_at desc);
create index holiday_program_applications_track_status_idx
  on public.holiday_program_applications (track_id, status, submitted_at desc);

create table public.holiday_program_application_history (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.holiday_program_applications(id) on delete cascade,
  changed_by uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now(),
  previous_values jsonb not null,
  new_values jsonb not null
);

create or replace function public.holiday_program_touch_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger holiday_program_tracks_updated_at
  before update on public.holiday_program_tracks
  for each row execute function public.holiday_program_touch_updated_at();
create trigger holiday_program_periods_updated_at
  before update on public.holiday_program_periods
  for each row execute function public.holiday_program_touch_updated_at();
create trigger holiday_program_modules_updated_at
  before update on public.holiday_program_modules
  for each row execute function public.holiday_program_touch_updated_at();
create trigger holiday_program_applications_updated_at
  before update on public.holiday_program_applications
  for each row execute function public.holiday_program_touch_updated_at();

alter table public.holiday_program_tracks enable row level security;
alter table public.holiday_program_periods enable row level security;
alter table public.holiday_program_modules enable row level security;
alter table public.holiday_program_period_modules enable row level security;
alter table public.holiday_program_applications enable row level security;
alter table public.holiday_program_application_history enable row level security;

create policy "public reads published holiday tracks"
  on public.holiday_program_tracks for select to anon, authenticated
  using (published or public.has_any_role(auth.uid(), array['super_admin','admissions_admin']::public.app_role[]));
create policy "admissions manages holiday tracks"
  on public.holiday_program_tracks for all to authenticated
  using (public.has_any_role(auth.uid(), array['super_admin','admissions_admin']::public.app_role[]))
  with check (public.has_any_role(auth.uid(), array['super_admin','admissions_admin']::public.app_role[]));

create policy "public reads open holiday periods"
  on public.holiday_program_periods for select to anon, authenticated
  using (
    (status = 'open' and exists (
      select 1 from public.holiday_program_tracks t where t.id = track_id and t.published
    ))
    or public.has_any_role(auth.uid(), array['super_admin','admissions_admin']::public.app_role[])
  );
create policy "admissions manages holiday periods"
  on public.holiday_program_periods for all to authenticated
  using (public.has_any_role(auth.uid(), array['super_admin','admissions_admin']::public.app_role[]))
  with check (public.has_any_role(auth.uid(), array['super_admin','admissions_admin']::public.app_role[]));

create policy "public reads active holiday modules"
  on public.holiday_program_modules for select to anon, authenticated
  using (
    (active and exists (
      select 1 from public.holiday_program_tracks t where t.id = track_id and t.published
    ))
    or public.has_any_role(auth.uid(), array['super_admin','admissions_admin']::public.app_role[])
  );
create policy "admissions manages holiday modules"
  on public.holiday_program_modules for all to authenticated
  using (public.has_any_role(auth.uid(), array['super_admin','admissions_admin']::public.app_role[]))
  with check (public.has_any_role(auth.uid(), array['super_admin','admissions_admin']::public.app_role[]));

create policy "public reads holiday period modules"
  on public.holiday_program_period_modules for select to anon, authenticated
  using (exists (
    select 1 from public.holiday_program_periods p
    join public.holiday_program_tracks t on t.id = p.track_id
    where p.id = period_id and p.status = 'open' and t.published
  ) or public.has_any_role(auth.uid(), array['super_admin','admissions_admin']::public.app_role[]));
create policy "admissions manages holiday period modules"
  on public.holiday_program_period_modules for all to authenticated
  using (public.has_any_role(auth.uid(), array['super_admin','admissions_admin']::public.app_role[]))
  with check (public.has_any_role(auth.uid(), array['super_admin','admissions_admin']::public.app_role[]));

create policy "admissions reads holiday applications"
  on public.holiday_program_applications for select to authenticated
  using (public.has_any_role(auth.uid(), array['super_admin','admissions_admin']::public.app_role[]));
create policy "admissions updates holiday applications"
  on public.holiday_program_applications for update to authenticated
  using (public.has_any_role(auth.uid(), array['super_admin','admissions_admin']::public.app_role[]))
  with check (public.has_any_role(auth.uid(), array['super_admin','admissions_admin']::public.app_role[]));
create policy "admissions reads holiday application history"
  on public.holiday_program_application_history for select to authenticated
  using (public.has_any_role(auth.uid(), array['super_admin','admissions_admin']::public.app_role[]));

create or replace function public.log_holiday_program_application_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if row(old.status, old.payment_status, old.admin_notes)
    is distinct from row(new.status, new.payment_status, new.admin_notes) then
    insert into public.holiday_program_application_history (
      application_id, changed_by, previous_values, new_values
    ) values (
      new.id,
      auth.uid(),
      jsonb_build_object('status', old.status, 'payment_status', old.payment_status, 'admin_notes', old.admin_notes),
      jsonb_build_object('status', new.status, 'payment_status', new.payment_status, 'admin_notes', new.admin_notes)
    );
  end if;
  return new;
end;
$$;

create trigger holiday_program_application_update_history
  after update on public.holiday_program_applications
  for each row execute function public.log_holiday_program_application_update();

create or replace function public.set_holiday_program_period_modules(p_period_id uuid, p_module_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_track_id uuid;
begin
  if not public.has_any_role(auth.uid(), array['super_admin','admissions_admin']::public.app_role[]) then
    raise exception 'Forbidden';
  end if;
  select track_id into v_track_id from public.holiday_program_periods where id = p_period_id;
  if v_track_id is null then raise exception 'Period not found.'; end if;
  if cardinality(coalesce(p_module_ids, '{}'::uuid[])) <>
    (select count(distinct module_id) from unnest(coalesce(p_module_ids, '{}'::uuid[])) as x(module_id)) then
    raise exception 'Duplicate modules are not allowed.';
  end if;
  if exists (
    select 1
    from unnest(coalesce(p_module_ids, '{}'::uuid[])) selected(module_id)
    left join public.holiday_program_modules m
      on m.id = selected.module_id and m.track_id = v_track_id
    where m.id is null
  ) then
    raise exception 'Modules must belong to the selected program track.';
  end if;
  delete from public.holiday_program_period_modules where period_id = p_period_id;
  insert into public.holiday_program_period_modules (period_id, module_id)
  select p_period_id, module_id from unnest(coalesce(p_module_ids, '{}'::uuid[])) as x(module_id);
end;
$$;

revoke all on function public.set_holiday_program_period_modules(uuid, uuid[]) from public;
grant execute on function public.set_holiday_program_period_modules(uuid, uuid[]) to authenticated;

create or replace function public.submit_holiday_program_application(p jsonb)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_track public.holiday_program_tracks%rowtype;
  v_period public.holiday_program_periods%rowtype;
  v_application public.holiday_program_applications%rowtype;
  v_today date := (now() at time zone 'Africa/Nairobi')::date;
  v_module_ids uuid[];
  v_module_count integer;
  v_amount_due numeric(10,2);
  v_discount_percent numeric(5,2);
  v_name text;
  v_phone text;
  v_location text;
  v_age integer;
  v_guardian_name text;
  v_guardian_phone text;
  v_email text;
  v_guardian_email text;
begin
  select * into v_period
  from public.holiday_program_periods
  where id = (p->>'period_id')::uuid
  for update;
  if not found or v_period.status <> 'open' then
    raise exception 'This holiday program period is not accepting applications.';
  end if;

  select * into v_track
  from public.holiday_program_tracks
  where id = v_period.track_id and published;
  if not found then
    raise exception 'This holiday program is not currently available.';
  end if;
  if v_period.registration_deadline is not null and v_period.registration_deadline < v_today then
    raise exception 'The registration deadline for this period has passed.';
  end if;
  if v_period.ends_on < v_today then
    raise exception 'This holiday program period has ended.';
  end if;
  if v_period.capacity is not null and (
    select count(*) from public.holiday_program_applications a
    where a.period_id = v_period.id and a.status not in ('rejected', 'withdrawn')
  ) >= v_period.capacity then
    raise exception 'This period is full. Please contact the Institute.';
  end if;

  v_name := nullif(btrim(p->>'applicant_name'), '');
  v_phone := nullif(btrim(p->>'phone'), '');
  v_location := nullif(btrim(p->>'location'), '');
  v_email := nullif(lower(btrim(p->>'email')), '');
  v_age := nullif(p->>'applicant_age', '')::integer;
  v_guardian_name := nullif(btrim(p->>'guardian_name'), '');
  v_guardian_phone := nullif(btrim(p->>'guardian_phone'), '');
  v_guardian_email := nullif(lower(btrim(p->>'guardian_email')), '');

  if v_name is null or v_phone is null or v_location is null then
    raise exception 'Name, phone number, and location are required.';
  end if;
  if nullif(btrim(p->>'website'), '') is not null then
    raise exception 'Invalid application.';
  end if;
  if length(v_name) > 160 or length(v_phone) > 40 or length(v_location) > 160
    or (v_email is not null and length(v_email) > 254)
    or (v_guardian_name is not null and length(v_guardian_name) > 160)
    or (v_guardian_phone is not null and length(v_guardian_phone) > 40)
    or (v_guardian_email is not null and length(v_guardian_email) > 254) then
    raise exception 'One or more application fields are too long.';
  end if;

  if v_track.track_key = 'kids' then
    if v_age is null or (v_track.min_age is not null and v_age < v_track.min_age)
      or (v_track.max_age is not null and v_age > v_track.max_age) then
      raise exception 'The child age must be within the published age range.';
    end if;
    if v_guardian_name is null or v_guardian_phone is null
      or not coalesce((p->>'guardian_consent')::boolean, false) then
      raise exception 'Parent/guardian contact and consent are required.';
    end if;
  end if;

  select coalesce(array_agg(value::uuid), '{}'::uuid[]) into v_module_ids
  from jsonb_array_elements_text(coalesce(p->'module_ids', '[]'::jsonb)) as x(value);
  select count(distinct value) into v_module_count
  from unnest(v_module_ids) as x(value);
  if v_module_count = 0 or v_module_count > 12 or v_module_count <> cardinality(v_module_ids) then
    raise exception 'Select one or more valid modules.';
  end if;
  if exists (
    select 1 from unnest(v_module_ids) selected(module_id)
    left join public.holiday_program_period_modules pm
      on pm.period_id = v_period.id and pm.module_id = selected.module_id
    left join public.holiday_program_modules m
      on m.id = pm.module_id and m.track_id = v_track.id and m.active
    where m.id is null
  ) then
    raise exception 'One or more selected modules are not offered in this period.';
  end if;

  v_discount_percent := case
    when v_period.offer_deadline is null or v_period.offer_deadline >= v_today
      then v_period.discount_percent
    else 0
  end;
  v_amount_due := round(v_period.fee_amount * (1 - v_discount_percent / 100), 2);
  if v_period.deposit_amount > v_amount_due then
    raise exception 'The configured deposit exceeds the discounted program fee.';
  end if;
  insert into public.holiday_program_applications (
    track_id, period_id, applicant_name, applicant_age, phone, email, location,
    guardian_name, guardian_phone, guardian_email, guardian_consent, module_ids,
    fee_amount, discount_percent, amount_due, deposit_amount
  ) values (
    v_track.id, v_period.id, v_name, v_age, v_phone, v_email, v_location,
    v_guardian_name, v_guardian_phone, v_guardian_email,
    coalesce((p->>'guardian_consent')::boolean, false), v_module_ids,
    v_period.fee_amount, v_discount_percent, v_amount_due, v_period.deposit_amount
  ) returning * into v_application;

  return v_application.confirmation_code;
end;
$$;

revoke all on function public.submit_holiday_program_application(jsonb) from public;
grant execute on function public.submit_holiday_program_application(jsonb) to anon, authenticated;
grant select on public.holiday_program_tracks, public.holiday_program_periods,
  public.holiday_program_modules, public.holiday_program_period_modules to anon, authenticated;
grant select, insert, update, delete on public.holiday_program_tracks,
  public.holiday_program_periods, public.holiday_program_modules,
  public.holiday_program_period_modules to authenticated;
grant select, update on public.holiday_program_applications to authenticated;
grant select on public.holiday_program_application_history to authenticated;
