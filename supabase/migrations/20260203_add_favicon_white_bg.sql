-- Add favicon white background option
ALTER TABLE users ADD COLUMN IF NOT EXISTS favicon_white_bg BOOLEAN DEFAULT false;
