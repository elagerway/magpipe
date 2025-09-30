-- Add retell_call_id column to easily identify and query calls from Retell
ALTER TABLE call_records
ADD COLUMN IF NOT EXISTS retell_call_id TEXT;

-- Add unique constraint to prevent duplicate call processing
CREATE UNIQUE INDEX IF NOT EXISTS idx_call_records_retell_call_id ON call_records (retell_call_id) WHERE retell_call_id IS NOT NULL;

-- Add comment
COMMENT ON COLUMN call_records.retell_call_id IS 'Retell AI call identifier (e.g., call_abc123...)';