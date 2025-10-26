-- Move SIP endpoint credentials from service_numbers to user level
-- Each user gets ONE SIP endpoint that can be used with any of their service numbers

-- Add SIP columns to users table
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS sip_endpoint_id TEXT,
  ADD COLUMN IF NOT EXISTS sip_username TEXT,
  ADD COLUMN IF NOT EXISTS sip_password TEXT,
  ADD COLUMN IF NOT EXISTS sip_realm TEXT,
  ADD COLUMN IF NOT EXISTS sip_ws_server TEXT;

-- Create index for SIP endpoint lookups
CREATE INDEX IF NOT EXISTS idx_users_sip_endpoint ON public.users(sip_endpoint_id) WHERE sip_endpoint_id IS NOT NULL;

-- Migrate existing SIP credentials from service_numbers to users
-- Take the first SIP endpoint found for each user (if any)
UPDATE public.users u
SET
  sip_endpoint_id = sn.sip_endpoint_id,
  sip_username = sn.sip_username,
  sip_password = sn.sip_password,
  sip_realm = sn.sip_realm,
  sip_ws_server = sn.sip_ws_server
FROM (
  SELECT DISTINCT ON (user_id)
    user_id,
    sip_endpoint_id,
    sip_username,
    sip_password,
    sip_realm,
    sip_ws_server
  FROM public.service_numbers
  WHERE sip_endpoint_id IS NOT NULL
  ORDER BY user_id, purchased_at DESC
) sn
WHERE u.id = sn.user_id;

-- Remove SIP columns from service_numbers (no longer needed per number)
ALTER TABLE public.service_numbers
  DROP COLUMN IF EXISTS sip_endpoint_id,
  DROP COLUMN IF EXISTS sip_username,
  DROP COLUMN IF EXISTS sip_password,
  DROP COLUMN IF EXISTS sip_realm,
  DROP COLUMN IF EXISTS sip_ws_server;

-- Drop the index we created earlier
DROP INDEX IF EXISTS public.idx_service_numbers_sip_endpoint;
