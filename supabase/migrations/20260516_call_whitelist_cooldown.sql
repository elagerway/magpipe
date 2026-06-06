-- Auto-cooldown for whitelist entries when a sub-second failure burst is detected.
-- Set by whitelist-call-complete when ≥3 sub-second forward failures occur within
-- 5 minutes for the same (agent_id, caller_number) — interpreted as caller-ID
-- spoofing of a whitelisted caller. webhook-inbound-call refuses to forward while
-- cooldown_until > now() and falls the call through to the AI agent instead.
-- Auto-expires; no manual intervention required.

ALTER TABLE public.call_whitelist
  ADD COLUMN IF NOT EXISTS cooldown_until timestamptz;

-- Partial index — most rows have NULL cooldown_until, only active cooldowns matter.
CREATE INDEX IF NOT EXISTS call_whitelist_cooldown_active_idx
  ON public.call_whitelist (agent_id, caller_number)
  WHERE cooldown_until IS NOT NULL;
