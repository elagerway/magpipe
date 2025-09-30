-- Insert test call records for testing the inbox call display

DO $$
DECLARE
  v_user_id UUID;
BEGIN
  -- Get the first user_id from sms_messages
  SELECT DISTINCT user_id INTO v_user_id
  FROM sms_messages
  LIMIT 1;

  -- Only proceed if we found a user
  IF v_user_id IS NOT NULL THEN
    -- Check if we already have test calls
    IF NOT EXISTS (SELECT 1 FROM call_records WHERE call_sid LIKE 'test_call_%') THEN

      -- Insert completed call with transcript
      INSERT INTO call_records (
        user_id,
        caller_number,
        contact_phone,
        service_number,
        call_sid,
        direction,
        status,
        disposition,
        duration_seconds,
        started_at,
        ended_at,
        transcript
      ) VALUES (
        v_user_id,
        '+16045628647',
        '+16045628647',
        '+16045628647',
        'test_call_' || gen_random_uuid()::text,
        'inbound',
        'completed',
        'answered_by_pat',
        125,
        NOW() - INTERVAL '2 hours',
        NOW() - INTERVAL '2 hours' + INTERVAL '125 seconds',
        'Hi, this is a test call. I wanted to discuss the project timeline with you. Can you give me a call back when you have a moment? Thanks!'
      );

      -- Insert missed call
      INSERT INTO call_records (
        user_id,
        caller_number,
        contact_phone,
        service_number,
        call_sid,
        direction,
        status,
        disposition,
        duration_seconds,
        started_at,
        ended_at
      ) VALUES (
        v_user_id,
        '+16045628647',
        '+16045628647',
        '+16045628647',
        'test_call_' || gen_random_uuid()::text,
        'inbound',
        'no-answer',
        'failed',
        0,
        NOW() - INTERVAL '30 minutes',
        NOW() - INTERVAL '30 minutes'
      );

      RAISE NOTICE 'Test call records inserted successfully';
    ELSE
      RAISE NOTICE 'Test call records already exist, skipping insertion';
    END IF;
  ELSE
    RAISE NOTICE 'No user found in sms_messages table, skipping test call insertion';
  END IF;
END $$;