-- Try using base signalwire domain as realm (erik.signalwire.com instead of erik-xxx.sip.signalwire.com)
UPDATE public.users
SET
  sip_realm = 'erik.signalwire.com',
  sip_ws_server = 'wss://erik-0f619b8e956e.sip.signalwire.com'
WHERE email = 'erik@snapsonic.com';
