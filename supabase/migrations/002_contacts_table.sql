-- Create contacts table for user's whitelisted phone contacts
CREATE TABLE IF NOT EXISTS public.contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  phone_number TEXT NOT NULL CHECK (phone_number ~ '^\+[1-9]\d{1,14}$'),
  is_whitelisted BOOLEAN DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Unique constraint: no duplicate phone numbers per user
  CONSTRAINT unique_user_phone UNIQUE (user_id, phone_number)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_contacts_user_id ON public.contacts(user_id);
CREATE INDEX IF NOT EXISTS idx_contacts_user_phone ON public.contacts(user_id, phone_number);
CREATE INDEX IF NOT EXISTS idx_contacts_phone_number ON public.contacts(phone_number);

-- Enable Row Level Security
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only access their own contacts
CREATE POLICY "Users can view own contacts"
  ON public.contacts
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own contacts"
  ON public.contacts
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own contacts"
  ON public.contacts
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own contacts"
  ON public.contacts
  FOR DELETE
  USING (auth.uid() = user_id);

-- Comments
COMMENT ON TABLE public.contacts IS 'User phone contacts for whitelisting and screening';
COMMENT ON COLUMN public.contacts.is_whitelisted IS 'If true, calls/SMS from this contact bypass screening';
COMMENT ON COLUMN public.contacts.phone_number IS 'Contact phone number in E.164 format';