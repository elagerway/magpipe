-- 20260512_blocked_callers.sql
--
-- Workspace-wide blocklist of caller numbers + DNCL-registration
-- tracking on service_numbers. Together these power the new
-- "Mark as Spam" feature:
--   - `blocked_callers`: when the inbound call webhook fires, check
--     whether the caller_number is on this list for the receiving
--     service number's user. If yes, return <Reject reason="busy"/>
--     and bypass the agent entirely.
--   - `service_numbers.dncl_registered_at` + `dncl_registration_status`:
--     track whether the user's service number has been (or is in the
--     process of being) registered on Canada's National Do Not Call
--     List via a Magpipe-placed outbound IVR call to 1-866-580-3625.
--     Used by the Mark-as-Spam modal to decide whether to show the
--     "also register this number on DNCL" checkbox.
--
-- Scope: blocklist is per-user (workspace-wide), NOT per-agent — spam
-- callers tend to hit every number a user owns, not a specific agent.
-- Differs from `call_whitelist` which IS per-agent (whitelist intent
-- is "send THIS caller straight through THIS agent's call flow").

CREATE TABLE IF NOT EXISTS blocked_callers (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  caller_number TEXT         NOT NULL,                       -- E.164
  label         TEXT,                                        -- optional reason ("Marked spam from inbox 2026-05-12")
  source        TEXT         NOT NULL DEFAULT 'manual',      -- 'inbox_mark_spam' | 'manual'
  blocked_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),         -- when first blocked (logically; created_at is for audit)
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, caller_number),
  CONSTRAINT blocked_callers_e164_format CHECK (caller_number ~ '^\+[1-9]\d{7,14}$'),
  CONSTRAINT blocked_callers_source_valid CHECK (source IN ('manual', 'inbox_mark_spam'))
);

-- Common read pattern: list a user's blocked callers, most-recent first.
CREATE INDEX IF NOT EXISTS blocked_callers_user_blocked_at_idx
  ON blocked_callers (user_id, blocked_at DESC);

-- Hot path for webhook-inbound-call: "is this (user_id, caller_number)
-- pair blocked?" — covered by the UNIQUE constraint's implicit index,
-- but make it explicit so EXPLAIN doesn't change semantics later.
CREATE INDEX IF NOT EXISTS blocked_callers_lookup_idx
  ON blocked_callers (user_id, caller_number);

-- updated_at trigger using the project's existing helper (see the
-- forwarding_numbers migration for why we don't use moddatetime).
DROP TRIGGER IF EXISTS blocked_callers_updated_at ON blocked_callers;
CREATE TRIGGER blocked_callers_updated_at
  BEFORE UPDATE ON blocked_callers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS: owner-only. Edge functions use service role and bypass.
ALTER TABLE blocked_callers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS blocked_callers_owner_select ON blocked_callers;
CREATE POLICY blocked_callers_owner_select ON blocked_callers
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS blocked_callers_owner_modify ON blocked_callers;
CREATE POLICY blocked_callers_owner_modify ON blocked_callers
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

COMMENT ON TABLE blocked_callers IS
  'Workspace-wide blocklist of caller phone numbers per user. webhook-inbound-call consults this list and returns <Reject reason="busy"/> on hit so the call never reaches the agent. Populated by the inbox "Mark as Spam" flow and the Numbers-page management UI. Numbers stored in E.164.';

-- -------------------------------------------------------------------
-- service_numbers: track DNCL registration state per service number.
-- A successful registration sets both columns; an in-flight outbound
-- IVR call sets status='pending'; a failed IVR sets status='failed'
-- with registered_at still NULL.
-- -------------------------------------------------------------------

ALTER TABLE service_numbers
  ADD COLUMN IF NOT EXISTS dncl_registered_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dncl_registration_status   TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'service_numbers_dncl_status_valid'
  ) THEN
    ALTER TABLE service_numbers
      ADD CONSTRAINT service_numbers_dncl_status_valid
      CHECK (dncl_registration_status IS NULL OR dncl_registration_status IN ('pending', 'completed', 'failed'));
  END IF;
END $$;

COMMENT ON COLUMN service_numbers.dncl_registered_at IS
  'Set when the user has registered this service number on the Canadian National DNCL via the Mark-as-Spam → auto-IVR flow. NULL = never registered; populated = successful IVR completion.';

COMMENT ON COLUMN service_numbers.dncl_registration_status IS
  'In-flight state for the DNCL outbound IVR call. NULL = never attempted, pending = call in progress, completed = IVR confirmed registration, failed = IVR did not reach confirmation. Drives whether the Mark-as-Spam modal shows the "also register on DNCL" checkbox.';
