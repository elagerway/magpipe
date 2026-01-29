-- External SIP Trunks Feature
-- Allows users to bring their own SIP trunks from providers like Orange, Twilio, etc.

-- Table: external_sip_trunks
-- Stores user's external SIP trunk configurations
CREATE TABLE IF NOT EXISTS external_sip_trunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

  -- LiveKit trunk IDs (created via API)
  livekit_inbound_trunk_id TEXT,        -- LiveKit inbound trunk ID
  livekit_outbound_trunk_id TEXT,       -- LiveKit outbound trunk ID (optional)
  livekit_dispatch_rule_id TEXT,        -- Dispatch rule for routing calls

  -- Provider info (for display/management)
  name TEXT NOT NULL,                   -- User-friendly name, e.g., "Orange West Africa"
  provider TEXT,                        -- Provider name (optional, for UI categorization)

  -- Authentication method
  auth_type TEXT NOT NULL CHECK (auth_type IN ('ip', 'registration')),

  -- IP-based auth fields
  allowed_source_ips TEXT[],            -- Array of allowed IP addresses/CIDR ranges

  -- Registration-based auth fields
  auth_username TEXT,                   -- SIP auth username
  auth_password_encrypted TEXT,         -- SIP auth password (encrypted)

  -- Outbound trunk config (for making calls via this trunk)
  outbound_address TEXT,                -- SIP server address, e.g., "sip.orange.cm:5060"
  outbound_transport TEXT DEFAULT 'udp' CHECK (outbound_transport IN ('udp', 'tcp', 'tls')),

  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'error', 'disabled')),
  status_message TEXT,                  -- Error message if status is 'error'

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for external_sip_trunks
CREATE INDEX IF NOT EXISTS idx_external_sip_trunks_user_id ON external_sip_trunks(user_id);
CREATE INDEX IF NOT EXISTS idx_external_sip_trunks_livekit_inbound ON external_sip_trunks(livekit_inbound_trunk_id) WHERE livekit_inbound_trunk_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_external_sip_trunks_active ON external_sip_trunks(user_id, is_active) WHERE is_active = TRUE;

-- Enable RLS for external_sip_trunks
ALTER TABLE external_sip_trunks ENABLE ROW LEVEL SECURITY;

-- RLS Policies for external_sip_trunks
DROP POLICY IF EXISTS "Users can view own external trunks" ON external_sip_trunks;
CREATE POLICY "Users can view own external trunks"
  ON external_sip_trunks FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own external trunks" ON external_sip_trunks;
CREATE POLICY "Users can insert own external trunks"
  ON external_sip_trunks FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own external trunks" ON external_sip_trunks;
CREATE POLICY "Users can update own external trunks"
  ON external_sip_trunks FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own external trunks" ON external_sip_trunks;
CREATE POLICY "Users can delete own external trunks"
  ON external_sip_trunks FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);


-- Table: external_sip_numbers
-- Phone numbers associated with external SIP trunks
CREATE TABLE IF NOT EXISTS external_sip_numbers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  trunk_id UUID NOT NULL REFERENCES external_sip_trunks(id) ON DELETE CASCADE,

  -- Phone number in E.164 format
  phone_number TEXT NOT NULL,

  -- Display name
  friendly_name TEXT,

  -- Whether this number is active for receiving calls
  is_active BOOLEAN DEFAULT TRUE,

  -- Country code for routing purposes (e.g., "CM" for Cameroon)
  country_code TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CONSTRAINT external_phone_number_format CHECK (phone_number ~ '^\+[1-9]\d{1,14}$'),
  CONSTRAINT unique_external_number UNIQUE (phone_number)  -- Globally unique
);

-- Indexes for external_sip_numbers
CREATE INDEX IF NOT EXISTS idx_external_sip_numbers_user_id ON external_sip_numbers(user_id);
CREATE INDEX IF NOT EXISTS idx_external_sip_numbers_trunk_id ON external_sip_numbers(trunk_id);
CREATE INDEX IF NOT EXISTS idx_external_sip_numbers_phone ON external_sip_numbers(phone_number);
CREATE INDEX IF NOT EXISTS idx_external_sip_numbers_active ON external_sip_numbers(is_active) WHERE is_active = TRUE;

-- Enable RLS for external_sip_numbers
ALTER TABLE external_sip_numbers ENABLE ROW LEVEL SECURITY;

-- RLS Policies for external_sip_numbers
DROP POLICY IF EXISTS "Users can view own external numbers" ON external_sip_numbers;
CREATE POLICY "Users can view own external numbers"
  ON external_sip_numbers FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own external numbers" ON external_sip_numbers;
CREATE POLICY "Users can insert own external numbers"
  ON external_sip_numbers FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own external numbers" ON external_sip_numbers;
CREATE POLICY "Users can update own external numbers"
  ON external_sip_numbers FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own external numbers" ON external_sip_numbers;
CREATE POLICY "Users can delete own external numbers"
  ON external_sip_numbers FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);


-- Add call_source column to call_records to track where calls originate
ALTER TABLE call_records ADD COLUMN IF NOT EXISTS
  call_source TEXT DEFAULT 'signalwire';

-- Add check constraint (handle existing data first)
DO $$
BEGIN
  -- Update any NULL values to default
  UPDATE call_records SET call_source = 'signalwire' WHERE call_source IS NULL;

  -- Add constraint if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'call_records_call_source_check'
  ) THEN
    ALTER TABLE call_records ADD CONSTRAINT call_records_call_source_check
      CHECK (call_source IN ('signalwire', 'external_trunk'));
  END IF;
END $$;


-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_external_trunk_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS external_sip_trunks_updated_at ON external_sip_trunks;
CREATE TRIGGER external_sip_trunks_updated_at
  BEFORE UPDATE ON external_sip_trunks
  FOR EACH ROW EXECUTE FUNCTION update_external_trunk_updated_at();

DROP TRIGGER IF EXISTS external_sip_numbers_updated_at ON external_sip_numbers;
CREATE TRIGGER external_sip_numbers_updated_at
  BEFORE UPDATE ON external_sip_numbers
  FOR EACH ROW EXECUTE FUNCTION update_external_trunk_updated_at();


-- Comments for documentation
COMMENT ON TABLE external_sip_trunks IS 'User-configured external SIP trunks from providers like Orange, Twilio, etc.';
COMMENT ON COLUMN external_sip_trunks.auth_type IS 'Authentication method: ip (IP whitelist) or registration (username/password)';
COMMENT ON COLUMN external_sip_trunks.allowed_source_ips IS 'Array of allowed source IP addresses or CIDR ranges for IP-based auth';
COMMENT ON COLUMN external_sip_trunks.livekit_inbound_trunk_id IS 'LiveKit SIP trunk ID for receiving inbound calls';
COMMENT ON COLUMN external_sip_trunks.livekit_dispatch_rule_id IS 'LiveKit dispatch rule ID for routing calls to agents';

COMMENT ON TABLE external_sip_numbers IS 'Phone numbers associated with external SIP trunks';
COMMENT ON COLUMN external_sip_numbers.phone_number IS 'Phone number in E.164 format (e.g., +237xxxxxxxxx)';
COMMENT ON COLUMN external_sip_numbers.country_code IS 'ISO 3166-1 alpha-2 country code (e.g., CM for Cameroon)';
