-- Migration: Update cron job webhook URLs to api.magpipe.ai
-- This updates the process_scheduled_actions function to use the new API domain

-- Update the process_scheduled_actions function with new webhook URL
CREATE OR REPLACE FUNCTION process_scheduled_actions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  response http_response;
BEGIN
  -- Call the edge function to process scheduled actions
  SELECT * INTO response FROM http((
    'POST',
    'https://api.magpipe.ai/functions/v1/process-scheduled-actions',
    ARRAY[
      ('Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true))::http_header
    ],
    'application/json',
    '{}'
  )::http_request);

  -- Log the response (optional, for debugging)
  IF response.status != 200 THEN
    RAISE WARNING 'process_scheduled_actions failed with status %: %', response.status, response.content;
  END IF;
END;
$$;

-- Update the process_scheduled_deletions function with new webhook URL
CREATE OR REPLACE FUNCTION process_scheduled_deletions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  response http_response;
BEGIN
  -- Call the edge function to process scheduled deletions
  SELECT * INTO response FROM http((
    'POST',
    'https://api.magpipe.ai/functions/v1/process-scheduled-deletions',
    ARRAY[
      ('Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true))::http_header
    ],
    'application/json',
    '{}'
  )::http_request);

  -- Log the response
  IF response.status != 200 THEN
    RAISE WARNING 'process_scheduled_deletions failed with status %: %', response.status, response.content;
  END IF;
END;
$$;

-- Note: The cron jobs themselves don't need updating - they just call these functions
-- The functions now point to the new API domain
