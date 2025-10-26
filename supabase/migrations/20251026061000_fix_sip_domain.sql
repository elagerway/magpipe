-- Fix SIP WebSocket URL to use correct SignalWire SIP subdomain
-- Correct format: wss://your-space.sip.signalwire.com (not wss://your-space.signalwire.com:443)

UPDATE public.users
SET
  sip_ws_server = REPLACE(sip_ws_server, 'wss://erik.signalwire.com:443', 'wss://erik.sip.signalwire.com'),
  sip_realm = 'erik.sip.signalwire.com'
WHERE sip_ws_server IS NOT NULL;
