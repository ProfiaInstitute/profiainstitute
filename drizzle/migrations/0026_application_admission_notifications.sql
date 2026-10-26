create table if not exists public.application_notifications (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  application_status public.application_status not null,
  channel text not null check (channel in ('email', 'whatsapp')),
  recipient text not null,
  subject text,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (application_id, application_status, channel)
);

create index if not exists application_notifications_due_idx
  on public.application_notifications(next_attempt_at, created_at)
  where status in ('pending', 'failed', 'sending');

alter table public.application_notifications enable row level security;
revoke all on public.application_notifications from anon, authenticated;
grant select on public.application_notifications to authenticated;
grant all on public.application_notifications to service_role;

drop policy if exists application_notifications_staff_read on public.application_notifications;
create policy application_notifications_staff_read on public.application_notifications
  for select to authenticated
  using (public.has_any_role(auth.uid(), array['super_admin', 'admissions_admin']::public.app_role[]));

drop trigger if exists application_notifications_updated_at on public.application_notifications;
create trigger application_notifications_updated_at before update on public.application_notifications
  for each row execute function public.touch_updated_at();

create or replace function public.applications_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  notification_subject text;
  notification_template text;
  status_label text;
  support_whatsapp text;
  notification_payload jsonb;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  insert into public.application_status_history(application_id, from_status, to_status, note, changed_by)
  values (new.id, old.status, new.status, new.admin_message, auth.uid());

  insert into public.audit_logs(actor_id, action, entity, entity_id, details)
  values (
    auth.uid(),
    'application_status_change',
    'applications',
    new.id::text,
    jsonb_build_object('number', new.application_number, 'from', old.status, 'to', new.status)
  );

  notification_template := case new.status
    when 'accepted' then 'application_accepted'
    when 'more_info_required' then 'application_more_info'
    when 'enrolled' then 'admission_confirmed'
    else null
  end;
  notification_subject := case new.status
    when 'accepted' then 'Congratulations. Your application has been accepted.'
    when 'more_info_required' then 'Additional information is required for your application.'
    when 'enrolled' then 'Your admission to Profia Institute has been confirmed.'
    else null
  end;

  if notification_template is not null and new.status = 'more_info_required' then
    insert into public.email_outbox(to_email, template, subject, payload)
    values (
      new.email,
      notification_template,
      notification_subject,
      jsonb_build_object(
        'name', new.first_name,
        'application_number', new.application_number,
        'message', new.admin_message
      )
    );
  end if;

  if new.status in ('accepted', 'enrolled') then
    select coalesce(value->>'whatsapp', '254710221122')
      into support_whatsapp
      from public.site_settings
     where key = 'general';
    support_whatsapp := coalesce(nullif(support_whatsapp, ''), '254710221122');
    status_label := case new.status when 'accepted' then 'accepted' else 'enrolled' end;
    notification_payload := jsonb_build_object(
      'student_name', concat_ws(' ', new.first_name, new.middle_name, new.last_name),
      'application_number', new.application_number,
      'application_status', status_label,
      'email', lower(new.email),
      'student_portal_url', '/student',
      'school_whatsapp', support_whatsapp
    );

    insert into public.application_notifications(
      application_id, application_status, channel, recipient, subject, payload
    )
    values (
      new.id,
      new.status,
      'email',
      lower(new.email),
      notification_subject,
      notification_payload
    )
    on conflict (application_id, application_status, channel) do nothing;

    if coalesce(trim(new.phone), '') <> '' then
      insert into public.application_notifications(
        application_id, application_status, channel, recipient, subject, payload
      )
      values (
        new.id,
        new.status,
        'whatsapp',
        regexp_replace(new.phone, '[^0-9]', '', 'g'),
        null,
        notification_payload
      )
      on conflict (application_id, application_status, channel) do nothing;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists t_app_status on public.applications;
create trigger t_app_status after update on public.applications
  for each row execute function public.applications_status_change();

create or replace function public.claim_application_notifications(_limit integer default 50)
returns setof public.application_notifications
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'Forbidden';
  end if;
  if _limit is null or _limit < 1 or _limit > 100 then
    raise exception 'Limit must be between 1 and 100';
  end if;

  return query
  with due as (
    select n.id
      from public.application_notifications n
     where n.attempts < 5
       and n.next_attempt_at <= now()
       and (
         n.status in ('pending', 'failed')
         or (n.status = 'sending' and n.updated_at < now() - interval '15 minutes')
       )
     order by n.created_at
     limit _limit
     for update skip locked
  )
  update public.application_notifications n
     set status = 'sending',
         attempts = n.attempts + 1,
         next_attempt_at = now() + interval '5 minutes',
         last_error = null
    from due
   where n.id = due.id
  returning n.*;
end;
$$;

revoke all on function public.claim_application_notifications(integer) from public, anon, authenticated;
grant execute on function public.claim_application_notifications(integer) to service_role;

create or replace function public.complete_application_notification(
  _notification_id uuid,
  _sent boolean,
  _error text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'Forbidden';
  end if;
  if _sent is null or (not _sent and coalesce(trim(_error), '') = '') then
    raise exception 'A delivery result and failure reason are required';
  end if;

  update public.application_notifications
     set status = case when _sent then 'sent' else 'failed' end,
         sent_at = case when _sent then now() else null end,
         last_error = case when _sent then null else left(_error, 1000) end,
         next_attempt_at = case
           when _sent then now()
           else now() + make_interval(mins => least(60, 5 * greatest(attempts, 1)))
         end
   where id = _notification_id
     and status = 'sending';
  if not found then
    raise exception 'Sending notification not found';
  end if;
end;
$$;

revoke all on function public.complete_application_notification(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.complete_application_notification(uuid, boolean, text) to service_role;
