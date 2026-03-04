-- SMS Templates table for storing reusable message templates
CREATE TABLE IF NOT EXISTS sms_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE sms_templates ENABLE ROW LEVEL SECURITY;

-- Policy: Users can manage their own templates
CREATE POLICY "Users can manage own templates" ON sms_templates
  FOR ALL USING (auth.uid() = user_id);

-- Add comment
COMMENT ON TABLE sms_templates IS 'Stores reusable SMS message templates for agents';
