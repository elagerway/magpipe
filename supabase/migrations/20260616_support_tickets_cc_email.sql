-- Persist CC recipients on inbound support tickets (enables "reply all").
-- email_messages already has cc/bcc columns; support_tickets did not.
-- Applied manually to the live DB (migration history is frozen ~Jan29).
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS cc_email TEXT;
