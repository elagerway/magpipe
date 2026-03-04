-- Add Twitter posting columns to blog_posts
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS tweeted_at TIMESTAMPTZ;
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS tweet_id TEXT;

-- Partial index for cron: find published posts not yet tweeted
CREATE INDEX IF NOT EXISTS idx_blog_posts_untweeted ON blog_posts (published_at)
  WHERE status = 'published' AND tweeted_at IS NULL;

-- Twitter OAuth 2.0 tokens table
CREATE TABLE IF NOT EXISTS twitter_oauth_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  scope TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- PKCE state storage (temporary, cleaned up after use)
CREATE TABLE IF NOT EXISTS twitter_oauth_state (
  state TEXT PRIMARY KEY,
  code_verifier TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- pg_cron job: every 5 minutes, call edge function to tweet unpublished posts
SELECT cron.schedule(
  'tweet-published-blog-posts',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://mtxbiyilvgwhbdptysex.supabase.co/functions/v1/publish-blog-to-twitter',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := jsonb_build_object('mode', 'auto_batch')
  );
  $$
);
