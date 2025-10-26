-- Revert to base domain as realm (this gave "Not Found" which is better than "Authentication Error")
UPDATE public.users
SET
  sip_realm = 'erik.signalwire.com',
  sip_ws_server = 'wss://erik-0f619b8e956e.sip.signalwire.com'
WHERE email = 'erik@snapsonic.com';
