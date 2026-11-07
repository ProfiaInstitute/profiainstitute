create table public.holiday_program_payments (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.holiday_program_applications(id) on delete restrict,
  provider text not null default 'payhero' check (provider = 'payhero'),
  reference text not null unique,
  provider_reference text unique,
  provider_checkout_id text,
  amount integer not null check (amount > 0),
  payer_phone text not null,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'failed')),
  mpesa_receipt_number text,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz
);

create index holiday_program_payments_application_status_idx
  on public.holiday_program_payments(application_id, status, created_at desc);

create unique index holiday_program_payments_one_pending_per_application_idx
  on public.holiday_program_payments(application_id)
  where status = 'pending';

create trigger holiday_program_payments_updated_at
  before update on public.holiday_program_payments
  for each row execute function public.holiday_program_touch_updated_at();

alter table public.holiday_program_payments enable row level security;
revoke all on public.holiday_program_payments from public, anon, authenticated;
grant all on public.holiday_program_payments to service_role;

create or replace function public.confirm_holiday_program_payment(
  p_payment_id uuid,
  p_verified_status text,
  p_mpesa_receipt_number text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_application_id uuid;
  v_payment_status text;
  v_amount_due numeric(10,2);
  v_deposit_amount numeric(10,2);
  v_confirmed_total numeric(10,2);
begin
  if auth.role() <> 'service_role' then
    raise exception 'Forbidden';
  end if;

  select payment.application_id
    into v_application_id
  from public.holiday_program_payments payment
  where payment.id = p_payment_id;
  if not found then
    raise exception 'Holiday program payment not found.';
  end if;

  select application.amount_due, application.deposit_amount
    into v_amount_due, v_deposit_amount
  from public.holiday_program_applications application
  where application.id = v_application_id
  for update;
  if not found then
    raise exception 'Holiday program application not found.';
  end if;

  select payment.status
    into v_payment_status
  from public.holiday_program_payments payment
  where payment.id = p_payment_id
  for update;
  if not found then
    raise exception 'Holiday program payment not found.';
  end if;

  if v_payment_status = 'pending' then
    update public.holiday_program_payments
    set status = 'confirmed',
        paid_at = now(),
        mpesa_receipt_number = nullif(btrim(p_mpesa_receipt_number), ''),
        raw = raw || jsonb_build_object(
          'verified', true,
          'verified_status', p_verified_status,
          'payment_type', 'holiday_program'
        )
    where id = p_payment_id
      and status = 'pending';
  elsif v_payment_status <> 'confirmed' then
    raise exception 'Holiday program payment is not awaiting confirmation.';
  end if;

  select coalesce(sum(payment.amount), 0)
    into v_confirmed_total
  from public.holiday_program_payments payment
  where payment.application_id = v_application_id
    and payment.status = 'confirmed';

  update public.holiday_program_applications
  set payment_status = case
        when v_confirmed_total >= v_amount_due then 'paid'
        when v_deposit_amount > 0 and v_confirmed_total >= v_deposit_amount then 'deposit_paid'
        else 'unpaid'
      end
  where id = v_application_id;
end;
$$;

revoke all on function public.confirm_holiday_program_payment(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.confirm_holiday_program_payment(uuid, text, text)
  to service_role;
