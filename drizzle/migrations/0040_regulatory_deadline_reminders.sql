create table if not exists public.regulatory_deadline_reminders (
  id uuid primary key default gen_random_uuid(),
  action_id uuid not null references public.regulatory_action_items(id) on delete cascade,
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  channel text not null check (channel in ('email', 'whatsapp')),
  recipient text not null,
  days_before smallint not null check (days_before in (30, 7, 1, 0)),
  due_date date not null,
  scheduled_for timestamptz not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (
    status in ('pending', 'sending', 'sent', 'failed', 'cancelled')
  ),
  attempts integer not null default 0 check (attempts between 0 and 5),
  next_attempt_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (action_id, recipient_user_id, channel, days_before, due_date)
);

create index if not exists regulatory_deadline_reminders_due_idx
  on public.regulatory_deadline_reminders(next_attempt_at, scheduled_for)
  where status in ('pending', 'failed', 'sending');

alter table public.regulatory_deadline_reminders enable row level security;
revoke all on public.regulatory_deadline_reminders from anon, authenticated;
grant all on public.regulatory_deadline_reminders to service_role;

drop trigger if exists regulatory_deadline_reminders_updated_at
  on public.regulatory_deadline_reminders;
create trigger regulatory_deadline_reminders_updated_at
  before update on public.regulatory_deadline_reminders
  for each row execute function public.touch_updated_at();

create or replace function public.enqueue_regulatory_deadline_reminders()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  recipient_roles public.app_role[];
  staff_record record;
  days_before smallint;
  reminder_time timestamptz;
  reminder_payload jsonb;
begin
  if tg_op = 'UPDATE' then
    update public.regulatory_deadline_reminders
    set status = 'cancelled', last_error = 'The action was submitted or completed.'
    where action_id = new.id
      and status in ('pending', 'failed')
      and new.status in ('submitted', 'completed');

    update public.regulatory_deadline_reminders
    set status = 'cancelled', last_error = 'The action deadline changed.'
    where action_id = new.id
      and due_date <> new.due_date
      and status in ('pending', 'failed');
  end if;

  if new.status not in ('pending', 'in_progress') then
    return new;
  end if;

  recipient_roles := case new.category
    when 'Exam' then array['super_admin', 'academic_admin']::public.app_role[]
    when 'Accreditation' then array['super_admin', 'academic_admin']::public.app_role[]
    when 'Student funding' then array['super_admin', 'admissions_admin']::public.app_role[]
    when 'Tax and invoicing' then array['super_admin']::public.app_role[]
    when 'Government service' then
      array['super_admin', 'admissions_admin', 'academic_admin']::public.app_role[]
    else array['super_admin']::public.app_role[]
  end;

  for staff_record in
    select distinct profile.id, profile.full_name, profile.email, profile.phone
    from public.profiles profile
    join public.user_roles role on role.user_id = profile.id
    where role.role = any(recipient_roles)
      and (
        nullif(trim(profile.email), '') is not null
        or nullif(regexp_replace(coalesce(profile.phone, ''), '[^0-9]', '', 'g'), '') is not null
      )
  loop
    foreach days_before in array array[30, 7, 1, 0]::smallint[]
    loop
      reminder_time :=
        ((new.due_date - days_before)::timestamp + time '08:00')
        at time zone 'Africa/Nairobi';

      if days_before = 0 and new.due_date = current_date and reminder_time <= now() then
        reminder_time := now();
      elsif reminder_time <= now() then
        continue;
      end if;

      reminder_payload := jsonb_build_object(
        'admin_name', coalesce(nullif(trim(staff_record.full_name), ''), 'Administrator'),
        'agency', new.agency,
        'title', new.title,
        'due_date', new.due_date,
        'days_before', days_before,
        'reference_url', new.reference_url
      );

      if nullif(trim(staff_record.email), '') is not null then
        insert into public.regulatory_deadline_reminders(
          action_id, recipient_user_id, channel, recipient, days_before,
          due_date, scheduled_for, payload
        )
        values (
          new.id, staff_record.id, 'email', lower(trim(staff_record.email)),
          days_before, new.due_date, reminder_time, reminder_payload
        )
        on conflict (action_id, recipient_user_id, channel, days_before, due_date)
        do update set
          recipient = excluded.recipient,
          scheduled_for = excluded.scheduled_for,
          payload = excluded.payload,
          next_attempt_at = excluded.scheduled_for,
          status = 'pending',
          attempts = 0,
          last_error = null
        where public.regulatory_deadline_reminders.status <> 'sent';
      end if;

      if nullif(regexp_replace(coalesce(staff_record.phone, ''), '[^0-9]', '', 'g'), '') is not null then
        insert into public.regulatory_deadline_reminders(
          action_id, recipient_user_id, channel, recipient, days_before,
          due_date, scheduled_for, payload
        )
        values (
          new.id, staff_record.id, 'whatsapp',
          regexp_replace(staff_record.phone, '[^0-9]', '', 'g'),
          days_before, new.due_date, reminder_time, reminder_payload
        )
        on conflict (action_id, recipient_user_id, channel, days_before, due_date)
        do update set
          recipient = excluded.recipient,
          scheduled_for = excluded.scheduled_for,
          payload = excluded.payload,
          next_attempt_at = excluded.scheduled_for,
          status = 'pending',
          attempts = 0,
          last_error = null
        where public.regulatory_deadline_reminders.status <> 'sent';
      end if;
    end loop;
  end loop;

  return new;
