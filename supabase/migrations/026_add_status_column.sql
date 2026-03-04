-- Add status column to call_records (missed in migration 024)
ALTER TABLE call_records
ADD COLUMN IF NOT EXISTS status TEXT;

COMMENT ON COLUMN call_records.status IS 'Call status (in-progress, completed, no-answer, failed, busy)';