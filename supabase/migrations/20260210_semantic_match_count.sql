-- Add semantic_match_count to track how often a memory is surfaced as semantic context
ALTER TABLE conversation_contexts
  ADD COLUMN IF NOT EXISTS semantic_match_count INTEGER DEFAULT 0;

-- Single-row increment (used by Python voice agent)
CREATE OR REPLACE FUNCTION increment_semantic_match_count(memory_id UUID)
RETURNS void LANGUAGE sql AS $$
  UPDATE conversation_contexts
  SET semantic_match_count = COALESCE(semantic_match_count, 0) + 1
  WHERE id = memory_id;
$$;

-- Batch increment (used by SMS webhook)
CREATE OR REPLACE FUNCTION increment_semantic_match_count_batch(memory_ids UUID[])
RETURNS void LANGUAGE sql AS $$
  UPDATE conversation_contexts
  SET semantic_match_count = COALESCE(semantic_match_count, 0) + 1
  WHERE id = ANY(memory_ids);
$$;
