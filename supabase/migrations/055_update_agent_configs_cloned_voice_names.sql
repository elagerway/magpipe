-- Update agent_configs cloned voice names to match voices table
UPDATE public.agent_configs ac
SET cloned_voice_name = SPLIT_PART(u.name, ' ', 1) || '''s Voice'
FROM public.users u
WHERE ac.user_id = u.id
  AND ac.cloned_voice_name LIKE '%@%'; -- Only update email-based names
