-- Create outbound_call_templates table for storing reusable call purposes/goals
CREATE TABLE IF NOT EXISTS outbound_call_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  purpose TEXT NOT NULL,
  goal TEXT NOT NULL,
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for efficient lookups by user
CREATE INDEX IF NOT EXISTS idx_outbound_templates_user
  ON outbound_call_templates(user_id, is_default DESC, name ASC);

-- Unique constraint on name per user
ALTER TABLE outbound_call_templates
  ADD CONSTRAINT unique_template_name_per_user UNIQUE (user_id, name);

-- Enable RLS
ALTER TABLE outbound_call_templates ENABLE ROW LEVEL SECURITY;

-- Users can only access their own templates
CREATE POLICY "Users can view their own templates"
  ON outbound_call_templates
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own templates"
  ON outbound_call_templates
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own templates"
  ON outbound_call_templates
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own templates"
  ON outbound_call_templates
  FOR DELETE
  USING (auth.uid() = user_id);

-- Service role has full access
CREATE POLICY "Service role has full access to templates"
  ON outbound_call_templates
  FOR ALL
  USING (auth.role() = 'service_role');
