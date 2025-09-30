-- Create users table extending auth.users
-- This table stores additional user information beyond what Supabase Auth provides

CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  phone_verified BOOLEAN DEFAULT FALSE,
  phone_number TEXT UNIQUE,
  service_number TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CONSTRAINT phone_number_format CHECK (
    phone_number IS NULL OR phone_number ~ '^\+[1-9]\d{1,14}$'
  ),
  CONSTRAINT service_number_format CHECK (
    service_number IS NULL OR service_number ~ '^\+[1-9]\d{1,14}$'
  )
);

-- Create index for phone number lookups
CREATE INDEX IF NOT EXISTS idx_users_phone_number ON public.users(phone_number) WHERE phone_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_service_number ON public.users(service_number) WHERE service_number IS NOT NULL;

-- Enable Row Level Security
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only read/update their own record
CREATE POLICY "Users can view own record"
  ON public.users
  FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own record"
  ON public.users
  FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own record"
  ON public.users
  FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Create function to handle new user creation from auth.users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.email)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to automatically create user record when auth user is created
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Comments for documentation
COMMENT ON TABLE public.users IS 'User profile information extending auth.users';
COMMENT ON COLUMN public.users.phone_verified IS 'Whether the phone number has been verified via SMS';
COMMENT ON COLUMN public.users.phone_number IS 'User actual phone number in E.164 format';
COMMENT ON COLUMN public.users.service_number IS 'User-selected service phone number for inbound calls/SMS';