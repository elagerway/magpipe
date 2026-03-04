-- Add metadata column to store complete webhook payloads from Retell
ALTER TABLE call_records
ADD COLUMN IF NOT EXISTS metadata JSONB;

-- Add index for JSONB queries
CREATE INDEX IF NOT EXISTS idx_call_records_metadata ON call_records USING GIN (metadata);

-- Add comment
COMMENT ON COLUMN call_records.metadata IS 'Complete webhook payload from Retell call_analyzed event including transcript_object, latency, costs, etc.';