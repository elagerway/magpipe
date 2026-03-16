-- Enable RLS on system-only tables (no user policies = service role access only)
-- These tables have no user_id column and are accessed exclusively via service role key
ALTER TABLE public.linkedin_oauth_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.linkedin_oauth_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ip_geolocation ENABLE ROW LEVEL SECURITY;
