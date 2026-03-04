-- Migration 057: Create Collected Call Data Table
-- Stores dynamic data collected from callers during conversations

CREATE TABLE IF NOT EXISTS public.collected_call_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  call_id UUID REFERENCES public.call_records(id) ON DELETE SET NULL,

  -- Data fields
  data_type TEXT NOT NULL, -- e.g., 'email', 'phone', 'name', 'company', 'reason'
  data_value TEXT NOT NULL, -- The actual value
  context TEXT, -- Additional context about why this was collected

  -- Metadata
  collected_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_collected_call_data_user_id ON public.collected_call_data(user_id);
CREATE INDEX idx_collected_call_data_call_id ON public.collected_call_data(call_id);
CREATE INDEX idx_collected_call_data_type ON public.collected_call_data(data_type);

-- RLS Policies
ALTER TABLE public.collected_call_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own collected data"
  ON public.collected_call_data
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can insert collected data"
  ON public.collected_call_data
  FOR INSERT
  WITH CHECK (true);

-- Comments
COMMENT ON TABLE public.collected_call_data IS 'Stores dynamic data collected from callers during voice conversations';
COMMENT ON COLUMN public.collected_call_data.data_type IS 'Type of data collected (email, phone, name, company, etc.)';
COMMENT ON COLUMN public.collected_call_data.data_value IS 'The actual value provided by the caller';
COMMENT ON COLUMN public.collected_call_data.context IS 'Why this data was collected or additional context';
