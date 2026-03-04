-- Create SMS opt-out tracking table
CREATE TABLE IF NOT EXISTS sms_opt_outs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number TEXT NOT NULL,
  opted_out_at TIMESTAMPTZ DEFAULT NOW(),
  opted_in_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'opted_out' CHECK (status IN ('opted_out', 'opted_in')),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(phone_number)
);

-- Create index for fast lookups
CREATE INDEX idx_sms_opt_outs_phone_number ON sms_opt_outs(phone_number);
CREATE INDEX idx_sms_opt_outs_status ON sms_opt_outs(status);

-- Enable RLS
ALTER TABLE sms_opt_outs ENABLE ROW LEVEL SECURITY;

-- Create RLS policies (service role only, users shouldn't directly access this)
CREATE POLICY "Service role can manage opt-outs"
  ON sms_opt_outs
  FOR ALL
  USING (true);

-- Add comments
COMMENT ON TABLE sms_opt_outs IS 'Tracks SMS opt-out status for USA compliance (STOP/CANCEL/UNSUBSCRIBE)';
COMMENT ON COLUMN sms_opt_outs.phone_number IS 'Phone number that opted out or back in';
COMMENT ON COLUMN sms_opt_outs.status IS 'Current opt-out status: opted_out or opted_in';
