-- Migration: match_knowledge_chunks_function
-- Created: 2026-02-05
-- Description: Creates function for vector similarity search on knowledge_chunks

-- Create function for knowledge base similarity search using pgvector
CREATE OR REPLACE FUNCTION match_knowledge_chunks(
  query_embedding vector(1536),
  source_ids UUID[],
  match_count INT DEFAULT 3,
  similarity_threshold FLOAT DEFAULT 0.5
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  metadata JSONB,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    kc.id,
    kc.content,
    kc.metadata,
    1 - (kc.embedding <=> query_embedding) as similarity
  FROM knowledge_chunks kc
  WHERE kc.knowledge_source_id = ANY(source_ids)
    AND kc.embedding IS NOT NULL
    AND 1 - (kc.embedding <=> query_embedding) > similarity_threshold
  ORDER BY kc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Add comment
COMMENT ON FUNCTION match_knowledge_chunks IS 'Find relevant knowledge chunks using vector cosine similarity search';

-- Create index for faster vector search if not exists
-- This uses HNSW which is faster for approximate nearest neighbor search
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_embedding_hnsw
ON knowledge_chunks USING hnsw (embedding vector_cosine_ops);
