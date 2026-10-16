create index if not exists enrollments_student_course_idx
  on public.enrollments(student_id, course_id);

create index if not exists results_student_published_idx
  on public.results(student_id, published);

create index if not exists fees_student_created_idx
  on public.fees(student_id, created_at desc);

create index if not exists payments_student_status_paid_idx
  on public.payments(student_id, status, paid_at desc);

create index if not exists faqs_published_order_idx
  on public.faqs(sort_order) where published;

create table if not exists public.faq_search_insights (
  faq_id uuid not null references public.faqs(id) on delete cascade,
  search_date date not null default current_date,
  bucket smallint not null check (bucket between 0 and 15),
  search_count bigint not null default 0 check (search_count >= 0),
  primary key (faq_id, search_date, bucket)
);

create index if not exists faq_search_insights_date_faq_idx
  on public.faq_search_insights(search_date, faq_id);

alter table public.faq_search_insights enable row level security;
revoke all on public.faq_search_insights from anon, authenticated;
grant all on public.faq_search_insights to service_role;

create or replace function public.record_faq_search(_faq_id uuid, _bucket smallint)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if _bucket is null or _bucket < 0 or _bucket > 15 then
    raise exception 'Invalid search bucket';
  end if;

  if not exists (
    select 1 from public.faqs where id = _faq_id and published
  ) then
    raise exception 'FAQ search target is unavailable';
  end if;

  insert into public.faq_search_insights as existing(faq_id, search_date, bucket, search_count)
  values (_faq_id, current_date, _bucket, 1)
  on conflict (faq_id, search_date, bucket)
  do update set search_count = existing.search_count + 1;
end;
$$;

revoke all on function public.record_faq_search(uuid, smallint) from public;
grant execute on function public.record_faq_search(uuid, smallint) to anon, authenticated;

create or replace function public.list_faq_search_insights(_days integer default 30)
returns table(faq_id uuid, question text, category text, search_count bigint)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if not public.has_any_role(
    auth.uid(),
    array['super_admin', 'content_admin']::public.app_role[]
  ) then
    raise exception 'Forbidden';
  end if;

  if _days is null or _days < 1 or _days > 365 then
    raise exception 'Days must be between 1 and 365';
  end if;

  return query
  select f.id, f.question, f.category, sum(i.search_count)::bigint
  from public.faq_search_insights i
  join public.faqs f on f.id = i.faq_id
  where i.search_date >= current_date - (_days - 1)
  group by f.id, f.question, f.category
  order by sum(i.search_count) desc, f.question
  limit 100;
end;
$$;

revoke all on function public.list_faq_search_insights(integer) from public;
grant execute on function public.list_faq_search_insights(integer) to authenticated;
