-- Enable pgvector extension for vector similarity search
CREATE EXTENSION IF NOT EXISTS vector;

-- Create conversation_contexts table for storing conversation memory and context
CREATE TABLE IF NOT EXISTS public.conversation_contexts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID UNIQUE NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  summary TEXT NOT NULL CHECK (length(trim(summary)) > 0),
  key_topics TEXT[] DEFAULT '{}',
  preferences JSONB DEFAULT '{}'::jsonb,
  relationship_notes TEXT,
  embedding vector(1536), -- OpenAI ada-002 embedding dimension
  interaction_count INTEGER DEFAULT 0 CHECK (interaction_count >= 0),
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_conversation_contexts_contact_id ON public.conversation_contexts(contact_id);

-- Vector index for semantic similarity search (HNSW is faster than IVFFlat for most use cases)
CREATE INDEX IF NOT EXISTS idx_conversation_contexts_embedding ON public.conversation_contexts
USING hnsw (embedding vector_cosine_ops);

-- Enable Row Level Security
ALTER TABLE public.conversation_contexts ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only access conversation contexts for their own contacts
CREATE POLICY "Users can view own conversation contexts"
  ON public.conversation_contexts
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.contacts
      WHERE contacts.id = conversation_contexts.contact_id
      AND contacts.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert conversation contexts for own contacts"
  ON public.conversation_contexts
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.contacts
      WHERE contacts.id = conversation_contexts.contact_id
      AND contacts.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update conversation contexts for own contacts"
  ON public.conversation_contexts
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.contacts
      WHERE contacts.id = conversation_contexts.contact_id
      AND contacts.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete conversation contexts for own contacts"
  ON public.conversation_contexts
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.contacts
      WHERE contacts.id = conversation_contexts.contact_id
      AND contacts.user_id = auth.uid()
    )
  );

-- Comments
COMMENT ON TABLE public.conversation_contexts IS 'Conversation memory and context for AI interactions with contacts';
COMMENT ON COLUMN public.conversation_contexts.summary IS 'High-level summary of relationship and past interactions';
COMMENT ON COLUMN public.conversation_contexts.key_topics IS 'Array of main discussion topics';
COMMENT ON COLUMN public.conversation_contexts.preferences IS 'JSON object storing contact preferences and important notes';
COMMENT ON COLUMN public.conversation_contexts.embedding IS 'Vector embedding of summary for semantic search (OpenAI ada-002 1536 dimensions)';
COMMENT ON COLUMN public.conversation_contexts.interaction_count IS 'Total number of calls + SMS with this contact';