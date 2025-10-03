-- Migrate existing cloned voices from agent_configs to voices table
INSERT INTO public.voices (user_id, voice_id, voice_name, is_cloned)
SELECT
  user_id,
  cloned_voice_id,
  COALESCE(cloned_voice_name, 'Cloned Voice'),
  true
FROM public.agent_configs
WHERE cloned_voice_id IS NOT NULL
ON CONFLICT DO NOTHING;
