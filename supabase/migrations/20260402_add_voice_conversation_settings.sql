-- Add missing voice + conversation settings columns to agent_configs
-- These were in the UI but never persisted because the columns didn't exist
ALTER TABLE public.agent_configs
ADD COLUMN IF NOT EXISTS speed NUMERIC(3,2) DEFAULT 1.0,
ADD COLUMN IF NOT EXISTS stability NUMERIC(3,2) DEFAULT 0.75,
ADD COLUMN IF NOT EXISTS backchannel_enabled BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS backchannel_words TEXT DEFAULT 'uh-huh, I see, okay',
ADD COLUMN IF NOT EXISTS backchannel_frequency NUMERIC(3,2) DEFAULT 0.2,
ADD COLUMN IF NOT EXISTS interrupt_sensitivity NUMERIC(3,2) DEFAULT 0.6,
ADD COLUMN IF NOT EXISTS responsiveness NUMERIC(3,2) DEFAULT 1.0,
ADD COLUMN IF NOT EXISTS idle_trigger NUMERIC(4,1) DEFAULT 2.0,
ADD COLUMN IF NOT EXISTS idle_reminders INTEGER DEFAULT 0;
