-- Fix WebSocket server URL for existing SIP endpoints
-- SignalWire requires :443 port in the WebSocket URL

UPDATE public.users
SET sip_ws_server = sip_realm || ':443'
WHERE sip_ws_server IS NOT NULL
  AND sip_ws_server NOT LIKE '%:443';

-- Update to use wss:// protocol with port
UPDATE public.users
SET sip_ws_server = 'wss://' || sip_realm || ':443'
WHERE sip_ws_server IS NOT NULL
  AND sip_ws_server NOT LIKE 'wss://%';
