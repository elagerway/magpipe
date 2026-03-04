-- Add SIP credential fields to service_numbers table
ALTER TABLE service_numbers
ADD COLUMN IF NOT EXISTS sip_username VARCHAR(255),
ADD COLUMN IF NOT EXISTS sip_password VARCHAR(255),
ADD COLUMN IF NOT EXISTS sip_domain VARCHAR(255) DEFAULT 'erik.signalwire.com',
ADD COLUMN IF NOT EXISTS sip_ws_server VARCHAR(255) DEFAULT 'wss://erik.signalwire.com:7443';

-- Add comment
COMMENT ON COLUMN service_numbers.sip_username IS 'SIP username for WebRTC calling';
COMMENT ON COLUMN service_numbers.sip_password IS 'SIP password (should be encrypted in production)';
COMMENT ON COLUMN service_numbers.sip_domain IS 'SIP domain (SignalWire space)';
COMMENT ON COLUMN service_numbers.sip_ws_server IS 'WebSocket server for SIP over WebRTC';
