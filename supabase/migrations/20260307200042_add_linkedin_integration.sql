-- LinkedIn OAuth tokens
CREATE TABLE IF NOT EXISTS linkedin_oauth_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  access_token text NOT NULL,
  refresh_token text,
  expires_at timestamptz NOT NULL,
  person_id text,
  scope text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- LinkedIn OAuth state
CREATE TABLE IF NOT EXISTS linkedin_oauth_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state text NOT NULL UNIQUE,
  created_at timestamptz DEFAULT now()
);

-- LinkedIn post tracking on blog_posts
ALTER TABLE blog_posts
  ADD COLUMN IF NOT EXISTS linkedin_posted_at timestamptz,
  ADD COLUMN IF NOT EXISTS linkedin_post_id text;
