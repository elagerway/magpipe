-- Add sentiment column to sms_messages table
-- For tracking sentiment analysis of inbound messages

ALTER TABLE sms_messages
ADD COLUMN IF NOT EXISTS sentiment TEXT
CHECK (sentiment IN ('positive', 'neutral', 'negative'));

-- Note: call_records already has user_sentiment column
