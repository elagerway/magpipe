-- Add message_sid column to sms_messages for tracking delivery status
ALTER TABLE public.sms_messages
ADD COLUMN IF NOT EXISTS message_sid TEXT;

-- Add index for looking up messages by SID (used by status webhook)
CREATE INDEX IF NOT EXISTS idx_sms_messages_message_sid
ON public.sms_messages(message_sid)
WHERE message_sid IS NOT NULL;

-- Add delivered_at column to track when message was delivered
ALTER TABLE public.sms_messages
ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;

-- Update status constraint to include 'undelivered' status
ALTER TABLE public.sms_messages
DROP CONSTRAINT IF EXISTS sms_messages_status_check;

ALTER TABLE public.sms_messages
ADD CONSTRAINT sms_messages_status_check
CHECK (status IN ('pending', 'sent', 'delivered', 'undelivered', 'failed'));

COMMENT ON COLUMN public.sms_messages.message_sid IS 'SignalWire message SID for tracking delivery status';
COMMENT ON COLUMN public.sms_messages.delivered_at IS 'Timestamp when message was confirmed delivered';
