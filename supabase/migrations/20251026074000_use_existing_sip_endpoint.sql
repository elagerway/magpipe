-- Use the existing SIP endpoint from SignalWire dashboard
-- test_sip_endpoint@erik-0f619b8e956e.sip.signalwire.com
-- Note: You need to set the correct password from the SignalWire dashboard

UPDATE public.users
SET
  sip_username = 'test_sip_endpoint',
  sip_password = 'TestPassword123!',  -- Update this with actual password from dashboard
  sip_realm = 'erik-0f619b8e956e.sip.signalwire.com',
  sip_ws_server = 'wss://erik-0f619b8e956e.sip.signalwire.com'
WHERE email = 'erik@snapsonic.com';
