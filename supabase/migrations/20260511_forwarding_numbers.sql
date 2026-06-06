-- 20260511_forwarding_numbers.sql
--
-- Per-user pick list of forwarding destinations for call_whitelist.
-- Today users type a forward_to E.164 number for each whitelist entry,
-- and they typically re-type the same handful of numbers over and over
-- (e.g. their personal cell). This adds a curated saved-numbers list
-- so the whitelist UI can offer a dropdown + default selection, and
-- the new "Mark friendly" flow in the inbox can pre-fill the default
-- forward destination without prompting for it every time.
--
-- One row per (user_id, number). Exactly zero or one row per user has
-- is_default = true (enforced by a partial unique index). Numbers are
-- stored in E.164 form; the manage-forwarding-numbers edge function
-- normalizes incoming values via _shared/phone-e164.ts before insert.

CREATE TABLE IF NOT EXISTS forwarding_numbers (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  number     TEXT        NOT NULL,                                -- E.164
  label      TEXT,                                                -- optional friendly name ("Mobile", "Office")
  is_default BOOLEAN     NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, number),
  CONSTRAINT forwarding_numbers_e164_format CHECK (number ~ '^\+[1-9]\d{7,14}$')
);

-- At most one default per user. Postgres partial unique index pattern.
CREATE UNIQUE INDEX IF NOT EXISTS forwarding_numbers_one_default_per_user
  ON forwarding_numbers (user_id) WHERE is_default = true;

-- Common access pattern: list a user's saved numbers, default first.
CREATE INDEX IF NOT EXISTS forwarding_numbers_user_idx
  ON forwarding_numbers (user_id, is_default DESC, created_at DESC);

-- Track updated_at on UPDATE. Uses the existing
-- public.update_updated_at_column() trigger function (same one
-- chat_widgets/external_trunks/mcp use). The earlier call_whitelist
-- moddatetime trigger never actually ran in this project because the
-- `moddatetime` extension wasn't installed; we use a plain plpgsql
-- function here so updated_at really tracks edits.
DROP TRIGGER IF EXISTS forwarding_numbers_updated_at ON forwarding_numbers;
CREATE TRIGGER forwarding_numbers_updated_at
  BEFORE UPDATE ON forwarding_numbers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS: owner-only access. Edge functions use service role and bypass.
ALTER TABLE forwarding_numbers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS forwarding_numbers_owner_select ON forwarding_numbers;
CREATE POLICY forwarding_numbers_owner_select ON forwarding_numbers
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS forwarding_numbers_owner_modify ON forwarding_numbers;
CREATE POLICY forwarding_numbers_owner_modify ON forwarding_numbers
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

COMMENT ON TABLE forwarding_numbers IS
  'Per-user saved list of phone numbers usable as call_whitelist.forward_to destinations. One row may be flagged is_default for the new "Mark friendly" inbox flow. Numbers stored in E.164 form.';

-- -------------------------------------------------------------------
-- Backfill: seed the pick list from existing call_whitelist entries.
-- Distinct (user_id, forward_to) pairs become forwarding_numbers rows;
-- the most-frequently-used forward_to per user becomes that user's
-- default. Idempotent via ON CONFLICT.
-- -------------------------------------------------------------------

INSERT INTO forwarding_numbers (user_id, number, label, is_default)
SELECT user_id, forward_to, NULL, false
FROM (
  SELECT DISTINCT user_id, forward_to
  FROM call_whitelist
  WHERE forward_to ~ '^\+[1-9]\d{7,14}$'
) s
ON CONFLICT (user_id, number) DO NOTHING;

-- Promote the most-used forward_to per user as their default, only
-- when they don't already have one set (idempotent re-run safety).
WITH counts AS (
  SELECT
    user_id,
    forward_to,
    COUNT(*) AS use_count,
    ROW_NUMBER() OVER (
      PARTITION BY user_id
      ORDER BY COUNT(*) DESC, MAX(created_at) DESC
    ) AS rn
  FROM call_whitelist
  WHERE forward_to ~ '^\+[1-9]\d{7,14}$'
  GROUP BY user_id, forward_to
),
users_without_default AS (
  SELECT DISTINCT user_id
  FROM forwarding_numbers
  WHERE user_id NOT IN (
    SELECT user_id FROM forwarding_numbers WHERE is_default = true
  )
)
UPDATE forwarding_numbers fn
SET is_default = true
FROM counts c
WHERE c.rn = 1
  AND fn.user_id = c.user_id
  AND fn.number = c.forward_to
  AND fn.user_id IN (SELECT user_id FROM users_without_default);
