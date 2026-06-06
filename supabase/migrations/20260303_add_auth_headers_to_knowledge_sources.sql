-- Add auth_headers column to knowledge_sources for authenticated crawling
ALTER TABLE knowledge_sources ADD COLUMN IF NOT EXISTS auth_headers jsonb;
COMMENT ON COLUMN knowledge_sources.auth_headers IS 'Auth headers for authenticated crawling (Bearer/Basic). Protected by existing RLS policies.';
