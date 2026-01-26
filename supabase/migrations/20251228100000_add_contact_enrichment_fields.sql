-- Add contact enrichment fields for FullContact integration
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS company TEXT,
  ADD COLUMN IF NOT EXISTS job_title TEXT,
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS region TEXT,
  ADD COLUMN IF NOT EXISTS country TEXT,
  ADD COLUMN IF NOT EXISTS linkedin_url TEXT,
  ADD COLUMN IF NOT EXISTS twitter_url TEXT,
  ADD COLUMN IF NOT EXISTS facebook_url TEXT,
  ADD COLUMN IF NOT EXISTS enriched_at TIMESTAMPTZ;

COMMENT ON COLUMN public.contacts.company IS 'Company/organization name from enrichment';
COMMENT ON COLUMN public.contacts.job_title IS 'Job title from enrichment';
COMMENT ON COLUMN public.contacts.linkedin_url IS 'LinkedIn profile URL';
COMMENT ON COLUMN public.contacts.twitter_url IS 'Twitter/X profile URL';
COMMENT ON COLUMN public.contacts.facebook_url IS 'Facebook profile URL';
COMMENT ON COLUMN public.contacts.enriched_at IS 'Last time contact was enriched via lookup';
