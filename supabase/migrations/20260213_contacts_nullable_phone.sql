-- Allow contacts without phone numbers (email-only contacts from email enrichment)
ALTER TABLE contacts ALTER COLUMN phone_number DROP NOT NULL;
