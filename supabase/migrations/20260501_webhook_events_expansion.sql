-- Webhook events expansion
-- 1. Adds retry tracking + dead-letter queue to existing webhook delivery infra
-- 2. Adds session-end + summary columns to chat_sessions for chat.session.completed
--
-- Pairs with: supabase/functions/_shared/webhook-dispatcher.ts (TS port of
-- agents/livekit-voice-agent/agent.py:send_webhooks) and webhook-retry-worker
-- cron edge function.

-- ---------------------------------------------------------------------------
-- 1. Retry tracking on webhook_deliveries
-- ---------------------------------------------------------------------------

ALTER TABLE webhook_deliveries
  ADD COLUMN IF NOT EXISTS attempt_number INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ;

-- Retry-worker scan index: only rows pending a re-fire.
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_pending_retry
  ON webhook_deliveries(next_retry_at)
  WHERE next_retry_at IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Dead-letter queue for events that exhausted all retries
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS webhook_dead_letter (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  api_key_id UUID NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  total_attempts INTEGER NOT NULL,
  last_status_code INTEGER,
  last_error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  replayed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_webhook_dead_letter_api_key
  ON webhook_dead_letter(api_key_id, created_at DESC);

ALTER TABLE webhook_dead_letter ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'webhook_dead_letter'
    AND policyname = 'Users can view own dead-letter rows'
  ) THEN
    CREATE POLICY "Users can view own dead-letter rows"
      ON webhook_dead_letter FOR SELECT
      USING (api_key_id IN (SELECT id FROM api_keys WHERE user_id = auth.uid()));
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Session-end columns on chat_sessions
--    Required by the chat.session.completed webhook event payload.
-- ---------------------------------------------------------------------------

ALTER TABLE chat_sessions
  ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ended_reason TEXT,
  ADD COLUMN IF NOT EXISTS summary TEXT,
  ADD COLUMN IF NOT EXISTS extracted_data JSONB;

-- Inactivity-sweep cron index: active sessions ordered by recency.
CREATE INDEX IF NOT EXISTS idx_chat_sessions_inactive_sweep
  ON chat_sessions(last_message_at)
  WHERE status = 'active' AND ended_at IS NULL;

-- ---------------------------------------------------------------------------
-- 4. pg_cron schedules
--    Both run every minute. Each scan is a fast no-op when there's nothing to
--    do, so the once-per-minute cadence is acceptable.
--
--    NOTE: replace 'YOUR_SUPABASE_SERVICE_ROLE_KEY' with the actual service
--    role key after deploy (same convention as 20260215_review_requests.sql).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION process_close_stale_chat_sessions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  response record;
BEGIN
  SELECT * INTO response
  FROM http((
    'POST',
    'https://mtxbiyilvgwhbdptysex.supabase.co/functions/v1/close-stale-chat-sessions',
    ARRAY[
      http_header('Content-Type', 'application/json'),
      http_header('Authorization', 'Bearer YOUR_SUPABASE_SERVICE_ROLE_KEY')
    ],
    'application/json',
    '{}'
  )::http_request);
  RAISE NOTICE 'close-stale-chat-sessions cron status: %', response.status;
END;
$$;

GRANT EXECUTE ON FUNCTION process_close_stale_chat_sessions() TO service_role;

SELECT cron.schedule(
  'process-close-stale-chat-sessions',
  '* * * * *',
  $$SELECT process_close_stale_chat_sessions();$$
);

-- ---------------------------------------------------------------------------
-- 5. Atomic-claim RPC for the retry worker.
--    Two cron invocations can overlap when an edge function cold-starts. A
--    naive SELECT-then-UPDATE pattern would let both runs fire the same
--    event. FOR UPDATE SKIP LOCKED gives us per-row claim semantics: each
--    row is returned to exactly one caller, and lost-update collisions are
--    impossible.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION claim_webhook_retries(batch_size INTEGER DEFAULT 50)
RETURNS TABLE (
  id UUID,
  api_key_id UUID,
  event_type TEXT,
  payload JSONB,
  attempt_number INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH claimed AS (
    SELECT d.id
    FROM webhook_deliveries d
    WHERE d.next_retry_at IS NOT NULL
      AND d.next_retry_at <= NOW()
    ORDER BY d.next_retry_at
    LIMIT batch_size
    FOR UPDATE SKIP LOCKED
  )
  UPDATE webhook_deliveries d
  SET next_retry_at = NULL
  FROM claimed
  WHERE d.id = claimed.id
  RETURNING d.id, d.api_key_id, d.event_type, d.payload, d.attempt_number;
END;
$$;

GRANT EXECUTE ON FUNCTION claim_webhook_retries(INTEGER) TO service_role;

CREATE OR REPLACE FUNCTION process_webhook_retry_worker()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  response record;
BEGIN
  SELECT * INTO response
  FROM http((
    'POST',
    'https://mtxbiyilvgwhbdptysex.supabase.co/functions/v1/webhook-retry-worker',
    ARRAY[
      http_header('Content-Type', 'application/json'),
      http_header('Authorization', 'Bearer YOUR_SUPABASE_SERVICE_ROLE_KEY')
    ],
    'application/json',
    '{}'
  )::http_request);
  RAISE NOTICE 'webhook-retry-worker cron status: %', response.status;
END;
$$;

GRANT EXECUTE ON FUNCTION process_webhook_retry_worker() TO service_role;

SELECT cron.schedule(
  'process-webhook-retry-worker',
  '* * * * *',
  $$SELECT process_webhook_retry_worker();$$
);

COMMENT ON FUNCTION process_close_stale_chat_sessions() IS 'Every minute: closes chat sessions inactive >30 min and fires chat.session.completed webhooks.';
COMMENT ON FUNCTION process_webhook_retry_worker() IS 'Every minute: re-fires webhook_deliveries rows whose next_retry_at has elapsed.';
