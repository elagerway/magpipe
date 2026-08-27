-- Livelier voice defaults for new custom/cloned voices.
-- Lower stability = more emotional range; higher style = more expressive
-- (style is honored on Turbo/Multilingual models; on Flash it's a no-op).
-- Premade-voice agents (not stored in this table) pick up the matching
-- defaults from agent.py's get_voice_config fallback.
ALTER TABLE public.voices ALTER COLUMN stability SET DEFAULT 0.30;
ALTER TABLE public.voices ALTER COLUMN style SET DEFAULT 0.55;
