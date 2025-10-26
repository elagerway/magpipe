-- Clear existing SIP endpoint to force recreation with correct encryption settings
-- The endpoint must be created with encryption: 'required' not 'optional'

UPDATE public.users
SET
  sip_endpoint_id = NULL,
  sip_username = NULL,
  sip_password = NULL,
  sip_realm = NULL,
  sip_ws_server = NULL
WHERE email = 'erik@snapsonic.com';
