-- Create sms_messages table for tracking SMS interactions
CREATE TABLE IF NOT EXISTS public.sms_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  sender_number TEXT NOT NULL CHECK (sender_number ~ '^\+[1-9]\d{1,14}$'),
  recipient_number TEXT NOT NULL CHECK (recipient_number ~ '^\+[1-9]\d{1,14}$'),
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  content TEXT NOT NULL CHECK (length(content) > 0 AND length(content) <= 1600),
  status TEXT DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'failed', 'pending')),
  sent_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance-critical queries
CREATE INDEX IF NOT EXISTS idx_sms_messages_user_id ON public.sms_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_sms_messages_user_sent ON public.sms_messages(user_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_sms_messages_contact_sent ON public.sms_messages(contact_id, sent_at DESC) WHERE contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sms_messages_sender_number ON public.sms_messages(sender_number);

-- Enable Row Level Security
ALTER TABLE public.sms_messages ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only access their own SMS messages
CREATE POLICY "Users can view own sms messages"
  ON public.sms_messages
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own sms messages"
  ON public.sms_messages
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own sms messages"
  ON public.sms_messages
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own sms messages"
  ON public.sms_messages
  FOR DELETE
  USING (auth.uid() = user_id);

-- Comments
COMMENT ON TABLE public.sms_messages IS 'Historical record of all SMS message exchanges';
COMMENT ON COLUMN public.sms_messages.content IS 'SMS message content (max 1600 chars)';
COMMENT ON COLUMN public.sms_messages.status IS 'Delivery status of the message';
COMMENT ON COLUMN public.sms_messages.direction IS 'Whether message was inbound or outbound';