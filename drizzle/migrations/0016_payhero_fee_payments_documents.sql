alter table public.notifications
  add column if not exists reference_id uuid;

create unique index if not exists notifications_reference_id_key
  on public.notifications(user_id, category, reference_id);

create unique index if not exists payments_one_pending_payhero_fee_per_student
  on public.payments(student_id)
  where provider = 'payhero'
    and status = 'pending'
    and raw ->> 'payment_type' = 'student_fees';

create table if not exists public.fee_documents (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  payment_id uuid unique references public.payments(id) on delete cascade,
  document_type text not null check (document_type in ('receipt', 'statement')),
  storage_path text not null unique,
  created_at timestamptz not null default now(),
  check ((document_type = 'receipt' and payment_id is not null) or
         (document_type = 'statement' and payment_id is null))
);

alter table public.fee_documents enable row level security;
revoke all on public.fee_documents from anon, authenticated;
grant select on public.fee_documents to authenticated;
grant all on public.fee_documents to service_role;

drop policy if exists fee_documents_student_read on public.fee_documents;
create policy fee_documents_student_read
  on public.fee_documents for select to authenticated
  using (
    student_id = public.my_student_id()
    or public.has_role(auth.uid(), 'super_admin')
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fee-documents', 'fee-documents', false, 5242880, array['application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists fee_documents_storage_read on storage.objects;
create policy fee_documents_storage_read
  on storage.objects for select to authenticated
  using (
    bucket_id = 'fee-documents'
    and (
      (storage.foldername(name))[1] = public.my_student_id()::text
      or public.has_role(auth.uid(), 'super_admin')
    )
  );

create or replace function public.admin_fee_account_summary()
returns table (
  student_id uuid,
  student_number text,
  first_name text,
  last_name text,
  billed numeric,
  paid numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with fee_totals as (
    select f.student_id, sum(f.amount) as total
      from public.fees f
     group by f.student_id
  ),
  payment_totals as (
    select p.student_id, sum(p.amount) as total
      from public.payments p
     where p.status = 'confirmed'
     group by p.student_id
  )
  select s.id,
         s.student_number,
         s.first_name,
         s.last_name,
         coalesce(f.total, 0),
         coalesce(p.total, 0)
    from public.students s
    left join fee_totals f on f.student_id = s.id
    left join payment_totals p on p.student_id = s.id
   where public.has_role(auth.uid(), 'super_admin')
   order by s.last_name, s.first_name;
$$;
revoke all on function public.admin_fee_account_summary() from public, anon;
grant execute on function public.admin_fee_account_summary() to authenticated;
