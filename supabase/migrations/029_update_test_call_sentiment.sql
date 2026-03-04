-- Update test calls with sentiment for testing
UPDATE call_records
SET user_sentiment = 'positive'
WHERE call_sid LIKE 'test_call_%' AND status = 'completed' AND user_sentiment IS NULL;

UPDATE call_records
SET user_sentiment = 'negative'
WHERE call_sid LIKE 'test_call_%' AND status = 'no-answer' AND user_sentiment IS NULL;