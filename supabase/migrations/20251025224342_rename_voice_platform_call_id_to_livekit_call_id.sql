-- Rename voice_platform_call_id to livekit_call_id for clarity
-- This makes it explicit that this column stores the LiveKit-specific call ID

-- Rename the column
ALTER TABLE public.call_records
  RENAME COLUMN voice_platform_call_id TO livekit_call_id;

-- Rename the index
DROP INDEX IF EXISTS idx_call_records_voice_platform_call_id;
CREATE INDEX IF NOT EXISTS idx_call_records_livekit_call_id
  ON public.call_records(livekit_call_id)
  WHERE livekit_call_id IS NOT NULL;

-- Update comment
COMMENT ON COLUMN public.call_records.livekit_call_id IS 'LiveKit SIP call ID or room identifier';
