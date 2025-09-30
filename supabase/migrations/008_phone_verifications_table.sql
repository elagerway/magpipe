-- Create phone_verifications table for temporary storage of verification codes
CREATE TABLE IF NOT EXISTS phone_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL,
  code TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for fast lookups
CREATE INDEX idx_phone_verifications_user_phone ON phone_verifications(user_id, phone_number);
CREATE INDEX idx_phone_verifications_expires_at ON phone_verifications(expires_at);

-- Enable RLS
ALTER TABLE phone_verifications ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only access their own verification records
CREATE POLICY "Users can view own verifications"
  ON phone_verifications
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Add trigger for updated_at
CREATE TRIGGER phone_verifications_updated_at
  BEFORE UPDATE ON phone_verifications
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Cleanup job: Delete expired verifications (run periodically)
-- This can be set up as a cron job in Supabase
COMMENT ON TABLE phone_verifications IS 'Temporary storage for phone verification codes. Codes expire after 10 minutes.';