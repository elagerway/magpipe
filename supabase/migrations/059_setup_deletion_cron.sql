-- Migration 059: Setup automatic phone number deletion cron job
-- Runs daily at 2:00 AM UTC to process scheduled deletions

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS http;

-- Create a function to call the process-scheduled-deletions Edge Function
CREATE OR REPLACE FUNCTION process_phone_number_deletions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  response record;
BEGIN
  -- Call the Edge Function using http extension
  SELECT * INTO response
  FROM http((
    'POST',
    'https://mtxbiyilvgwhbdptysex.supabase.co/functions/v1/process-scheduled-deletions',
    ARRAY[
      http_header('Content-Type', 'application/json'),
      http_header('Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im10eGJpeWlsdmd3aGJkcHR5c2V4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxNzE2OTksImV4cCI6MjA3NDc0NzY5OX0.VpOfuXl7S_ZdSpRjD8DGkSbbT4Y5g4rsezYNYGdtNPs')
    ],
    'application/json',
    '{}'
  )::http_request);

  -- Log the result
  RAISE NOTICE 'Phone number deletion cron executed with status: %', response.status;
END;
$$;

-- Schedule the cron job to run daily at 2:00 AM UTC
SELECT cron.schedule(
  'process-phone-number-deletions',
  '0 2 * * *',
  $$SELECT process_phone_number_deletions();$$
);

-- Grant execute permission
GRANT EXECUTE ON FUNCTION process_phone_number_deletions() TO authenticated;
GRANT EXECUTE ON FUNCTION process_phone_number_deletions() TO service_role;

-- Add comment for documentation
COMMENT ON FUNCTION process_phone_number_deletions() IS 'Calls the process-scheduled-deletions Edge Function to delete phone numbers past their scheduled deletion date. Runs daily via pg_cron at 2:00 AM UTC.';
