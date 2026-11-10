grant select on public.regulatory_source_updates to anon;

drop policy if exists regulatory_source_updates_public_read
  on public.regulatory_source_updates;

create policy regulatory_source_updates_public_read
  on public.regulatory_source_updates
  for select to anon, authenticated
  using (true);
