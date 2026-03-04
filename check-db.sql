-- Check if there are any agent configs
SELECT user_id, active_voice_stack FROM agent_configs LIMIT 1;

-- Check if there are any users
SELECT id, email FROM auth.users LIMIT 1;
