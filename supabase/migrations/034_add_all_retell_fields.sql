-- Add all Retell call fields as proper columns for easier querying and display

-- Call status and timestamps
ALTER TABLE call_records ADD COLUMN IF NOT EXISTS call_type TEXT;
ALTER TABLE call_records ADD COLUMN IF NOT EXISTS disconnection_reason TEXT;
ALTER TABLE call_records ADD COLUMN IF NOT EXISTS call_successful BOOLEAN;
ALTER TABLE call_records ADD COLUMN IF NOT EXISTS in_voicemail BOOLEAN;

-- Transcript data
ALTER TABLE call_records ADD COLUMN IF NOT EXISTS transcript_object JSONB;
ALTER TABLE call_records ADD COLUMN IF NOT EXISTS transcript_with_tool_calls JSONB;

-- Recording URLs
ALTER TABLE call_records ADD COLUMN IF NOT EXISTS recording_url_multichannel TEXT;

-- Analysis data
ALTER TABLE call_records ADD COLUMN IF NOT EXISTS call_summary TEXT;
ALTER TABLE call_records ADD COLUMN IF NOT EXISTS call_analysis_full JSONB;

-- Performance metrics
ALTER TABLE call_records ADD COLUMN IF NOT EXISTS llm_latency_p50 INTEGER;
ALTER TABLE call_records ADD COLUMN IF NOT EXISTS llm_latency_p90 INTEGER;
ALTER TABLE call_records ADD COLUMN IF NOT EXISTS llm_latency_p99 INTEGER;
ALTER TABLE call_records ADD COLUMN IF NOT EXISTS e2e_latency_p50 INTEGER;
ALTER TABLE call_records ADD COLUMN IF NOT EXISTS e2e_latency_p90 INTEGER;
ALTER TABLE call_records ADD COLUMN IF NOT EXISTS e2e_latency_p99 INTEGER;

-- Cost tracking
ALTER TABLE call_records ADD COLUMN IF NOT EXISTS call_cost_total DECIMAL(10,4);
ALTER TABLE call_records ADD COLUMN IF NOT EXISTS call_cost_llm DECIMAL(10,4);
ALTER TABLE call_records ADD COLUMN IF NOT EXISTS call_cost_tts DECIMAL(10,4);
ALTER TABLE call_records ADD COLUMN IF NOT EXISTS call_cost_stt DECIMAL(10,4);
ALTER TABLE call_records ADD COLUMN IF NOT EXISTS call_cost_telephony DECIMAL(10,4);

-- Agent info
ALTER TABLE call_records ADD COLUMN IF NOT EXISTS agent_id TEXT;

-- Add comments
COMMENT ON COLUMN call_records.transcript_object IS 'Full transcript array with word-level timing from Retell';
COMMENT ON COLUMN call_records.call_summary IS 'AI-generated summary from Retell call analysis';
COMMENT ON COLUMN call_records.call_cost_total IS 'Total cost of the call in USD';
COMMENT ON COLUMN call_records.llm_latency_p50 IS 'P50 LLM latency in milliseconds';
COMMENT ON COLUMN call_records.e2e_latency_p50 IS 'P50 end-to-end latency in milliseconds';