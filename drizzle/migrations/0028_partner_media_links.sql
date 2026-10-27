alter table public.media
  add column if not exists link_url text;

alter table public.media
  add constraint media_link_url_http_check
  check (link_url is null or link_url ~ '^https?://[^[:space:]]+$');
