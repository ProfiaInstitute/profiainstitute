alter table public.online_course_payments
  add column if not exists provider_reference text;

create unique index if not exists online_course_payments_provider_reference_key
  on public.online_course_payments(provider_reference)
  where provider_reference is not null;
