alter table public.results
  add column if not exists source_submission_id uuid
    references public.submissions(id) on delete set null;

create unique index if not exists results_source_submission_id_key
  on public.results(source_submission_id)
  where source_submission_id is not null;

drop policy if exists "subs own update" on public.submissions;

create or replace function public.enforce_assignment_deadline()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  assignment_due_at timestamptz;
  assignment_published boolean;
  current_student_id uuid;
begin
  if public.has_any_role(
    auth.uid(),
    array['super_admin','academic_admin']::public.app_role[]
  ) then
    return new;
  end if;

  current_student_id := public.my_student_id();
  if current_student_id is null or new.student_id <> current_student_id then
    raise exception 'You can only submit assignments for your own student account.';
  end if;

  if tg_op = 'UPDATE' then
    raise exception 'Assignments can only be submitted once.';
  end if;

  if new.status <> 'submitted' or new.grade is not null then
    raise exception 'Invalid assignment submission.';
  end if;

  select due_date, published
    into assignment_due_at, assignment_published
    from public.assignments
    where id = new.assignment_id;

  if not found or not assignment_published then
    raise exception 'This assignment is not open for submission.';
  end if;
  if assignment_due_at is null then
    raise exception 'This assignment does not have a submission deadline.';
  end if;
  if assignment_due_at <= now() then
    raise exception 'The submission deadline has passed.';
  end if;

  return new;
end;
$$;

drop trigger if exists submissions_enforce_assignment_deadline on public.submissions;
create trigger submissions_enforce_assignment_deadline
  before insert or update on public.submissions
  for each row execute function public.enforce_assignment_deadline();

create or replace function public.require_assignment_deadline_when_published()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.published and new.due_date is null then
    raise exception 'Set a submission deadline before publishing this assignment.';
  end if;
  return new;
end;
$$;

drop trigger if exists assignments_require_deadline on public.assignments;
create trigger assignments_require_deadline
  before insert or update of published, due_date on public.assignments
  for each row execute function public.require_assignment_deadline_when_published();

create or replace function public.mark_assignment_submission(
  _submission_id uuid,
  _score numeric,
  _grade text,
  _feedback text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  submission_record public.submissions%rowtype;
  assignment_title text;
  result_record_id uuid;
begin
  if not public.has_any_role(
    auth.uid(),
    array['super_admin','academic_admin']::public.app_role[]
  ) then
    raise exception 'Only academic staff can mark assignments.';
  end if;
  if _score is null or _score < 0 or _score > 100 then
    raise exception 'Score must be between 0 and 100.';
  end if;
  if nullif(trim(_grade), '') is null then
    raise exception 'Enter a grade before saving the result.';
  end if;

  select submission, assignment.title
    into submission_record, assignment_title
    from public.submissions submission
    join public.assignments assignment on assignment.id = submission.assignment_id
    where submission.id = _submission_id
    for update of submission;

  if not found then
    raise exception 'Assignment submission not found.';
  end if;

  update public.submissions
    set grade = trim(_grade),
        feedback = nullif(trim(_feedback), ''),
        status = 'marked'
    where id = _submission_id;

  insert into public.results (
    student_id,
    source_submission_id,
    unit_name,
    score,
    grade,
    published
  )
  values (
    submission_record.student_id,
    submission_record.id,
    assignment_title,
    _score,
    trim(_grade),
    false
  )
  on conflict (source_submission_id) where source_submission_id is not null
  do update set
    unit_name = excluded.unit_name,
    score = excluded.score,
    grade = excluded.grade,
    published = false
  returning id into result_record_id;

  return result_record_id;
end;
$$;

revoke all on function public.mark_assignment_submission(uuid, numeric, text, text)
  from public, anon;
grant execute on function public.mark_assignment_submission(uuid, numeric, text, text)
  to authenticated;
