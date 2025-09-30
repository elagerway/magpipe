-- Create service_numbers table for managing multiple phone numbers per user
CREATE TABLE IF NOT EXISTS service_numbers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL UNIQUE,
  phone_sid TEXT NOT NULL UNIQUE, -- SignalWire SID for the number
  friendly_name TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  capabilities JSONB DEFAULT '{"voice": true, "sms": true, "mms": true}'::jsonb,
  purchased_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CONSTRAINT phone_number_format CHECK (
    phone_number ~ '^\+[1-9]\d{1,14}$'
  )
);

-- Create indexes
CREATE INDEX idx_service_numbers_user_id ON service_numbers(user_id);
CREATE INDEX idx_service_numbers_phone_number ON service_numbers(phone_number);
CREATE INDEX idx_service_numbers_is_active ON service_numbers(user_id, is_active) WHERE is_active = TRUE;

-- Enable RLS
ALTER TABLE service_numbers ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own service numbers"
  ON service_numbers
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own service numbers"
  ON service_numbers
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own service numbers"
  ON service_numbers
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own service numbers"
  ON service_numbers
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Add trigger for updated_at
CREATE TRIGGER service_numbers_updated_at
  BEFORE UPDATE ON service_numbers
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Comments
COMMENT ON TABLE service_numbers IS 'Service phone numbers purchased by users for receiving calls/SMS through Pat';
COMMENT ON COLUMN service_numbers.is_active IS 'Whether this number should actively receive and respond to calls/SMS';
COMMENT ON COLUMN service_numbers.phone_sid IS 'SignalWire SID for managing the number via API';