-- Custom Functions Schema
-- Allows users to define custom webhooks their AI agent can call during conversations

CREATE TABLE IF NOT EXISTS custom_functions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agent_configs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Identity
  name TEXT NOT NULL,  -- snake_case, e.g., "check_order_status"
  description TEXT NOT NULL,  -- LLM uses this to decide when to call

  -- HTTP config
  http_method TEXT NOT NULL CHECK (http_method IN ('GET', 'POST', 'PATCH', 'PUT', 'DELETE')),
  endpoint_url TEXT NOT NULL,
  headers JSONB DEFAULT '[]'::jsonb,  -- [{name, value, is_dynamic}]
  query_params JSONB DEFAULT '[]'::jsonb,  -- for GET requests
  body_schema JSONB DEFAULT '[]'::jsonb,  -- [{name, type, description, required}]
  response_variables JSONB DEFAULT '[]'::jsonb,  -- [{name, json_path}]

  -- Settings
  timeout_ms INTEGER DEFAULT 120000,
  max_retries INTEGER DEFAULT 2,
  is_active BOOLEAN DEFAULT true,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_function_name_per_agent UNIQUE (agent_id, name)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_custom_functions_agent_id ON custom_functions(agent_id);
CREATE INDEX IF NOT EXISTS idx_custom_functions_user_id ON custom_functions(user_id);
CREATE INDEX IF NOT EXISTS idx_custom_functions_is_active ON custom_functions(is_active);

-- Enable RLS
ALTER TABLE custom_functions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for custom_functions
DROP POLICY IF EXISTS "Users can view their own custom functions" ON custom_functions;
CREATE POLICY "Users can view their own custom functions"
  ON custom_functions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert their own custom functions" ON custom_functions;
CREATE POLICY "Users can insert their own custom functions"
  ON custom_functions FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update their own custom functions" ON custom_functions;
CREATE POLICY "Users can update their own custom functions"
  ON custom_functions FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete their own custom functions" ON custom_functions;
CREATE POLICY "Users can delete their own custom functions"
  ON custom_functions FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Service role needs full access for Edge Functions and LiveKit agent
DROP POLICY IF EXISTS "Service role has full access to custom_functions" ON custom_functions;
CREATE POLICY "Service role has full access to custom_functions"
  ON custom_functions FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Updated_at trigger
DROP TRIGGER IF EXISTS update_custom_functions_updated_at ON custom_functions;
CREATE TRIGGER update_custom_functions_updated_at
  BEFORE UPDATE ON custom_functions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE custom_functions IS 'User-defined webhook functions that AI agents can call during conversations';
COMMENT ON COLUMN custom_functions.name IS 'Function name in snake_case (e.g., check_order_status)';
COMMENT ON COLUMN custom_functions.description IS 'Description used by LLM to decide when to call this function';
COMMENT ON COLUMN custom_functions.headers IS 'HTTP headers as array of {name, value, is_dynamic} objects';
COMMENT ON COLUMN custom_functions.body_schema IS 'Request body parameters as array of {name, type, description, required} objects';
COMMENT ON COLUMN custom_functions.response_variables IS 'Variables to extract from response as array of {name, json_path} objects';
