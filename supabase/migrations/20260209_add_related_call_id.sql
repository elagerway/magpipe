-- Add related_call_id to link transfer legs to original call
ALTER TABLE call_records ADD COLUMN IF NOT EXISTS related_call_id UUID REFERENCES call_records(id);

-- Index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_call_records_related_call_id ON call_records(related_call_id);

-- Comment for documentation
COMMENT ON COLUMN call_records.related_call_id IS 'Links transfer legs and related calls to the original call record';
