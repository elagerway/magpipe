-- Add purpose and goal columns to call_records for outbound call context
-- These store the user's stated reason for making the call

ALTER TABLE call_records
  ADD COLUMN IF NOT EXISTS call_purpose TEXT,
  ADD COLUMN IF NOT EXISTS call_goal TEXT,
  ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES outbound_call_templates(id) ON DELETE SET NULL;

-- Add comment for clarity
COMMENT ON COLUMN call_records.call_purpose IS 'Purpose of outbound call (e.g., follow up on inquiry)';
COMMENT ON COLUMN call_records.call_goal IS 'Goal of outbound call (e.g., schedule appointment)';
COMMENT ON COLUMN call_records.template_id IS 'Reference to outbound_call_templates if template was used';
