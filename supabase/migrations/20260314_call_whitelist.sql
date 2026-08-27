-- Call Whitelist: auto-forward inbound calls from specific numbers to a designated forwarding number.
-- Per-agent — each whitelist entry belongs to an agent and maps a caller number to a forward_to number.

CREATE TABLE call_whitelist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES agent_configs(id) ON DELETE CASCADE,
  caller_number TEXT NOT NULL,       -- E.164 number to match (e.g. +16047538839)
  forward_to TEXT NOT NULL,          -- E.164 number to forward the call to
  label TEXT,                        -- Optional friendly name (e.g. "Kyler's son")
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (agent_id, caller_number)   -- One forward rule per caller per agent
);

ALTER TABLE call_whitelist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own whitelist entries"
  ON call_whitelist FOR ALL
  USING (user_id = auth.uid());

-- Fast lookup during inbound call routing
CREATE INDEX call_whitelist_agent_caller_idx ON call_whitelist (agent_id, caller_number);
