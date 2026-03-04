-- Add IP address tracking for user signups
-- Captures the IP address when users sign up for fraud detection and analytics

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS signup_ip TEXT,
  ADD COLUMN IF NOT EXISTS signup_country TEXT,
  ADD COLUMN IF NOT EXISTS signup_city TEXT;

-- Create index for IP lookups
CREATE INDEX IF NOT EXISTS idx_users_signup_ip ON public.users(signup_ip) WHERE signup_ip IS NOT NULL;

-- Comments for documentation
COMMENT ON COLUMN public.users.signup_ip IS 'IP address captured at signup';
COMMENT ON COLUMN public.users.signup_country IS 'Country derived from signup IP (via geolocation)';
COMMENT ON COLUMN public.users.signup_city IS 'City derived from signup IP (via geolocation)';
