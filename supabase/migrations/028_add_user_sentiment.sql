-- Add user_sentiment to call_records
ALTER TABLE call_records
ADD COLUMN IF NOT EXISTS user_sentiment TEXT;

COMMENT ON COLUMN call_records.user_sentiment IS 'Sentiment analysis of the user/caller (positive, neutral, negative)';