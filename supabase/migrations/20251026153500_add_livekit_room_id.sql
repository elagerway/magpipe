-- Add livekit_room_id column to track LiveKit room names for outbound calls
-- This is separate from livekit_call_id which stores the participant ID

ALTER TABLE public.call_records
  ADD COLUMN livekit_room_id TEXT;

-- Create index for fast room lookups
CREATE INDEX IF NOT EXISTS idx_call_records_livekit_room_id
  ON public.call_records(livekit_room_id)
  WHERE livekit_room_id IS NOT NULL;

-- Add comment
COMMENT ON COLUMN public.call_records.livekit_room_id IS 'LiveKit room name for this call session';
