-- Add attended flag to transfer_numbers
-- When false (default), transfers try LiveKit room bridging first (lowest latency)
-- When true, transfers use attended mode with whisper ceremony
ALTER TABLE transfer_numbers ADD COLUMN IF NOT EXISTS attended boolean DEFAULT false;
