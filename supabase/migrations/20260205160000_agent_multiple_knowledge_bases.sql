-- Migration: Support Multiple Knowledge Bases per Agent
-- Created: 2026-02-05
-- Description: Changes from single KB to array of KBs per agent

-- Add knowledge_source_ids array column
ALTER TABLE agent_configs ADD COLUMN IF NOT EXISTS knowledge_source_ids UUID[] DEFAULT '{}';

-- Migrate existing data from knowledge_source_id to knowledge_source_ids
UPDATE agent_configs
SET knowledge_source_ids = ARRAY[knowledge_source_id]
WHERE knowledge_source_id IS NOT NULL
  AND (knowledge_source_ids IS NULL OR knowledge_source_ids = '{}');

-- Add comment
COMMENT ON COLUMN agent_configs.knowledge_source_ids IS 'Array of knowledge base IDs for agent to reference when responding';

-- Create GIN index for array lookups
CREATE INDEX IF NOT EXISTS idx_agent_configs_knowledge_source_ids ON agent_configs USING GIN(knowledge_source_ids) WHERE knowledge_source_ids != '{}';
