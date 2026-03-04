-- Update user with new SIP endpoint with simpler password for testing
UPDATE public.users
SET
  sip_endpoint_id = 'ce27679d-ef6d-4016-be36-9a8178cd90c1',
  sip_username = 'pat_erik_final',
  sip_password = 'TestPass123',
  sip_realm = 'erik-0f619b8e956e.sip.signalwire.com',
  sip_ws_server = 'wss://erik-0f619b8e956e.sip.signalwire.com'
WHERE email = 'erik@snapsonic.com';
