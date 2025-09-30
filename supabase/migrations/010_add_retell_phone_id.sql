-- Add retell_phone_id column to service_numbers table
ALTER TABLE service_numbers
ADD COLUMN IF NOT EXISTS retell_phone_id TEXT UNIQUE;

-- Create index for retell_phone_id
CREATE INDEX IF NOT EXISTS idx_service_numbers_retell_phone_id ON service_numbers(retell_phone_id) WHERE retell_phone_id IS NOT NULL;

-- Add comment
COMMENT ON COLUMN service_numbers.retell_phone_id IS 'Retell.ai phone ID for this number';