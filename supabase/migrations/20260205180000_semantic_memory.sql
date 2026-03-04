-- Migration: Semantic Memory Feature
-- Enables agents to find similar past conversations across all callers

-- Add semantic_memory_enabled toggle to agent_configs
ALTER TABLE agent_configs ADD COLUMN IF NOT EXISTS semantic_memory_enabled BOOLEAN DEFAULT false;

-- Add semantic memory config options
ALTER TABLE agent_configs ADD COLUMN IF NOT EXISTS semantic_memory_config JSONB DEFAULT '{
  "max_results": 3,
  "similarity_threshold": 0.75,
  "include_other_callers": true
}'::jsonb;

-- Create function for semantic similarity search using pgvector
CREATE OR REPLACE FUNCTION match_similar_memories(
  query_embedding vector(1536),
  match_agent_id UUID,
  match_user_id UUID,
  exclude_contact_id UUID DEFAULT NULL,
  match_threshold FLOAT DEFAULT 0.75,
  match_count INT DEFAULT 3
)
RETURNS TABLE (
  id UUID,
  contact_id UUID,
  contact_name TEXT,
  contact_phone TEXT,
  summary TEXT,
  key_topics TEXT[],
  interaction_count INT,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    cc.id,
    cc.contact_id,
    c.name as contact_name,
    c.phone_number as contact_phone,
    cc.summary,
    cc.key_topics,
    cc.interaction_count,
    1 - (cc.embedding <=> query_embedding) as similarity
  FROM conversation_contexts cc
  JOIN contacts c ON c.id = cc.contact_id
  WHERE cc.agent_id = match_agent_id
    AND c.user_id = match_user_id
    AND cc.embedding IS NOT NULL
    AND (exclude_contact_id IS NULL OR cc.contact_id != exclude_contact_id)
    AND 1 - (cc.embedding <=> query_embedding) > match_threshold
  ORDER BY cc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Create index for faster vector similarity search on agent_id filtered queries
CREATE INDEX IF NOT EXISTS idx_conversation_contexts_agent_embedding
ON conversation_contexts(agent_id)
WHERE embedding IS NOT NULL;

-- Comments
COMMENT ON COLUMN agent_configs.semantic_memory_enabled IS 'Whether the agent uses semantic search to find similar past conversations';
COMMENT ON COLUMN agent_configs.semantic_memory_config IS 'Configuration for semantic memory (max_results, similarity_threshold, include_other_callers)';
COMMENT ON FUNCTION match_similar_memories IS 'Find similar conversation memories using vector cosine similarity';
