-- Extend contacts table with additional fields
-- Add avatar_url, first_name, last_name, email, address
-- Migrate existing 'name' data to first_name

-- Add new columns
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS first_name TEXT,
  ADD COLUMN IF NOT EXISTS last_name TEXT,
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- Migrate existing name data to first_name
UPDATE public.contacts
SET first_name = COALESCE(
  NULLIF(TRIM(SPLIT_PART(name, ' ', 1)), ''),
  name
)
WHERE first_name IS NULL;

-- Migrate last name if name has multiple words
UPDATE public.contacts
SET last_name = NULLIF(TRIM(SUBSTRING(name FROM POSITION(' ' IN name) + 1)), '')
WHERE last_name IS NULL AND POSITION(' ' IN name) > 0;

-- Now make first_name NOT NULL (since we've migrated the data)
ALTER TABLE public.contacts
  ALTER COLUMN first_name SET NOT NULL;

-- Add email format validation (optional but recommended)
ALTER TABLE public.contacts
  ADD CONSTRAINT valid_email CHECK (
    email IS NULL OR email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'
  );

-- Add index on email for searching
CREATE INDEX IF NOT EXISTS idx_contacts_email ON public.contacts(user_id, email) WHERE email IS NOT NULL;

-- Comments
COMMENT ON COLUMN public.contacts.first_name IS 'Contact first name (required)';
COMMENT ON COLUMN public.contacts.last_name IS 'Contact last name (optional)';
COMMENT ON COLUMN public.contacts.email IS 'Contact email address (optional)';
COMMENT ON COLUMN public.contacts.address IS 'Contact mailing address (optional)';
COMMENT ON COLUMN public.contacts.avatar_url IS 'URL to contact avatar image (optional)';

-- Note: We keep the 'name' column for backwards compatibility
-- but new code should use first_name/last_name instead
