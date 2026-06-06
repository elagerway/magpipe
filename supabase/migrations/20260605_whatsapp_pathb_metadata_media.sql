-- Path B (SiteSuper WhatsApp): the customer owns the dialog; Magpipe relays
-- inbound WhatsApp (text + images) to their webhook with a stable thread id
-- and, for replies to their outbound, the originating customer metadata.
--
-- 1. Customer-supplied metadata on outbound sends, echoed back on inbound
--    replies for attribution (parallel to call_records.metadata).
alter table public.sms_messages
  add column if not exists metadata jsonb;

-- 2. Private bucket for inbound WhatsApp media. Meta only hands us a short-lived
--    URL that needs our access token to download, so we copy the bytes here and
--    forward a time-limited signed URL the customer can fetch without our token.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'whatsapp-media', 'whatsapp-media', false,
  10485760, -- 10 MB; WhatsApp images cap well under this
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do nothing;
