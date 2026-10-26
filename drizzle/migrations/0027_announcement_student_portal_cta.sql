alter table public.announcements
  add column if not exists cta_label text,
  add column if not exists cta_url text;

alter table public.announcements
  add constraint announcements_cta_pair_check
  check (
    (cta_label is null and cta_url is null)
    or (
      nullif(btrim(cta_label), '') is not null
      and cta_url ~ '^https?://[^[:space:]]+$'
    )
  );
