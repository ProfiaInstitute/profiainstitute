alter table public.fees
  add column if not exists enrollment_id uuid references public.enrollments(id) on delete cascade,
  add column if not exists online_enrollment_id uuid references public.online_course_enrollments(id) on delete cascade,
  add column if not exists charge_key text not null default 'general';

create unique index if not exists fees_enrollment_id_key
  on public.fees(enrollment_id);
create unique index if not exists fees_online_enrollment_charge_key
  on public.fees(online_enrollment_id, charge_key);
create unique index if not exists payments_provider_reference_key
  on public.payments(provider, reference);

insert into public.payments(student_id, amount, method, provider, reference, status, paid_at, raw)
select p.student_id,
       p.amount,
       'M-Pesa STK Push',
       p.provider,
       p.reference,
       'confirmed',
       coalesce(p.paid_at, p.created_at),
       jsonb_build_object('migrated_from_online_payment', p.id)
  from public.online_course_payments p
 where p.status = 'confirmed'
on conflict (provider, reference) do nothing;

create or replace function public.bill_course_enrollment_fee()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_course_title text;
  v_amount numeric(12, 2);
begin
  select c.title, c.fees
    into v_course_title, v_amount
    from public.courses c
   where c.id = new.course_id;

  if v_amount > 0 then
    insert into public.fees(student_id, description, amount, enrollment_id, charge_key)
    values (new.student_id, 'Course fee · ' || v_course_title, v_amount, new.id, 'course_fee')
    on conflict (enrollment_id) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists bill_course_enrollment_fee on public.enrollments;
create trigger bill_course_enrollment_fee
  after insert on public.enrollments
  for each row execute function public.bill_course_enrollment_fee();

create or replace function public.bill_online_course_enrollment_fees()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_course_title text;
begin
  select c.title into v_course_title
    from public.courses c
   where c.id = new.course_id;

  insert into public.fees(student_id, description, amount, online_enrollment_id, charge_key)
  select new.student_id, charge.description, charge.amount, new.id, charge.key
    from (values
      ('tuition', 'Course tuition · ' || v_course_title, new.tuition_fee),
      ('exam_fee', 'Examination fee · ' || v_course_title, new.exam_fee),
      ('certificate_fee', 'Certificate fee · ' || v_course_title, new.certificate_fee)
    ) as charge(key, description, amount)
   where charge.amount > 0
  on conflict (online_enrollment_id, charge_key) do nothing;

  return new;
end;
$$;

drop trigger if exists bill_online_course_enrollment_fees on public.online_course_enrollments;
create trigger bill_online_course_enrollment_fees
  after insert on public.online_course_enrollments
  for each row execute function public.bill_online_course_enrollment_fees();

insert into public.fees(student_id, description, amount, enrollment_id, charge_key)
select e.student_id, 'Course fee · ' || c.title, c.fees, e.id, 'course_fee'
  from public.enrollments e
  join public.courses c on c.id = e.course_id
 where c.fees > 0
on conflict (enrollment_id) do nothing;

insert into public.fees(student_id, description, amount, online_enrollment_id, charge_key)
select e.student_id, charge.description, charge.amount, e.id, charge.key
  from public.online_course_enrollments e
  join public.courses c on c.id = e.course_id
  cross join lateral (values
    ('tuition', 'Course tuition · ' || c.title, e.tuition_fee),
    ('exam_fee', 'Examination fee · ' || c.title, e.exam_fee),
    ('certificate_fee', 'Certificate fee · ' || c.title, e.certificate_fee)
  ) as charge(key, description, amount)
 where charge.amount > 0
on conflict (online_enrollment_id, charge_key) do nothing;

create table if not exists public.mpesa_c2b_receipts (
  transaction_id text primary key,
  business_shortcode text not null,
  student_reference text not null,
  amount numeric(12, 2) not null check (amount > 0),
  phone_number text,
  status text not null default 'unmatched' check (status in ('matched', 'unmatched')),
  payment_id uuid references public.payments(id) on delete set null,
  raw jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now()
);
alter table public.mpesa_c2b_receipts enable row level security;
revoke all on public.mpesa_c2b_receipts from anon, authenticated;
grant select on public.mpesa_c2b_receipts to authenticated;
grant all on public.mpesa_c2b_receipts to service_role;
drop policy if exists mpesa_c2b_receipts_staff_read on public.mpesa_c2b_receipts;
create policy mpesa_c2b_receipts_staff_read
  on public.mpesa_c2b_receipts for select to authenticated
  using (public.has_any_role(
    auth.uid(),
    array['super_admin','academic_admin','admissions_admin']::public.app_role[]
  ));
