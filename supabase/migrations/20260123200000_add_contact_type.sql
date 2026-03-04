-- Add contact_type column to contacts table
-- Allows distinguishing between personal contacts and businesses

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS contact_type TEXT DEFAULT 'personal';

COMMENT ON COLUMN contacts.contact_type IS 'Type of contact: personal, business, etc.';