end;
$$;

drop trigger if exists regulatory_action_items_enqueue_reminders
  on public.regulatory_action_items;
create trigger regulatory_action_items_enqueue_reminders
  after insert or update of agency, category, title, due_date, status, reference_url
  on public.regulatory_action_items
  for each row execute function public.enqueue_regulatory_deadline_reminders();

create or replace function public.claim_regulatory_deadline_reminders(
  _limit integer default 50,
  _channels text[] default null
)
returns setof public.regulatory_deadline_reminders
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Forbidden';
  end if;

  return query
  with due as (
    select reminder.id
    from public.regulatory_deadline_reminders reminder
    where reminder.attempts < 5
      and reminder.scheduled_for <= now()
      and reminder.next_attempt_at <= now()
      and (_channels is null or reminder.channel = any(_channels))
      and (
        reminder.status in ('pending', 'failed')
        or (reminder.status = 'sending' and reminder.updated_at < now() - interval '10 minutes')
      )
    order by reminder.scheduled_for, reminder.created_at
    limit greatest(1, least(coalesce(_limit, 50), 100))
    for update skip locked
  )
  update public.regulatory_deadline_reminders reminder
  set status = 'sending',
      attempts = reminder.attempts + 1,
      last_error = null
  from due
  where reminder.id = due.id
  returning reminder.*;
end;
$$;

create or replace function public.complete_regulatory_deadline_reminder(
  _reminder_id uuid,
  _sent boolean,
  _error text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Forbidden';
  end if;

  update public.regulatory_deadline_reminders
  set status = case when _sent then 'sent' else 'failed' end,
      sent_at = case when _sent then now() else null end,
      last_error = case when _sent then null else left(coalesce(_error, 'Delivery failed.'), 1000) end,
      next_attempt_at = case
        when _sent then next_attempt_at
        else now() + least(interval '6 hours', interval '5 minutes' * power(2, attempts))
      end
  where id = _reminder_id and status = 'sending';

  if not found then
    raise exception 'Regulatory reminder is not currently being processed.';
  end if;
end;
$$;

revoke all on function public.claim_regulatory_deadline_reminders(integer, text[]) from public, anon, authenticated;
grant execute on function public.claim_regulatory_deadline_reminders(integer, text[]) to service_role;
revoke all on function public.complete_regulatory_deadline_reminder(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.complete_regulatory_deadline_reminder(uuid, boolean, text) to service_role;
