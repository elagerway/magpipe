-- Fix call_records schema to match application code
-- The webhook code uses contact_phone, call_sid, service_number, duration_seconds, status
-- but the original migration used caller_number, disposition

-- Add missing columns if they don't exist
ALTER TABLE call_records
ADD COLUMN IF NOT EXISTS contact_phone TEXT,
ADD COLUMN IF NOT EXISTS call_sid TEXT,
ADD COLUMN IF NOT EXISTS service_number TEXT,
ADD COLUMN IF NOT EXISTS duration_seconds INTEGER CHECK (duration_seconds >= 0),
ADD COLUMN IF NOT EXISTS status TEXT;

-- Copy data from old columns to new columns if old columns exist and new ones are empty
DO $$
BEGIN
  -- Check if caller_number column exists and copy to contact_phone
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'call_records' AND column_name = 'caller_number'
  ) THEN
    UPDATE call_records
    SET contact_phone = caller_number
    WHERE contact_phone IS NULL AND caller_number IS NOT NULL;
  END IF;

  -- Check if duration column exists and copy to duration_seconds
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'call_records' AND column_name = 'duration'
  ) THEN
    UPDATE call_records
    SET duration_seconds = duration
    WHERE duration_seconds IS NULL AND duration IS NOT NULL;
  END IF;
END $$;

-- Add indexes for the new columns
CREATE INDEX IF NOT EXISTS idx_call_records_contact_phone ON call_records(contact_phone);
CREATE INDEX IF NOT EXISTS idx_call_records_call_sid ON call_records(call_sid);
CREATE INDEX IF NOT EXISTS idx_call_records_service_number ON call_records(service_number);

-- Add comments
COMMENT ON COLUMN call_records.contact_phone IS 'Phone number of the contact (caller or recipient)';
COMMENT ON COLUMN call_records.call_sid IS 'SignalWire CallSid for this call';
COMMENT ON COLUMN call_records.service_number IS 'Service phone number used for this call';
COMMENT ON COLUMN call_records.duration_seconds IS 'Call duration in seconds';