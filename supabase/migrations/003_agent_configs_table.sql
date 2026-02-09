-- Create agent_configs table for user's Maggie AI configuration
CREATE TABLE IF NOT EXISTS public.agent_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  voice TEXT DEFAULT 'kate',
  greeting_template TEXT DEFAULT 'Welcome {name}, my name is Maggie and I am here to answer calls and texts sent to your number',
  vetting_criteria JSONB NOT NULL DEFAULT '{
    "allow_emergencies": true,
    "require_name": true,
    "require_reason": true,
    "auto_transfer_keywords": ["urgent", "emergency"],
    "auto_reject_keywords": ["spam", "sales"]
  }'::jsonb,
  transfer_preferences JSONB NOT NULL DEFAULT '{
    "always_transfer_whitelist": true,
    "transfer_on_request": true,
    "business_hours_only": false,
    "quiet_hours": {"start": "22:00", "end": "08:00"}
  }'::jsonb,
  response_style TEXT DEFAULT 'professional' CHECK (response_style IN ('professional', 'casual', 'friendly')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for user lookups
CREATE INDEX IF NOT EXISTS idx_agent_configs_user_id ON public.agent_configs(user_id);

-- Enable Row Level Security
ALTER TABLE public.agent_configs ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only access their own agent config
CREATE POLICY "Users can view own agent config"
  ON public.agent_configs
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own agent config"
  ON public.agent_configs
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own agent config"
  ON public.agent_configs
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own agent config"
  ON public.agent_configs
  FOR DELETE
  USING (auth.uid() = user_id);

-- Comments
COMMENT ON TABLE public.agent_configs IS 'User customization of Maggie AI agent behavior';
COMMENT ON COLUMN public.agent_configs.voice IS 'Voice identifier for text-to-speech (e.g., kate)';
COMMENT ON COLUMN public.agent_configs.vetting_criteria IS 'JSON rules for screening unknown callers';
COMMENT ON COLUMN public.agent_configs.transfer_preferences IS 'JSON rules for when to transfer calls';