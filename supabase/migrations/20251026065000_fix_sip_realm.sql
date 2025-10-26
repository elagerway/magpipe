-- Fix SIP realm to use correct SignalWire subdomain
-- Correct format: erik-0f619b8e956e.sip.signalwire.com (not erik.sip.signalwire.com)

UPDATE public.users
SET
  sip_realm = 'erik-0f619b8e956e.sip.signalwire.com',
  sip_ws_server = 'wss://erik-0f619b8e956e.sip.signalwire.com'
WHERE email = 'erik@snapsonic.com';
