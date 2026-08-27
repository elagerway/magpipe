-- [SECURITY/CRITICAL] #107: enable RLS on public tables that had it disabled.
--
-- Supabase advisor rls_disabled_in_public flagged api_key_numbers and error_alerts
-- as readable/writable/deletable by anyone with the project URL + anon key:
--   * api_key_numbers (api_key_id, service_number) — anon writes = API authorization
--     bypass (grant/revoke an API key's number access).
--   * error_alerts — leaked admin recipient_phone + error internals.
--
-- All access to both is server-side via the service role (webhook-dispatcher.ts +
-- agent.py read api_key_numbers; log-error reads/writes error_alerts) — and the
-- service role BYPASSES RLS — so enabling RLS with no policies denies anon/authenticated
-- without breaking server writes. No frontend/user-session reads exist (verified by grep).
-- Add owner/admin SELECT policies later only if a user-facing reader is introduced.
--
-- Applied live 2026-06-23 (manual-migration workflow). Idempotent.

alter table api_key_numbers enable row level security;
alter table error_alerts    enable row level security;
