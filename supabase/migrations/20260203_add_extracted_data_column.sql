-- Add extracted_data column to call_records for dynamic variable extraction
ALTER TABLE call_records ADD COLUMN IF NOT EXISTS extracted_data JSONB DEFAULT '{}'::jsonb;

-- Add comment
COMMENT ON COLUMN call_records.extracted_data IS 'Structured data extracted from call transcript based on dynamic variable definitions';
