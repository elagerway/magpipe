-- Clear AI pause states so AI can respond immediately
UPDATE conversation_contexts
SET ai_paused_until = NULL
WHERE ai_paused_until IS NOT NULL;