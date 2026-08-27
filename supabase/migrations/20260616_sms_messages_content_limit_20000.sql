-- Raise the sms_messages.content length cap from 1600 → 20000.
--
-- The 1600-char limit was an SMS-era constraint. WhatsApp voice notes are
-- transcribed (Whisper) and stored as the message content; a normal multi-trade
-- daily report runs ~1900+ chars and was being REJECTED by the old CHECK
-- (Postgres error 23514), silently dropping the inbound row so the agent never
-- replied. 20000 comfortably covers a long voice note; the webhook also caps
-- content at 19000 in code as a safety net.

ALTER TABLE sms_messages DROP CONSTRAINT IF EXISTS sms_messages_content_check;
ALTER TABLE sms_messages ADD CONSTRAINT sms_messages_content_check
  CHECK (length(content) > 0 AND length(content) <= 20000);
