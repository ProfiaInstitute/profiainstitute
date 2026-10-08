alter table public.articles
  add column attachment_url text,
  add column attachment_type text;

alter table public.announcements
  add column attachment_url text,
  add column attachment_type text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'media',
    'media',
    true,
    104857600,
    array[
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'video/mp4',
      'video/webm',
      'video/quicktime',
      'video/ogg',
      'audio/mpeg',
      'audio/ogg',
      'audio/wav',
      'audio/mp4'
    ]::text[]
  ),
  (
    'learning',
    'learning',
    false,
    104857600,
    array[
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'video/mp4',
      'video/webm',
      'video/quicktime',
      'video/ogg',
      'audio/mpeg',
      'audio/ogg',
      'audio/wav',
      'audio/mp4'
    ]::text[]
  )
on conflict (id) do update
set name = excluded.name,
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
