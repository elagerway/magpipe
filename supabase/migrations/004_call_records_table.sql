-- Create call_records table for tracking phone call interactions
CREATE TABLE IF NOT EXISTS public.call_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  caller_number TEXT NOT NULL CHECK (caller_number ~ '^\+[1-9]\d{1,14}$'),
  direction TEXT DEFAULT 'inbound' CHECK (direction IN ('inbound', 'outbound')),
  duration INTEGER CHECK (duration >= 0),
  disposition TEXT NOT NULL CHECK (disposition IN (
    'answered_by_pat',
    'transferred_to_user',
    'screened_out',
    'voicemail',
    'failed'
  )),
  recording_url TEXT,
  transcript TEXT,
  screening_notes TEXT,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure ended_at is after started_at
  CONSTRAINT ended_after_started CHECK (ended_at IS NULL OR ended_at >= started_at)
);

-- Indexes for performance-critical queries
CREATE INDEX IF NOT EXISTS idx_call_records_user_id ON public.call_records(user_id);
CREATE INDEX IF NOT EXISTS idx_call_records_user_started ON public.call_records(user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_call_records_contact_id ON public.call_records(contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_call_records_caller_number ON public.call_records(caller_number);

-- Enable Row Level Security
ALTER TABLE public.call_records ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only access their own call records
CREATE POLICY "Users can view own call records"
  ON public.call_records
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own call records"
  ON public.call_records
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own call records"
  ON public.call_records
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own call records"
  ON public.call_records
  FOR DELETE
  USING (auth.uid() = user_id);

-- Comments
COMMENT ON TABLE public.call_records IS 'Historical record of all phone call interactions';
COMMENT ON COLUMN public.call_records.disposition IS 'Final outcome of the call';
COMMENT ON COLUMN public.call_records.recording_url IS 'URL to audio recording in Supabase Storage';
COMMENT ON COLUMN public.call_records.transcript IS 'Full text transcript of the conversation';
COMMENT ON COLUMN public.call_records.screening_notes IS 'Notes from AI screening process for unknown callers';