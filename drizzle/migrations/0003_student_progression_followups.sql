create table public.progression_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  source_course_id uuid not null references public.courses(id) on delete cascade,
  next_course_id uuid not null references public.courses(id) on delete cascade,
  minimum_score numeric(5,2) not null default 50 check (minimum_score between 0 and 100),
  exam_name_pattern text not null default '%exam%',
  delay_days integer not null default 0 check (delay_days between 0 and 365),
  subject text not null default 'Continue your studies at Profia Institute',
  message text not null default 'Congratulations on completing your examinations. Enrol in your next level: {next_course}.',
  enabled boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (source_course_id <> next_course_id)
);

create index progression_rules_enabled_source_idx
  on public.progression_rules(source_course_id) where enabled;

create table public.progression_followups (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.progression_rules(id) on delete cascade,
  result_id uuid not null references public.results(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  due_at timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending','sending','sent','failed','cancelled')),
  attempts integer not null default 0,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(rule_id, result_id)
);

create index progression_followups_due_idx
  on public.progression_followups(due_at) where status in ('pending','failed');

alter table public.progression_rules enable row level security;
alter table public.progression_followups enable row level security;
grant select, insert, update, delete on public.progression_rules to authenticated;
grant select on public.progression_followups to authenticated;
grant all on public.progression_rules, public.progression_followups to service_role;

create policy "progression rules staff read"
  on public.progression_rules for select to authenticated
  using (public.has_any_role(auth.uid(), array['super_admin','academic_admin']::public.app_role[]));
create policy "progression rules staff manage"
  on public.progression_rules for all to authenticated
  using (public.has_any_role(auth.uid(), array['super_admin','academic_admin']::public.app_role[]))
  with check (public.has_any_role(auth.uid(), array['super_admin','academic_admin']::public.app_role[]));
create policy "progression followups staff read"
  on public.progression_followups for select to authenticated
  using (public.has_any_role(auth.uid(), array['super_admin','academic_admin']::public.app_role[]));

create trigger t_progression_rules_updated_at before update on public.progression_rules
  for each row execute function public.touch_updated_at();
create trigger t_progression_followups_updated_at before update on public.progression_followups
  for each row execute function public.touch_updated_at();

create or replace function public.queue_student_progression_followup()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.published and (tg_op = 'INSERT' or not old.published) then
    insert into public.progression_followups(rule_id, result_id, student_id, due_at)
    select rule.id, new.id, student.id, now() + make_interval(days => rule.delay_days)
      from public.progression_rules rule
      join public.students student on student.id = new.student_id
     where rule.enabled
       and rule.source_course_id = student.course_id
       and student.status = 'active'
       and coalesce(new.score, 0) >= rule.minimum_score
       and new.unit_name ilike rule.exam_name_pattern
    on conflict (rule_id, result_id) do nothing;
  end if;
  return new;
end $$;

create trigger t_queue_student_progression_followup
  after insert or update of published on public.results
  for each row execute function public.queue_student_progression_followup();

create or replace function public.claim_due_progression_followups(_limit integer default 50)
returns table(
  id uuid,
  student_email text,
  student_name text,
  student_number text,
  next_course text,
  next_course_id uuid,
  subject text,
  message text
)
language plpgsql security definer set search_path=public as $$
begin
  if auth.role() <> 'service_role' then raise exception 'Forbidden'; end if;
  return query
  with due as (
    select followup.id
      from public.progression_followups followup
      join public.progression_rules rule on rule.id = followup.rule_id and rule.enabled
      join public.students student
        on student.id = followup.student_id
       and student.status = 'active'
       and student.course_id = rule.source_course_id
     where followup.due_at <= now()
       and followup.attempts < 5
       and (
         followup.status in ('pending','failed')
         or (followup.status = 'sending' and followup.updated_at < now() - interval '15 minutes')
       )
     order by followup.due_at
     for update skip locked
     limit greatest(1, least(coalesce(_limit, 50), 100))
  ),
  claimed as (
    update public.progression_followups followup
       set status = 'sending',
           attempts = followup.attempts + 1,
           last_error = null
      from due
     where followup.id = due.id
     returning followup.id, followup.rule_id, followup.student_id
  )
  select claimed.id,
         student.email,
         concat_ws(' ', student.first_name, student.last_name),
         student.student_number,
         next_course.title,
         next_course.id,
         rule.subject,
         rule.message
    from claimed
    join public.students student on student.id = claimed.student_id
    join public.progression_rules rule on rule.id = claimed.rule_id
    join public.courses next_course on next_course.id = rule.next_course_id;
end $$;
revoke all on function public.claim_due_progression_followups(integer) from public, anon, authenticated;
grant execute on function public.claim_due_progression_followups(integer) to service_role;

create or replace function public.queue_existing_progression_followups()
returns integer language plpgsql security definer set search_path=public as $$
declare queued integer;
begin
  if not public.has_any_role(auth.uid(), array['super_admin','academic_admin']::public.app_role[]) then
    raise exception 'Forbidden';
  end if;
  insert into public.progression_followups(rule_id, result_id, student_id, due_at)
  select rule.id, result.id, student.id, now() + make_interval(days => rule.delay_days)
    from public.progression_rules rule
    join public.students student on student.course_id = rule.source_course_id and student.status = 'active'
    join public.results result on result.student_id = student.id and result.published
      and coalesce(result.score, 0) >= rule.minimum_score
      and result.unit_name ilike rule.exam_name_pattern
   where rule.enabled
  on conflict (rule_id, result_id) do nothing;
  get diagnostics queued = row_count;
  return queued;
end $$;
grant execute on function public.queue_existing_progression_followups() to authenticated;

create or replace function public.retry_progression_followup(_followup_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.has_any_role(auth.uid(), array['super_admin','academic_admin']::public.app_role[]) then
    raise exception 'Forbidden';
  end if;
  update public.progression_followups
     set status = 'pending', attempts = 0, due_at = now(), last_error = null
   where id = _followup_id and status = 'failed';
  if not found then raise exception 'Failed follow-up not found'; end if;
end $$;
grant execute on function public.retry_progression_followup(uuid) to authenticated;

create or replace function public.complete_progression_followup(
  _followup_id uuid,
  _sent boolean,
  _error text default null
) returns void language plpgsql security definer set search_path=public as $$
begin
  if auth.role() <> 'service_role' then raise exception 'Forbidden'; end if;
  update public.progression_followups
     set status = case when _sent then 'sent' else 'failed' end,
         sent_at = case when _sent then now() else null end,
         last_error = case when _sent then null else left(coalesce(_error,'Email delivery failed'),500) end
   where id = _followup_id and status = 'sending';
  if not found then raise exception 'Claimed follow-up not found'; end if;
end $$;
revoke all on function public.complete_progression_followup(uuid,boolean,text) from public, anon, authenticated;
grant execute on function public.complete_progression_followup(uuid,boolean,text) to service_role;
