-- Use the SIP subdomain as realm (both realm and websocket should use erik-0f619b8e956e.sip.signalwire.com)
UPDATE public.users
SET
  sip_realm = 'erik-0f619b8e956e.sip.signalwire.com',
  sip_ws_server = 'wss://erik-0f619b8e956e.sip.signalwire.com'
WHERE email = 'erik@snapsonic.com';
