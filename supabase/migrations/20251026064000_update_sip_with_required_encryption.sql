-- Update user with SIP endpoint created with encryption: 'required'
UPDATE public.users
SET
  sip_endpoint_id = 'eb2b9df3-b5f3-4ce1-8b5a-b6095ebdbc5c',
  sip_username = 'pat_erik_secure',
  sip_password = 'SecureWebRTC2025!',
  sip_realm = 'erik.sip.signalwire.com',
  sip_ws_server = 'wss://erik.sip.signalwire.com'
WHERE email = 'erik@snapsonic.com';
