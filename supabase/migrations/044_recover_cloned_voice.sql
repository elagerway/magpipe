-- Recover previously cloned voice ID
UPDATE agent_configs
SET
  cloned_voice_id = 'DK4MGseQn9Gb6a59KZL0',
  cloned_voice_name = 'Cloned Voice 1',
  voice_id = '11labs-DK4MGseQn9Gb6a59KZL0'
WHERE user_id = '5f6b02d9-ad4d-43d5-a580-8a1bf9625049';
