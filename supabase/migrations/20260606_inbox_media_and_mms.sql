-- Code-review follow-ups (2026-06-06).

-- #1 — Photo/report attribution window. Records when a contact's photos were
-- last attached to a report tool, so a later report doesn't re-attach an earlier
-- report's photos (webhook-inbound-whatsapp/ai-reply.ts gathers media `sent_at >
-- last_media_reported_at`).
alter table public.conversation_contexts
  add column if not exists last_media_reported_at timestamptz;

-- #4 — Accept common MMS media types (not just images) so non-image MMS also
-- re-hosts to a fetchable signed URL instead of falling back to an unfetchable
-- raw carrier URL. Bump the size limit for video/pdf.
update storage.buckets
   set allowed_mime_types = array[
         'image/jpeg','image/jpg','image/png','image/webp','image/gif','image/heic',
         'video/mp4','video/3gpp','video/quicktime',
         'audio/ogg','audio/mpeg','audio/amr','audio/aac',
         'application/pdf'
       ],
       file_size_limit = 26214400  -- 25 MB
 where id = 'whatsapp-media';
