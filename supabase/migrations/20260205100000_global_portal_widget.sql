-- Create global portal widget for Magpipe platform
-- This widget is linked to the global agent and serves as the default chat widget for all users

-- Add is_global flag to chat_widgets to identify the platform-wide widget
ALTER TABLE chat_widgets ADD COLUMN IF NOT EXISTS is_global BOOLEAN DEFAULT false;

-- Ensure only one global widget exists (enforced by unique partial index)
CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_widgets_global
ON chat_widgets (is_global) WHERE is_global = true;

-- Add RLS policy so everyone can read the global widget
DROP POLICY IF EXISTS "Anyone can read global widget" ON chat_widgets;
CREATE POLICY "Anyone can read global widget" ON chat_widgets
  FOR SELECT USING (is_global = true);

-- Create the global portal widget (linked to the global agent)
-- This runs as a DO block to handle the case where global agent may or may not exist
DO $$
DECLARE
  v_global_agent_id UUID;
  v_global_agent_user_id UUID;
BEGIN
  -- Get the global agent's ID and owner
  SELECT id, user_id INTO v_global_agent_id, v_global_agent_user_id
  FROM agent_configs
  WHERE is_global = true
  LIMIT 1;

  -- Only create widget if global agent exists and no global widget exists yet
  IF v_global_agent_id IS NOT NULL THEN
    INSERT INTO chat_widgets (
      user_id,
      agent_id,
      name,
      primary_color,
      position,
      offset_x,
      offset_y,
      welcome_message,
      is_active,
      is_portal_widget,
      is_global,
      is_support_agent,
      collect_visitor_name,
      collect_visitor_email
    )
    SELECT
      v_global_agent_user_id,
      v_global_agent_id,
      'Magpipe Support',
      '#6366f1',
      'bottom-right',
      20,
      20,
      'Hi! I''m the Magpipe assistant. How can I help you today?',
      true,
      true,
      true,
      true,
      false,
      false
    WHERE NOT EXISTS (
      SELECT 1 FROM chat_widgets WHERE is_global = true
    );

    RAISE NOTICE 'Global portal widget created successfully';
  ELSE
    RAISE NOTICE 'No global agent found - global widget not created';
  END IF;
END $$;

COMMENT ON COLUMN chat_widgets.is_global IS 'If true, this is the global Magpipe platform widget available to all users as default';
