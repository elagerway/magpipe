-- Add termination_uri column to service_numbers table
ALTER TABLE service_numbers
ADD COLUMN IF NOT EXISTS termination_uri TEXT;

COMMENT ON COLUMN service_numbers.termination_uri IS 'SignalWire termination URI for this phone number (e.g., someuri.pstn.twilio.com)';