-- #102: dedup duplicate call-completion (Slack/skill) notifications.
--
-- The inbound voice path fires execute-skill with event_type 'call_ends' TWICE
-- for one call — once from agent.py at session end, once from webhook-call-status
-- on the SignalWire 'completed' callback — so customers got two identical Slack
-- messages (with different durations: agent session timing vs SignalWire's).
-- execute-skill now atomically CLAIMS the call via this column (first caller wins,
-- second is suppressed). Fail-open: if the claim errors, delivery still proceeds.
--
-- Applied live 2026-06-23 (manual-migration workflow). Idempotent.

alter table call_records add column if not exists call_ends_delivered_at timestamptz;
