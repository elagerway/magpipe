-- Add webhook_url to whatsapp_accounts so external apps (e.g. SiteSuper)
-- can receive inbound WhatsApp messages forwarded from this function.
ALTER TABLE whatsapp_accounts ADD COLUMN IF NOT EXISTS webhook_url text;
