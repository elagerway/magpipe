-- Blog posts table for admin-managed content publishing
CREATE TABLE blog_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(255) UNIQUE NOT NULL,
  title VARCHAR(500) NOT NULL,
  meta_description VARCHAR(300),
  content TEXT NOT NULL,
  excerpt TEXT,
  author_name VARCHAR(200) DEFAULT 'Magpipe Team',
  status VARCHAR(20) DEFAULT 'draft',  -- draft | published | scheduled
  published_at TIMESTAMPTZ,
  scheduled_at TIMESTAMPTZ,
  featured_image_url TEXT,
  tags TEXT[],
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX idx_blog_posts_slug ON blog_posts (slug);
CREATE INDEX idx_blog_posts_status ON blog_posts (status);
CREATE INDEX idx_blog_posts_published_at ON blog_posts (published_at DESC);
CREATE INDEX idx_blog_posts_scheduled ON blog_posts (scheduled_at) WHERE status = 'scheduled';

-- pg_cron: auto-publish scheduled posts every 5 minutes
SELECT cron.schedule('publish-scheduled-blog-posts', '*/5 * * * *',
  $$UPDATE blog_posts SET status = 'published', published_at = COALESCE(published_at, now()), updated_at = now()
    WHERE status = 'scheduled' AND scheduled_at <= now()$$
);

-- RLS
ALTER TABLE blog_posts ENABLE ROW LEVEL SECURITY;

-- Public can read published posts
CREATE POLICY "Public read published blog posts"
  ON blog_posts FOR SELECT
  USING (status = 'published');

-- Admins/gods have full access
CREATE POLICY "Admin full access to blog posts"
  ON blog_posts FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('admin', 'god')
    )
  );
