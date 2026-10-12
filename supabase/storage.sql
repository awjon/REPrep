-- Run once in the Supabase SQL editor (not part of Drizzle migrations: the storage schema is Supabase-managed).
-- Private bucket for user documents. No storage.objects policies are created on purpose:
-- browsers never read or list objects directly. Uploads use short-lived signed upload URLs
-- and reads happen server-side with the service role (lib/storage/documents.ts), after the app
-- has checked ownership through RLS on the `documents` table.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 31457280, array['application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
