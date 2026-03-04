-- Add translation support columns
ALTER TABLE agent_configs ADD COLUMN IF NOT EXISTS translate_to TEXT DEFAULT NULL;
ALTER TABLE sms_messages ADD COLUMN IF NOT EXISTS translation TEXT;
ALTER TABLE call_records ADD COLUMN IF NOT EXISTS translated_transcript TEXT;
