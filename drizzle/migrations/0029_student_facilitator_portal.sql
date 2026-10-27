alter type public.app_role add value if not exists 'facilitator';

create table public.student_level_applications (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  level_id uuid not null references public.course_levels(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  student_message text,
  admin_message text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.submit_student_level_application(_level_id uuid, _message text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
student_row public.students%rowtype;
requested_level public.course_levels%rowtype;
application_id uuid;
recipient record;
begin
select * into student_row from public.students where user_id = auth.uid();
if not found or student_row.status <> 'active' then
  raise exception 'An active student record is required.';
end if;
select * into requested_level from public.course_levels
  where id = _level_id and course_id = student_row.course_id and published
    and sort_order > coalesce((
      select current_level.sort_order from public.course_levels current_level
      where current_level.id = student_row.level_id
    ), 0);
if not found then raise exception 'Select an available higher level in your current course.'; end if;
insert into public.student_level_applications(student_id, level_id, student_message)
  values (student_row.id, requested_level.id, nullif(left(trim(_message), 1000), ''))
  returning id into application_id;
for recipient in
  select distinct user_id from public.user_roles
  where role::text in ('super_admin','admissions_admin','academic_admin')
loop
  insert into public.notifications(user_id, title, body, category)
    values (
      recipient.user_id,
      'Student level application',
      concat_ws(' ', student_row.first_name, student_row.last_name)
        || ' applied to progress to ' || requested_level.name || '.',
      'academics'
    );
end loop;
return application_id;
end;
$$;
revoke insert, update on public.student_level_applications from authenticated;
grant execute on function public.submit_student_level_application(uuid, text) to authenticated;
create unique index student_level_application_pending_idx
  on public.student_level_applications(student_id) where status = 'pending';
create index student_level_application_status_idx
  on public.student_level_applications(status, created_at desc);
grant select on public.student_level_applications to authenticated;
grant all on public.student_level_applications to service_role;
alter table public.student_level_applications enable row level security;
update public.students s
set level_id = e.level_id
from public.enrollments e
where s.id = e.student_id and s.level_id is null and e.level_id is not null and e.status = 'active';
create policy student_level_application_read on public.student_level_applications
  for select to authenticated using (
    student_id = public.my_student_id()
    or public.has_any_role(auth.uid(), array['super_admin','admissions_admin','academic_admin']::public.app_role[])
  );

create or replace function public.review_student_level_application(
  _application_id uuid,
  _decision text,
  _admin_message text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  request_row public.student_level_applications%rowtype;
  student_row public.students%rowtype;
  next_level public.course_levels%rowtype;
begin
  if not public.has_any_role(
    auth.uid(),
    array['super_admin','admissions_admin','academic_admin']::public.app_role[]
  ) then raise exception 'You are not allowed to review level applications.'; end if;
  if _decision not in ('approved', 'rejected') then raise exception 'Choose approve or reject.'; end if;
  select * into request_row from public.student_level_applications
    where id = _application_id for update;
  if not found or request_row.status <> 'pending' then
    raise exception 'This level application is no longer pending.';
  end if;
  select * into student_row from public.students where id = request_row.student_id for update;
  select * into next_level from public.course_levels
    where id = request_row.level_id and course_id = student_row.course_id and published
      and sort_order > coalesce((
        select current_level.sort_order from public.course_levels current_level
        where current_level.id = student_row.level_id
      ), 0);
  if not found then raise exception 'The requested course level is unavailable.'; end if;

  update public.student_level_applications
    set status = _decision, admin_message = nullif(left(trim(_admin_message), 1000), ''),
        reviewed_by = auth.uid(), reviewed_at = now()
    where id = request_row.id;

  if _decision = 'approved' then
    update public.students
      set level_id = next_level.id, current_semester = next_level.name
      where id = student_row.id;
    if student_row.study_mode <> 'online' then
      update public.enrollments
        set status = 'completed'
        where student_id = student_row.id and status = 'active';
      insert into public.enrollments(student_id, course_id, level_id, intake_id, status)
        values (student_row.id, student_row.course_id, next_level.id, student_row.intake_id, 'active');
    end if;
    if student_row.user_id is not null then
      insert into public.notifications(user_id, title, body, category)
        values (
          student_row.user_id,
          'Level application approved',
          'You have been enrolled in ' || next_level.name || '. Your new course units are now available.',
          'academics'
        );
    end if;
  elsif student_row.user_id is not null then
    insert into public.notifications(user_id, title, body, category)
      values (
        student_row.user_id,
        'Level application update',
        coalesce(nullif(left(trim(_admin_message), 1000), ''), 'Your application to progress to the next level was not approved.'),
        'academics'
      );
  end if;
end;
$$;
grant execute on function public.review_student_level_application(uuid, text, text) to authenticated;

create table public.student_course_feedback (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  category text not null check (category in ('course', 'progress', 'curriculum', 'other')),
  subject text not null check (length(trim(subject)) between 1 and 160),
  body text not null check (length(trim(body)) between 1 and 5000),
  status text not null default 'new' check (status in ('new', 'reviewing', 'resolved')),
  admin_reply text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index student_course_feedback_recent_idx on public.student_course_feedback(created_at desc);
grant select, insert on public.student_course_feedback to authenticated;
grant update (status, admin_reply) on public.student_course_feedback to authenticated;
grant all on public.student_course_feedback to service_role;
alter table public.student_course_feedback enable row level security;
create policy student_feedback_read on public.student_course_feedback
  for select to authenticated using (
    student_id = public.my_student_id()
    or public.has_any_role(auth.uid(), array['super_admin','admissions_admin','academic_admin']::public.app_role[])
  );
create policy student_feedback_create on public.student_course_feedback
  for insert to authenticated with check (student_id = public.my_student_id() and status = 'new');
create policy student_feedback_staff_update on public.student_course_feedback
  for update to authenticated using (
    public.has_any_role(auth.uid(), array['super_admin','admissions_admin','academic_admin']::public.app_role[])
  ) with check (
    public.has_any_role(auth.uid(), array['super_admin','admissions_admin','academic_admin']::public.app_role[])
  );

create or replace function public.notify_student_feedback()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  student_name text;
  recipient record;
begin
  select concat_ws(' ', first_name, last_name) into student_name
    from public.students where id = new.student_id;
  for recipient in
    select distinct user_id from public.user_roles
    where role::text in ('super_admin','admissions_admin','academic_admin')
  loop
    insert into public.notifications(user_id, title, body, category)
      values (recipient.user_id, 'Student feedback submitted', student_name || ' submitted course feedback.', 'student_feedback');
  end loop;
  return new;
end;
$$;
create trigger student_feedback_notification after insert on public.student_course_feedback
  for each row execute function public.notify_student_feedback();

create or replace function public.notify_student_feedback_reply()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare student_uid uuid;
begin
  if new.admin_reply is distinct from old.admin_reply and nullif(trim(new.admin_reply), '') is not null then
    select user_id into student_uid from public.students where id = new.student_id;
    if student_uid is not null then
      insert into public.notifications(user_id, title, body, category)
        values (student_uid, 'Response to your course feedback', new.subject, 'student_feedback');
    end if;
  end if;
  return new;
end;
$$;
create trigger student_feedback_reply_notification after update on public.student_course_feedback
  for each row execute function public.notify_student_feedback_reply();

create table public.portal_conversations (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null unique references public.students(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.portal_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.portal_conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (length(trim(body)) between 1 and 5000),
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index portal_messages_conversation_idx on public.portal_messages(conversation_id, created_at);
grant select, insert on public.portal_conversations to authenticated;
grant select, insert on public.portal_messages to authenticated;
grant update (read_at) on public.portal_messages to authenticated;
grant all on public.portal_conversations, public.portal_messages to service_role;
alter table public.portal_conversations enable row level security;
alter table public.portal_messages enable row level security;
create policy portal_conversation_participant_read on public.portal_conversations
  for select to authenticated using (
    student_id = public.my_student_id()
    or public.has_any_role(auth.uid(), array['super_admin','admissions_admin','academic_admin']::public.app_role[])
  );
create policy portal_conversation_student_create on public.portal_conversations
  for insert to authenticated with check (student_id = public.my_student_id());
create policy portal_message_participant_read on public.portal_messages
  for select to authenticated using (
    exists (
      select 1 from public.portal_conversations c
      where c.id = conversation_id
        and (c.student_id = public.my_student_id()
          or public.has_any_role(auth.uid(), array['super_admin','admissions_admin','academic_admin']::public.app_role[]))
    )
  );
create policy portal_message_participant_send on public.portal_messages
  for insert to authenticated with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.portal_conversations c
      where c.id = conversation_id
        and (c.student_id = public.my_student_id()
          or public.has_any_role(auth.uid(), array['super_admin','admissions_admin','academic_admin']::public.app_role[]))
    )
  );
create policy portal_message_participant_read_state on public.portal_messages
  for update to authenticated using (
    sender_id <> auth.uid()
    and exists (
      select 1 from public.portal_conversations c
      where c.id = conversation_id
        and (c.student_id = public.my_student_id()
          or public.has_any_role(auth.uid(), array['super_admin','admissions_admin','academic_admin']::public.app_role[]))
    )
  ) with check (read_at is not null);

create or replace function public.get_or_create_student_conversation()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare conversation_id uuid;
begin
  if auth.uid() is null or public.my_student_id() is null then
    raise exception 'An active student account is required.';
  end if;
  insert into public.portal_conversations(student_id)
    values (public.my_student_id())
    on conflict (student_id) do update set student_id = excluded.student_id
    returning id into conversation_id;
  return conversation_id;
end;
$$;
grant execute on function public.get_or_create_student_conversation() to authenticated;

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
  elsif student_uid is not null then
    insert into public.notifications(user_id, title, body, category)
      values (student_uid, 'Admin replied to your message', 'There is a new reply in your portal inbox.', 'messages');
  end if;
  update public.portal_conversations set updated_at = now() where id = new.conversation_id;
  return new;
end;
$$;
create trigger portal_message_notification after insert on public.portal_messages
  for each row execute function public.notify_portal_message();

create table public.facilitator_unit_assignments (
  id uuid primary key default gen_random_uuid(),
  facilitator_id uuid not null references auth.users(id) on delete cascade,
  unit_id uuid not null references public.course_units(id) on delete cascade,
  active boolean not null default true,
  can_manage_materials boolean not null default false,
  can_manage_assignments boolean not null default false,
  can_manage_cats boolean not null default false,
  can_manage_results boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (facilitator_id, unit_id)
);
create index facilitator_unit_assignment_facilitator_idx
  on public.facilitator_unit_assignments(facilitator_id, active);
grant select, insert, update, delete on public.facilitator_unit_assignments to authenticated;
grant all on public.facilitator_unit_assignments to service_role;
alter table public.facilitator_unit_assignments enable row level security;
create policy facilitator_unit_assignment_admin_manage on public.facilitator_unit_assignments
  for all to authenticated using (
    public.has_any_role(auth.uid(), array['super_admin','academic_admin']::public.app_role[])
  ) with check (
    public.has_any_role(auth.uid(), array['super_admin','academic_admin']::public.app_role[])
  );
create policy facilitator_unit_assignment_own_read on public.facilitator_unit_assignments
  for select to authenticated using (facilitator_id = auth.uid());

create or replace function public.notify_facilitator_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare unit_title text;
begin
  if tg_op = 'INSERT' then
    if new.active then
      select title into unit_title from public.course_units where id = new.unit_id;
      insert into public.notifications(user_id, title, body, category)
        values (new.facilitator_id, 'Teaching unit assigned', 'You have been assigned to ' || coalesce(unit_title, 'a course unit') || '.', 'academics');
    end if;
  elsif new.active and (
    old.active is distinct from new.active or old.unit_id is distinct from new.unit_id
  ) then
    select title into unit_title from public.course_units where id = new.unit_id;
    insert into public.notifications(user_id, title, body, category)
      values (new.facilitator_id, 'Teaching unit assigned', 'You have been assigned to ' || coalesce(unit_title, 'a course unit') || '.', 'academics');
  end if;
  return new;
end;
$$;
create trigger facilitator_assignment_notification
  after insert or update on public.facilitator_unit_assignments
  for each row execute function public.notify_facilitator_assignment();

create trigger facilitator_assignment_updated_at before update on public.facilitator_unit_assignments
  for each row execute function public.touch_updated_at();
create trigger student_level_application_updated_at before update on public.student_level_applications
  for each row execute function public.touch_updated_at();
create trigger student_course_feedback_updated_at before update on public.student_course_feedback
  for each row execute function public.touch_updated_at();
create trigger portal_conversation_updated_at before update on public.portal_conversations
  for each row execute function public.touch_updated_at();

create or replace function public.facilitator_unit_permission(
  _user_id uuid,
  _unit_id uuid,
  _permission text default null
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select _user_id = auth.uid() and exists (
    select 1 from public.facilitator_unit_assignments a
    join public.user_roles r on r.user_id = a.facilitator_id and r.role::text = 'facilitator'
    where a.facilitator_id = _user_id and a.unit_id = _unit_id and a.active
      and (
        _permission is null
        or (_permission = 'materials' and a.can_manage_materials)
        or (_permission = 'assignments' and a.can_manage_assignments)
        or (_permission = 'cats' and a.can_manage_cats)
        or (_permission = 'results' and a.can_manage_results)
      )
  );
$$;
grant execute on function public.facilitator_unit_permission(uuid, uuid, text) to authenticated;

create policy facilitator_students_read on public.students
  for select to authenticated using (
    exists (
      select 1 from public.facilitator_unit_assignments a
      join public.course_units u on u.id = a.unit_id
      where a.facilitator_id = auth.uid() and a.active
        and u.course_id = students.course_id
        and students.status = 'active'
        and (u.level_id is null or u.level_id = students.level_id)
    )
  );

create policy facilitator_materials_read on public.learning_materials
  for select to authenticated using (
    unit_id is not null
    and exists (
      select 1 from public.course_units u
      where u.id = learning_materials.unit_id and u.course_id = learning_materials.course_id
    )
    and public.facilitator_unit_permission(auth.uid(), unit_id)
  );
create policy facilitator_materials_manage on public.learning_materials
  for all to authenticated using (
    unit_id is not null
    and exists (
      select 1 from public.course_units u
      where u.id = learning_materials.unit_id and u.course_id = learning_materials.course_id
    )
    and public.facilitator_unit_permission(auth.uid(), unit_id, 'materials')
  ) with check (
    unit_id is not null
    and exists (
      select 1 from public.course_units u
      where u.id = learning_materials.unit_id and u.course_id = learning_materials.course_id
    )
    and public.facilitator_unit_permission(auth.uid(), unit_id, 'materials')
  );
create policy facilitator_assignments_read on public.assignments
  for select to authenticated using (
    unit_id is not null
    and exists (
      select 1 from public.course_units u
      where u.id = assignments.unit_id and u.course_id = assignments.course_id
    )
    and public.facilitator_unit_permission(auth.uid(), unit_id)
  );
create policy facilitator_assignments_manage on public.assignments
  for all to authenticated using (
    unit_id is not null
    and exists (
      select 1 from public.course_units u
      where u.id = assignments.unit_id and u.course_id = assignments.course_id
    )
    and public.facilitator_unit_permission(auth.uid(), unit_id, 'assignments')
  ) with check (
    unit_id is not null
    and exists (
      select 1 from public.course_units u
      where u.id = assignments.unit_id and u.course_id = assignments.course_id
    )
    and public.facilitator_unit_permission(auth.uid(), unit_id, 'assignments')
  );
create policy facilitator_submissions_read on public.submissions
  for select to authenticated using (
    exists (
      select 1 from public.assignments a
      where a.id = assignment_id and a.unit_id is not null
        and public.facilitator_unit_permission(auth.uid(), a.unit_id)
    )
  );
create policy facilitator_submissions_grade on public.submissions
  for update to authenticated using (
    exists (
      select 1 from public.assignments a
      where a.id = assignment_id and a.unit_id is not null
        and exists (
          select 1 from public.course_units u
          join public.students s on s.course_id = u.course_id
          where u.id = a.unit_id and u.course_id = a.course_id
            and s.id = submissions.student_id and s.status = 'active'
            and (u.level_id is null or u.level_id = s.level_id)
        )
        and public.facilitator_unit_permission(auth.uid(), a.unit_id, 'assignments')
    )
  ) with check (
    exists (
      select 1 from public.assignments a
      where a.id = assignment_id and a.unit_id is not null
        and exists (
          select 1 from public.course_units u
          join public.students s on s.course_id = u.course_id
          where u.id = a.unit_id and u.course_id = a.course_id
            and s.id = submissions.student_id and s.status = 'active'
            and (u.level_id is null or u.level_id = s.level_id)
        )
        and public.facilitator_unit_permission(auth.uid(), a.unit_id, 'assignments')
    )
  );
create policy facilitator_results_read on public.results
  for select to authenticated using (
    unit_id is not null
    and exists (
      select 1 from public.course_units u
      join public.students s on s.course_id = u.course_id
      where u.id = results.unit_id and s.id = results.student_id and s.status = 'active'
        and (u.level_id is null or u.level_id = s.level_id)
    )
    and public.facilitator_unit_permission(auth.uid(), unit_id, 'results')
  );
create policy facilitator_results_manage on public.results
  for insert to authenticated with check (
    unit_id is not null
    and exists (
      select 1 from public.course_units u
      join public.students s on s.course_id = u.course_id
      where u.id = results.unit_id and s.id = results.student_id and s.status = 'active'
        and (u.level_id is null or u.level_id = s.level_id)
    )
    and public.facilitator_unit_permission(auth.uid(), unit_id, 'results')
  );

alter table public.cat_assessments add column if not exists unit_id uuid references public.course_units(id) on delete set null;

create or replace function public.create_facilitator_cat(
  _unit_id uuid,
  _title text,
  _instructions text,
  _duration_minutes integer,
  _opens_at timestamptz,
  _closes_at timestamptz,
  _questions jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  assessment_id uuid;
  course_id uuid;
  question jsonb;
  position integer := 0;
begin
  if not public.facilitator_unit_permission(auth.uid(), _unit_id, 'cats') then
    raise exception 'CAT creation is not enabled for this assigned unit.';
  end if;
  select u.course_id into course_id from public.course_units u where u.id = _unit_id;
  if course_id is null then raise exception 'Choose a valid assigned unit.'; end if;
  if nullif(trim(_title), '') is null or length(trim(_title)) > 160 then
    raise exception 'Enter a CAT title of 1 to 160 characters.';
  end if;
  if _duration_minutes is null or _duration_minutes not between 1 and 360
    or _opens_at is null or _opens_at <= now() or _closes_at is null or _closes_at <= _opens_at then
    raise exception 'Choose a valid duration and future opening and closing times.';
  end if;
  if _questions is null or jsonb_typeof(_questions) is distinct from 'array' then
    raise exception 'A CAT must contain between 1 and 100 questions.';
  end if;
  if jsonb_array_length(_questions) not between 1 and 100 then
    raise exception 'A CAT must contain between 1 and 100 questions.';
  end if;
  insert into public.cat_assessments(
    course_id, unit_id, title, instructions, duration_minutes, opens_at, closes_at, created_by
  ) values (
    course_id, _unit_id, trim(_title), nullif(trim(_instructions), ''),
    _duration_minutes, _opens_at, _closes_at, auth.uid()
  ) returning id into assessment_id;
  for question in select value from jsonb_array_elements(_questions)
  loop
    position := position + 1;
    if jsonb_typeof(question) <> 'object'
      or nullif(trim(question->>'prompt'), '') is null
      or nullif(trim(question->>'option_a'), '') is null
      or nullif(trim(question->>'option_b'), '') is null
      or nullif(trim(question->>'option_c'), '') is null
      or nullif(trim(question->>'option_d'), '') is null
      or upper(coalesce(question->>'correct_option', '')) not in ('A','B','C','D')
      or coalesce((question->>'points')::integer, 0) not between 1 and 100 then
      raise exception 'Question % must have a prompt, four choices, a correct answer, and 1 to 100 points.', position;
    end if;
    insert into public.cat_questions(
      assessment_id, prompt, option_a, option_b, option_c, option_d, correct_option, points, position
    ) values (
      assessment_id, trim(question->>'prompt'), trim(question->>'option_a'),
      trim(question->>'option_b'), trim(question->>'option_c'), trim(question->>'option_d'),
      upper(question->>'correct_option'), (question->>'points')::integer, position
    );
  end loop;
  return assessment_id;
end;
$$;
grant execute on function public.create_facilitator_cat(uuid, text, text, integer, timestamptz, timestamptz, jsonb)
  to authenticated;

create policy facilitator_learning_storage_read on storage.objects
  for select to authenticated using (
    bucket_id = 'learning'
    and exists (
      select 1 from public.facilitator_unit_assignments a
      where a.facilitator_id = auth.uid() and a.active
        and a.unit_id::text = (storage.foldername(name))[2]
        and exists (
          select 1 from public.course_units u
          where u.id = a.unit_id and u.course_id::text = (storage.foldername(name))[1]
        )
    )
  );
create policy facilitator_learning_storage_insert on storage.objects
  for insert to authenticated with check (
    bucket_id = 'learning'
    and exists (
      select 1 from public.facilitator_unit_assignments a
      where a.facilitator_id = auth.uid() and a.active and a.can_manage_materials
        and a.unit_id::text = (storage.foldername(name))[2]
    )
    and exists (
      select 1 from public.course_units u
      where u.id::text = (storage.foldername(name))[2]
        and u.course_id::text = (storage.foldername(name))[1]
    )
  );
