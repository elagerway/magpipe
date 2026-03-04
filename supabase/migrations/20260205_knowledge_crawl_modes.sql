-- Migration: Knowledge Base Crawl Modes
-- Feature: Sitemap & Recursive Crawling
-- Created: 2026-02-05
-- Description: Adds support for sitemap parsing and recursive link following for knowledge sources

-- ============================================================================
-- UPDATE: knowledge_sources table
-- Add columns for crawl configuration
-- ============================================================================

-- Crawl mode: single (default), sitemap, or recursive
ALTER TABLE knowledge_sources ADD COLUMN IF NOT EXISTS crawl_mode TEXT
  CHECK (crawl_mode IN ('single', 'sitemap', 'recursive')) DEFAULT 'single';

-- Maximum pages to crawl (applies to sitemap and recursive modes)
ALTER TABLE knowledge_sources ADD COLUMN IF NOT EXISTS max_pages INTEGER DEFAULT 100;

-- Maximum depth for recursive crawling (1 = only linked pages, 2 = links from linked pages, etc.)
ALTER TABLE knowledge_sources ADD COLUMN IF NOT EXISTS crawl_depth INTEGER DEFAULT 2;

-- Whether to respect robots.txt rules
ALTER TABLE knowledge_sources ADD COLUMN IF NOT EXISTS respect_robots_txt BOOLEAN DEFAULT TRUE;

COMMENT ON COLUMN knowledge_sources.crawl_mode IS 'Crawl mode: single (one page), sitemap (parse sitemap.xml), recursive (follow links)';
COMMENT ON COLUMN knowledge_sources.max_pages IS 'Maximum number of pages to crawl for sitemap/recursive modes (max 500)';
COMMENT ON COLUMN knowledge_sources.crawl_depth IS 'Maximum link depth for recursive crawling (1-5)';
COMMENT ON COLUMN knowledge_sources.respect_robots_txt IS 'Whether to check and respect robots.txt rules';

-- ============================================================================
-- TABLE: crawl_jobs
-- Purpose: Async queue for processing sitemap/recursive crawls
-- ============================================================================
CREATE TABLE IF NOT EXISTS crawl_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  knowledge_source_id UUID REFERENCES knowledge_sources(id) ON DELETE CASCADE NOT NULL,
  status TEXT CHECK (status IN ('pending', 'processing', 'completed', 'failed')) DEFAULT 'pending',

  -- Progress tracking
  pages_discovered INTEGER DEFAULT 0,
  pages_crawled INTEGER DEFAULT 0,
  pages_failed INTEGER DEFAULT 0,
  current_url TEXT,

  -- URL queue and deduplication (stored as JSON arrays)
  url_queue JSONB DEFAULT '[]'::jsonb,
  processed_urls JSONB DEFAULT '[]'::jsonb,

  -- Robots.txt rules cache (parsed rules for the domain)
  robots_rules JSONB DEFAULT '{}'::jsonb,

  -- Error tracking
  errors JSONB DEFAULT '[]'::jsonb,

  -- Timestamps
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE crawl_jobs IS 'Async queue for processing sitemap and recursive knowledge base crawls';
COMMENT ON COLUMN crawl_jobs.url_queue IS 'Array of {url, depth} objects to be processed';
COMMENT ON COLUMN crawl_jobs.processed_urls IS 'Array of URLs already processed (for deduplication)';
COMMENT ON COLUMN crawl_jobs.robots_rules IS 'Cached robots.txt rules: {disallow: [], allow: [], crawlDelay: number}';
COMMENT ON COLUMN crawl_jobs.errors IS 'Array of {url, error, timestamp} for failed URLs';

-- ============================================================================
-- INDEXES for crawl_jobs
-- ============================================================================

-- Index for finding active jobs to process
CREATE INDEX IF NOT EXISTS idx_crawl_jobs_active
  ON crawl_jobs(status)
  WHERE status IN ('pending', 'processing');

-- Index for looking up job by knowledge source
CREATE INDEX IF NOT EXISTS idx_crawl_jobs_source
  ON crawl_jobs(knowledge_source_id);

-- ============================================================================
-- ROW LEVEL SECURITY for crawl_jobs
-- ============================================================================

ALTER TABLE crawl_jobs ENABLE ROW LEVEL SECURITY;

-- Users can view crawl jobs for their own knowledge sources
CREATE POLICY "Users can view their own crawl jobs"
  ON crawl_jobs FOR SELECT
  USING (
    knowledge_source_id IN (
      SELECT id FROM knowledge_sources WHERE user_id = auth.uid()
    )
  );

-- Note: INSERT/UPDATE/DELETE for crawl_jobs managed by service role only

-- ============================================================================
-- Update knowledge_chunks metadata to track source URL for multi-page crawls
-- ============================================================================
COMMENT ON COLUMN knowledge_chunks.metadata IS 'Chunk metadata including source_url for multi-page crawls: {source_url: string, page_title: string}';
