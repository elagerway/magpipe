-- Add provider-specific fields and constrain provider enum for external SIP trunks

-- Add new columns for API credentials and space URL
ALTER TABLE external_sip_trunks ADD COLUMN IF NOT EXISTS api_account_sid TEXT;
ALTER TABLE external_sip_trunks ADD COLUMN IF NOT EXISTS api_auth_token_encrypted TEXT;
ALTER TABLE external_sip_trunks ADD COLUMN IF NOT EXISTS provider_space_url TEXT;

-- Normalize existing provider values to 'other' if they don't match known providers
UPDATE external_sip_trunks
SET provider = CASE
  WHEN LOWER(provider) IN ('twilio') THEN 'twilio'
  WHEN LOWER(provider) IN ('signalwire') THEN 'signalwire'
  ELSE 'other'
END
WHERE provider IS NOT NULL;

-- Set NULL providers to 'other'
UPDATE external_sip_trunks SET provider = 'other' WHERE provider IS NULL;

-- Make provider NOT NULL with default
ALTER TABLE external_sip_trunks ALTER COLUMN provider SET NOT NULL;
ALTER TABLE external_sip_trunks ALTER COLUMN provider SET DEFAULT 'other';

-- Add CHECK constraint for provider enum
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'external_sip_trunks_provider_check'
  ) THEN
    ALTER TABLE external_sip_trunks ADD CONSTRAINT external_sip_trunks_provider_check
      CHECK (provider IN ('twilio', 'signalwire', 'other'));
  END IF;
END $$;

-- Comments
COMMENT ON COLUMN external_sip_trunks.api_account_sid IS 'Twilio Account SID or SignalWire Project ID';
COMMENT ON COLUMN external_sip_trunks.api_auth_token_encrypted IS 'Twilio Auth Token or SignalWire API Token (encrypted)';
COMMENT ON COLUMN external_sip_trunks.provider_space_url IS 'SignalWire space URL (e.g., example.signalwire.com)';
