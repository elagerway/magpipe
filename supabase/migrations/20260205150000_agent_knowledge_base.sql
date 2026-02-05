-- Migration: Link Knowledge Base to Agents
-- Created: 2026-02-05
-- Description: Allows agents to reference a knowledge base for context

-- Add knowledge_source_id to agent_configs
ALTER TABLE agent_configs ADD COLUMN IF NOT EXISTS knowledge_source_id UUID REFERENCES knowledge_sources(id) ON DELETE SET NULL;

COMMENT ON COLUMN agent_configs.knowledge_source_id IS 'Optional knowledge base for agent to reference when responding';

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_agent_configs_knowledge_source ON agent_configs(knowledge_source_id) WHERE knowledge_source_id IS NOT NULL;
