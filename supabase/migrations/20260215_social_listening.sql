-- Social Listening: keyword monitoring for Reddit, HackerNews, Google
-- Part of LLMO strategy item #12

-- Editable keyword list
CREATE TABLE IF NOT EXISTS social_listening_keywords (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  keyword TEXT NOT NULL UNIQUE,
  category TEXT DEFAULT 'general',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Seed initial keywords from LLMO strategy
INSERT INTO social_listening_keywords (keyword, category) VALUES
  ('AI phone agent', 'core'),
  ('AI virtual receptionist', 'core'),
  ('AI receptionist', 'core'),
  ('Bland AI', 'competitor'),
  ('Synthflow', 'competitor'),
  ('Vapi AI', 'competitor'),
  ('Retell AI', 'competitor'),
  ('AI call center', 'use_case'),
  ('automated phone answering', 'use_case'),
  ('AI SMS agent', 'use_case'),
  ('Magpipe', 'brand'),
  ('magpipe.ai', 'brand')
ON CONFLICT (keyword) DO NOTHING;

-- Found mentions
CREATE TABLE IF NOT EXISTS social_listening_results (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  platform TEXT NOT NULL CHECK (platform IN ('reddit', 'hackernews', 'google')),
  external_id TEXT NOT NULL,
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  snippet TEXT,
  subreddit TEXT,
  author TEXT,
  score INTEGER,
  comment_count INTEGER,
  keyword_matched TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'seen', 'responded', 'archived')),
  found_at TIMESTAMPTZ DEFAULT now(),
  alerted_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(platform, external_id)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_slr_status ON social_listening_results(status);
CREATE INDEX IF NOT EXISTS idx_slr_platform ON social_listening_results(platform);
CREATE INDEX IF NOT EXISTS idx_slr_found_at ON social_listening_results(found_at DESC);
CREATE INDEX IF NOT EXISTS idx_slr_keyword ON social_listening_results(keyword_matched);

-- RLS: service_role only (no user-facing access)
ALTER TABLE social_listening_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_listening_keywords ENABLE ROW LEVEL SECURITY;

-- Service role has full access (edge functions use service role key)
-- No user-facing policies needed

-- Add social_listening notification columns to admin_notification_config
ALTER TABLE admin_notification_config
  ADD COLUMN IF NOT EXISTS social_listening_sms BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS social_listening_email BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS social_listening_slack BOOLEAN DEFAULT false;

-- pg_cron: run every 6 hours
SELECT cron.schedule(
  'social-listening-scan',
  '0 */6 * * *',
  $$SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/process-social-listening',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );$$
);
