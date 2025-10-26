-- Temporarily update SIP credentials with test endpoint for debugging
UPDATE public.users
SET
  sip_endpoint_id = '3ad1a7b4-c01c-4abd-9b54-74e7339f202e',
  sip_username = 'test_sip_endpoint',
  sip_password = 'TestPassword123!',
  sip_realm = 'erik.sip.signalwire.com',
  sip_ws_server = 'wss://erik.sip.signalwire.com'
WHERE email = 'erik@snapsonic.com';
