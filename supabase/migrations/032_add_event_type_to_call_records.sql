-- Add event_type column to track which Retell events we've received
ALTER TABLE call_records
ADD COLUMN IF NOT EXISTS event_type TEXT;

-- Add index for querying by event type
CREATE INDEX IF NOT EXISTS idx_call_records_event_type ON call_records (event_type);

-- Add comment
COMMENT ON COLUMN call_records.event_type IS 'Latest Retell event type received for this call (e.g., call_started, call_ended, call_analyzed)';