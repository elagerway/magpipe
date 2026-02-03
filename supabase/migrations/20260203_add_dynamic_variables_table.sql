-- Dynamic Variables table for extracting structured data from conversations
CREATE TABLE IF NOT EXISTS dynamic_variables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES agent_configs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  var_type TEXT NOT NULL DEFAULT 'text',
  enum_options TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE dynamic_variables ENABLE ROW LEVEL SECURITY;

-- Policy: Users can manage their own variables
CREATE POLICY "Users can manage own dynamic variables" ON dynamic_variables
  FOR ALL USING (auth.uid() = user_id);

-- Add comment
COMMENT ON TABLE dynamic_variables IS 'Stores dynamic variable configurations for extracting structured data from calls';
