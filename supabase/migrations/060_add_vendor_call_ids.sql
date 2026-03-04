-- Add vendor-specific call ID tracking to support multiple telephony providers
-- This allows matching calls from different vendors (SignalWire, Twilio, Vonage, etc.)
-- and voice platforms (LiveKit, Retell, etc.) to the same call record

ALTER TABLE public.call_records
  -- Vendor call ID from telephony provider (SignalWire, Twilio, etc.)
  ADD COLUMN vendor_call_id TEXT,

  -- Voice platform call ID (LiveKit SIP callID, Retell callID, etc.)
  ADD COLUMN voice_platform_call_id TEXT,

  -- Track which telephony vendor originated the call
  ADD COLUMN telephony_vendor TEXT DEFAULT 'signalwire' CHECK (telephony_vendor IN ('signalwire', 'twilio', 'vonage', 'bandwidth')),

  -- Track which voice AI platform handled the call
  ADD COLUMN voice_platform TEXT DEFAULT 'livekit' CHECK (voice_platform IN ('livekit', 'retell'));

-- Create indexes for fast lookups by either call ID type
CREATE INDEX IF NOT EXISTS idx_call_records_vendor_call_id
  ON public.call_records(vendor_call_id)
  WHERE vendor_call_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_call_records_voice_platform_call_id
  ON public.call_records(voice_platform_call_id)
  WHERE voice_platform_call_id IS NOT NULL;

-- Migrate existing call_sid values to vendor_call_id
-- Existing records are from SignalWire, so set telephony_vendor accordingly
UPDATE public.call_records
SET
  vendor_call_id = call_sid,
  telephony_vendor = 'signalwire',
  voice_platform = 'livekit'
WHERE call_sid IS NOT NULL;

-- Add comments
COMMENT ON COLUMN public.call_records.vendor_call_id IS 'Call ID from telephony provider (SignalWire CallSid, Twilio CallSid, etc.)';
COMMENT ON COLUMN public.call_records.voice_platform_call_id IS 'Call ID from voice AI platform (LiveKit SIP callID, Retell callID, etc.)';
COMMENT ON COLUMN public.call_records.telephony_vendor IS 'Which telephony provider originated the call';
COMMENT ON COLUMN public.call_records.voice_platform IS 'Which voice AI platform handled the call';

-- Note: Keeping call_sid column for backward compatibility
-- It can be deprecated in a future migration once all code is updated
COMMENT ON COLUMN public.call_records.call_sid IS 'DEPRECATED: Use vendor_call_id instead. Kept for backward compatibility.';
