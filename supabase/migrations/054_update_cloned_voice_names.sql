-- Update cloned voice names to use user's first name instead of email
UPDATE public.voices v
SET voice_name = SPLIT_PART(u.name, ' ', 1) || '''s Voice'
FROM public.users u
WHERE v.user_id = u.id
  AND v.is_cloned = true
  AND v.voice_name LIKE '%@%'; -- Only update email-based names
