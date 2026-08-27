-- #101: per-agent SMS templates.
--
-- sms_templates was stored per-USER (no agent_id), so the "Send SMS" templates
-- created on one agent showed on every sibling agent of that user — and the voice
-- agent offered them all at runtime (agent.py loaded by user_id only). Add agent_id,
-- scope all reads by it (frontend functions-tab + agent.py), and backfill existing
-- rows to each user's default (or oldest) agent so none are orphaned.
--
-- Applied live 2026-06-23 (manual-migration workflow; history frozen — not via db push).
-- Idempotent: safe to re-run.

ALTER TABLE sms_templates
  ADD COLUMN IF NOT EXISTS agent_id uuid REFERENCES agent_configs(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_sms_templates_agent_id ON sms_templates(agent_id);

UPDATE sms_templates st
SET agent_id = (
  SELECT ac.id FROM agent_configs ac
  WHERE ac.user_id = st.user_id
  ORDER BY ac.is_default DESC NULLS LAST, ac.created_at ASC
  LIMIT 1
)
WHERE st.agent_id IS NULL;
