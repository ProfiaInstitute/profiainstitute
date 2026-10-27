alter table public.announcements
  add column if not exists show_to_facilitators boolean not null default false;

drop policy if exists ann_facilitator_memos on public.announcements;
create policy ann_facilitator_memos on public.announcements
  for select to authenticated using (
    published and category = 'memo' and show_to_facilitators
    and (starts_at is null or starts_at <= now())
    and (ends_at is null or ends_at >= now())
    and public.has_role(auth.uid(), 'facilitator')
  );

create or replace function public.notify_facilitator_memo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recipient record;
  newly_visible boolean := false;
begin
  if tg_op = 'INSERT' then
    newly_visible := new.published and new.category = 'memo' and new.show_to_facilitators
      and (new.starts_at is null or new.starts_at <= now())
      and (new.ends_at is null or new.ends_at >= now());
  elsif new.published and new.category = 'memo' and new.show_to_facilitators
    and (new.starts_at is null or new.starts_at <= now())
    and (new.ends_at is null or new.ends_at >= now())
    and (not old.published or not old.show_to_facilitators) then
    newly_visible := true;
  end if;
  if newly_visible then
    for recipient in
      select distinct user_id from public.user_roles where role::text = 'facilitator'
    loop
      insert into public.notifications(user_id, title, body, category)
        values (
          recipient.user_id,
          'New institute memo',
          'A new memo is available: ' || new.title,
          'memos'
        );
    end loop;
  end if;
  return new;
end;
$$;
create trigger facilitator_memo_notification
  after insert or update on public.announcements
  for each row execute function public.notify_facilitator_memo();

create or replace function public.facilitator_can_message_student(_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and exists (
    select 1
    from public.students s
    join public.course_units u on u.course_id = s.course_id
    join public.facilitator_unit_assignments a on a.unit_id = u.id
    join public.user_roles r on r.user_id = a.facilitator_id and r.role::text = 'facilitator'
    where s.id = _student_id and s.status = 'active'
      and a.facilitator_id = auth.uid() and a.active
      and (u.level_id is null or u.level_id = s.level_id)
  );
$$;
grant execute on function public.facilitator_can_message_student(uuid) to authenticated;

create or replace function public.get_or_create_facilitator_conversation(_student_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  conversation_id uuid;
begin
  if not public.facilitator_can_message_student(_student_id) then
    raise exception 'You are not assigned to teach this student.';
  end if;
  insert into public.portal_conversations(student_id)
    values (_student_id)
    on conflict (student_id) do update set student_id = excluded.student_id
    returning id into conversation_id;
  return conversation_id;
end;
$$;
grant execute on function public.get_or_create_facilitator_conversation(uuid) to authenticated;

drop policy if exists portal_conversation_facilitator_read on public.portal_conversations;
create policy portal_conversation_facilitator_read on public.portal_conversations
  for select to authenticated using (public.facilitator_can_message_student(student_id));

drop policy if exists portal_message_facilitator_read on public.portal_messages;
create policy portal_message_facilitator_read on public.portal_messages
  for select to authenticated using (
    exists (
      select 1 from public.portal_conversations c
      where c.id = conversation_id
        and public.facilitator_can_message_student(c.student_id)
    )
  );

drop policy if exists portal_message_facilitator_send on public.portal_messages;
create policy portal_message_facilitator_send on public.portal_messages
  for insert to authenticated with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.portal_conversations c
      where c.id = conversation_id
        and public.facilitator_can_message_student(c.student_id)
    )
  );

drop policy if exists portal_message_facilitator_read_state on public.portal_messages;
create policy portal_message_facilitator_read_state on public.portal_messages
  for update to authenticated using (
    sender_id <> auth.uid()
    and exists (
      select 1 from public.portal_conversations c
      where c.id = conversation_id
        and public.facilitator_can_message_student(c.student_id)
    )
  ) with check (read_at is not null);

create or replace function public.notify_portal_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  student_uid uuid;
  student_name text;
  recipient record;
begin
  select s.user_id, concat_ws(' ', s.first_name, s.last_name)
    into student_uid, student_name
    from public.portal_conversations c
    join public.students s on s.id = c.student_id
    where c.id = new.conversation_id;
  if new.sender_id = student_uid then
    for recipient in
      select distinct user_id from public.user_roles
      where role::text in ('super_admin','admissions_admin','academic_admin')
    loop
      insert into public.notifications(user_id, title, body, category)
        values (recipient.user_id, 'New student message', student_name || ' sent a portal message.', 'messages');
    end loop;
    for recipient in
      select distinct a.facilitator_id as user_id
      from public.facilitator_unit_assignments a
      join public.course_units u on u.id = a.unit_id
      join public.user_roles r on r.user_id = a.facilitator_id and r.role::text = 'facilitator'
      join public.portal_conversations c on c.id = new.conversation_id
      where a.active
        and u.course_id = (select course_id from public.students where id = c.student_id)
        and exists (
          select 1 from public.students s
          where s.id = c.student_id and s.status = 'active'
            and (u.level_id is null or u.level_id = s.level_id)
        )
    loop
      insert into public.notifications(user_id, title, body, category)
        values (recipient.user_id, 'Student sent you a message', student_name || ' sent a portal message.', 'messages');
    end loop;
  elsif student_uid is not null then
    insert into public.notifications(user_id, title, body, category)
      values (student_uid, 'New reply in your portal inbox', 'There is a new reply in your portal conversation.', 'messages');
  end if;
  update public.portal_conversations set updated_at = now() where id = new.conversation_id;
  return new;
end;
$$;
