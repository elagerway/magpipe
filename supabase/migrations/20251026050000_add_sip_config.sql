-- Add SIP endpoint credentials to service_numbers table
ALTER TABLE public.service_numbers
  ADD COLUMN IF NOT EXISTS sip_endpoint_id TEXT,
  ADD COLUMN IF NOT EXISTS sip_username TEXT,
  ADD COLUMN IF NOT EXISTS sip_password TEXT,
  ADD COLUMN IF NOT EXISTS sip_realm TEXT DEFAULT 'signalwire.com',
  ADD COLUMN IF NOT EXISTS sip_ws_server TEXT DEFAULT 'wss://relay.signalwire.com';

-- Add index for SIP endpoint lookups
CREATE INDEX IF NOT EXISTS idx_service_numbers_sip_endpoint ON public.service_numbers(sip_endpoint_id) WHERE sip_endpoint_id IS NOT NULL;
