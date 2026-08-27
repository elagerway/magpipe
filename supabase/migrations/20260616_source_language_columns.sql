-- Detected source language of a translated message/call (ISO-639-1 code, e.g. 'zh','fr').
-- NULL when not translated or language unknown. Surfaced as a translation "bridge"
-- (e.g. "Mandarin → English") in the inbox and notifications.
-- NOTE: applied manually to the live DB (migration history is frozen; do not db push).
ALTER TABLE sms_messages ADD COLUMN IF NOT EXISTS source_language text;
ALTER TABLE call_records ADD COLUMN IF NOT EXISTS source_language text;
COMMENT ON COLUMN sms_messages.source_language IS 'Detected source language (ISO-639-1) when the message was auto-translated; NULL otherwise.';
COMMENT ON COLUMN call_records.source_language IS 'Detected source language (ISO-639-1) of the caller when non-default/translated; NULL otherwise.';
