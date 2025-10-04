-- Switch a user to LiveKit stack
-- Replace 'your-email@example.com' with the actual user email

UPDATE agent_configs
SET
  active_voice_stack = 'livekit',
  updated_at = now()
WHERE user_id = (
  SELECT id
  FROM auth.users
  LIMIT 1
);

-- Verify the change
SELECT
  u.email,
  ac.active_voice_stack,
  ac.retell_agent_id,
  ac.voice_id
FROM agent_configs ac
JOIN auth.users u ON u.id = ac.user_id
LIMIT 5;
