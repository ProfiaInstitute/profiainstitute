create table public.contact_message_replies (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.contact_messages(id) on delete cascade,
  sender_id uuid not null references auth.users(id),
  subject text not null,
  body text not null,
  attachment_names text[] not null default '{}',
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index contact_message_replies_message_idx
  on public.contact_message_replies(message_id, created_at);

alter table public.contact_message_replies enable row level security;
revoke all on public.contact_message_replies from public, anon, authenticated;
grant select on public.contact_message_replies to authenticated;
grant all on public.contact_message_replies to service_role;

create policy "contact message replies staff read"
  on public.contact_message_replies
  for select
  to authenticated
  using (
    public.has_any_role(
      auth.uid(),
      array['super_admin', 'admissions_admin']::public.app_role[]
    )
  );
