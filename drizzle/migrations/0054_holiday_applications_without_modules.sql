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
  v_offered_module_count integer;
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
  select count(*)
    into v_offered_module_count
  from public.holiday_program_period_modules pm
  join public.holiday_program_modules m
    on m.id = pm.module_id
   and m.track_id = v_track.id
   and m.active
  where pm.period_id = v_period.id;

  if v_module_count > 12
    or v_module_count <> cardinality(v_module_ids)
    or (v_module_count = 0 and v_offered_module_count > 0) then
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
