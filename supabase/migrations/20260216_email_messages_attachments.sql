-- Add attachments column to email_messages for inline image support
ALTER TABLE email_messages ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]';
