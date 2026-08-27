-- 20260508_jwt_policy_self_healing.sql
--
-- Background: bare `npx supabase functions deploy <name>` silently re-enables
-- verify_jwt at the gateway layer, which blocks API-key auth and external
-- webhooks before the function code can run. This has caused multiple
-- production incidents — most recently 2026-05-08 when 13 functions were
-- drifted (including webhook-inbound-call), killing all inbound calls until
-- detected manually. The deploy script's --check mode exists but only catches
-- drift if someone runs it.
--
-- Defense: an edge function `enforce-jwt-policy` runs every 5 minutes via
-- pg_cron, reads `_shared/jwt-policy.json` (single source of truth shared
-- with the deploy script), pulls each function's current verify_jwt from the
-- Supabase Management API, and PATCHes any drifted function back via
-- `PATCH /v1/projects/{ref}/functions/{slug}` (no redeploy needed). For each
-- fix, an incident row is written to `system_error_logs` with
-- error_type='jwt_policy_drift_autohealed' so the existing log-error
-- critical-alert path fires SMS to oncall — drift never causes a real
-- outage AND we always know when it happened.
--
-- This migration creates:
--   1) jwt_policy_drift_log audit table (forensic record of what drifted)
--   2) process_enforce_jwt_policy() pg function that calls the edge function
--   3) every-5-min cron schedule that calls (2)

-- ---------------------------------------------------------------------------
-- 1. Audit table
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS jwt_policy_drift_log (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  detected_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  drifted_count INTEGER     NOT NULL,
  details       JSONB       NOT NULL  -- array of { slug, was, fixed, error? }
);

CREATE INDEX IF NOT EXISTS jwt_policy_drift_log_detected_at_idx
  ON jwt_policy_drift_log (detected_at DESC);

ALTER TABLE jwt_policy_drift_log ENABLE ROW LEVEL SECURITY;

-- god/admin can read for forensics; nobody else
DROP POLICY IF EXISTS jwt_policy_drift_log_admin_read ON jwt_policy_drift_log;
CREATE POLICY jwt_policy_drift_log_admin_read
  ON jwt_policy_drift_log FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role IN ('admin', 'god')
    )
  );

COMMENT ON TABLE jwt_policy_drift_log IS
  'Forensic record of every time enforce-jwt-policy detected and healed JWT drift on edge functions. One row per cron run that found drift; details JSONB has per-function entries.';

-- ---------------------------------------------------------------------------
-- 2. PG function that POSTs to the edge function
--
-- Replace YOUR_SUPABASE_SERVICE_ROLE_KEY with the actual key after this
-- migration runs (same convention as 20260501_webhook_events_expansion.sql).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION process_enforce_jwt_policy()
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
    'https://mtxbiyilvgwhbdptysex.supabase.co/functions/v1/enforce-jwt-policy',
    ARRAY[
      http_header('Content-Type', 'application/json'),
      http_header('Authorization', 'Bearer YOUR_SUPABASE_SERVICE_ROLE_KEY')
    ],
    'application/json',
    '{}'
  )::http_request);
  RAISE NOTICE 'enforce-jwt-policy cron status: %', response.status;
END;
$$;

GRANT EXECUTE ON FUNCTION process_enforce_jwt_policy() TO service_role;

COMMENT ON FUNCTION process_enforce_jwt_policy() IS
  'Every 5 minutes: calls the enforce-jwt-policy edge function which checks all edge function verify_jwt settings against _shared/jwt-policy.json and PATCHes any drift back via the Management API. Drift fires SMS via system_error_logs.';

-- ---------------------------------------------------------------------------
-- 3. Cron schedule — every 5 min
-- ---------------------------------------------------------------------------

SELECT cron.schedule(
  'enforce-jwt-policy',
  '*/5 * * * *',
  $$SELECT process_enforce_jwt_policy();$$
);
