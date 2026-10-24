alter table public.articles
  add column if not exists attachment_file_name text;

alter table public.announcements
  add column if not exists attachment_file_name text;

drop policy if exists "ann public" on public.announcements;
create policy "ann public" on public.announcements
  for select to anon, authenticated
  using (published or public.is_staff(auth.uid()));

drop policy if exists "ann write" on public.announcements;
create policy "ann write" on public.announcements
  for all to authenticated
  using (public.has_any_role(auth.uid(), array['super_admin']::public.app_role[]))
  with check (public.has_any_role(auth.uid(), array['super_admin']::public.app_role[]));

drop policy if exists "art public" on public.articles;
create policy "art public" on public.articles
  for select to anon, authenticated
  using (
    (status = 'published' or (status = 'scheduled' and published_at <= now()))
    or public.has_any_role(auth.uid(), array['super_admin','content_admin']::public.app_role[])
  );
