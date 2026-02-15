-- Directory Submissions Tracker
-- Tracks submissions to AI/SaaS directories for LLMO strategy

CREATE TABLE IF NOT EXISTS directory_submissions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  directory_name text NOT NULL,
  directory_url text NOT NULL,
  submit_url text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'submitted', 'approved', 'rejected', 'live')),
  cost text DEFAULT 'Free',
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('critical', 'high', 'medium', 'low')),
  submitted_at timestamptz,
  approved_at timestamptz,
  listing_url text,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_directory_submissions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_directory_submissions_updated_at
  BEFORE UPDATE ON directory_submissions
  FOR EACH ROW
  EXECUTE FUNCTION update_directory_submissions_updated_at();

-- Seed data from strategy doc
INSERT INTO directory_submissions (directory_name, directory_url, submit_url, cost, priority) VALUES
  ('Product Hunt', 'https://www.producthunt.com', 'https://www.producthunt.com/launch', 'Free', 'critical'),
  ('G2', 'https://www.g2.com', 'https://sell.g2.com/create-a-profile', 'Free', 'critical'),
  ('Capterra', 'https://www.capterra.com', 'https://www.capterra.com/vendors/sign-up', 'Free', 'critical'),
  ('There''s An AI For That', 'https://theresanaiforthat.com', 'https://theresanaiforthat.com/submit/', '$347', 'high'),
  ('Future Tools', 'https://www.futuretools.io', 'https://www.futuretools.io/submit-a-tool', 'Free', 'high'),
  ('Toolify.ai', 'https://www.toolify.ai', 'https://www.toolify.ai/submit', '$49', 'high'),
  ('TopAI.tools', 'https://topai.tools', 'https://topai.tools/submit', 'Free', 'medium'),
  ('AI Tools Directory', 'https://aitoolsdirectory.com', 'https://aitoolsdirectory.com/submit-tool', 'Free', 'medium'),
  ('SaaSHub', 'https://www.saashub.com', 'https://www.saashub.com/services/submit', 'Free', 'medium'),
  ('AlternativeTo', 'https://alternativeto.net', 'https://alternativeto.net', 'Free', 'medium');
