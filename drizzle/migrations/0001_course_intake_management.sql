alter table public.courses
  add column course_code text,
  add column study_mode public.study_mode not null default 'full_time',
  add column featured boolean not null default false,
  add column application_enabled boolean not null default true;

update public.courses
set study_mode = 'online'
where available_online;

create unique index courses_course_code_unique
  on public.courses(course_code)
  where course_code is not null;

create trigger a_intakes after insert or update or delete on public.intakes
  for each row execute function public.audit_row();
