-- Create system agent for unassigned phone numbers
-- Uses a fixed UUID so it can be referenced in code
-- Agent is owned by the god user (erik@snapsonic.com)

DO $$
DECLARE
  system_agent_id UUID := '00000000-0000-0000-0000-000000000002';
  god_user_id UUID;
BEGIN
  -- Get the god user (admin account that owns system resources)
  SELECT id INTO god_user_id FROM users WHERE role = 'god' LIMIT 1;

  IF god_user_id IS NULL THEN
    RAISE EXCEPTION 'No god user found - cannot create system agent';
  END IF;

  -- Create system agent for unassigned numbers
  INSERT INTO agent_configs (
    id,
    user_id,
    name,
    greeting,
    greeting_template,
    system_prompt,
    voice_id,
    llm_model,
    is_active,
    is_default,
    active_voice_stack,
    created_at,
    updated_at
  )
  VALUES (
    system_agent_id,
    god_user_id,
    'System - Not Assigned',
    'This number is not currently assigned. Go to Magpipe dot A I to assign your number.',
    'This number is not currently assigned. Go to Magpipe dot A I to assign your number.',
    'You are a system agent. Speak only the greeting message, then immediately hang up the call. Do not wait for a response. Do not engage in any conversation. After the greeting, use the end_call function right away.',
    '21m00Tcm4TlvDq8ikWAM',  -- Rachel voice (ElevenLabs)
    'gpt-4.1-nano',
    true,
    false,
    'livekit',
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    greeting = EXCLUDED.greeting,
    greeting_template = EXCLUDED.greeting_template,
    system_prompt = EXCLUDED.system_prompt,
    active_voice_stack = 'livekit',
    updated_at = NOW();

  -- Update all existing unassigned phone numbers to use the system agent
  -- and set them to active (they can receive calls, just route to system agent)
  UPDATE service_numbers
  SET
    agent_id = system_agent_id,
    is_active = true
  WHERE agent_id IS NULL;

END $$;

-- Add comment for documentation
COMMENT ON TABLE agent_configs IS 'Agent configurations. System agent ID 00000000-0000-0000-0000-000000000002 is used for unassigned numbers.';
