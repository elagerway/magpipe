-- RLS Security Hardening Migration
-- Fixes 14 tables with RLS disabled and 5 tables with misconfigured {public} role policies
-- Safe: all edge functions use service_role key (bypasses RLS), all API key endpoints use service_role client

-- ============================================================
-- Part 1: Enable RLS on tables with existing correct policies
-- These have proper user-scoped policies but RLS was disabled (policies were inert)
-- ============================================================
ALTER TABLE service_numbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE voices ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Part 2: Enable RLS on system-only tables (no user policies needed)
-- Only accessed by edge functions via service_role key, which bypasses RLS
-- ============================================================
ALTER TABLE twitter_oauth_tokens ENABLE ROW LEVEL SECURITY;  -- CRITICAL: OAuth access tokens
ALTER TABLE twitter_oauth_state ENABLE ROW LEVEL SECURITY;   -- HIGH: OAuth state tokens
ALTER TABLE phone_number_pool ENABLE ROW LEVEL SECURITY;     -- HIGH: number enumeration
ALTER TABLE admin_notification_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_email_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_ticket_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE directory_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE temp_state ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Part 3: Fix sms_opt_outs — drop overly permissive {public} ALL policy
-- RLS already enabled, but policy grants ALL to {public} with qual=true
-- ============================================================
DROP POLICY IF EXISTS "Service role can manage opt-outs" ON sms_opt_outs;

-- ============================================================
-- Part 4: Drop misconfigured {public} role policies
-- Labeled "Service role" but assigned to {public}, granting ALL access to everyone
-- service_role bypasses RLS automatically, so these policies are purely harmful
-- Existing user-scoped policies on these tables remain intact
-- ============================================================
DROP POLICY IF EXISTS "Service role manages messages" ON chat_messages;
DROP POLICY IF EXISTS "Service role manages sessions" ON chat_sessions;
DROP POLICY IF EXISTS "Service role can manage area codes" ON area_codes;
DROP POLICY IF EXISTS "Service role full access on monthly_billing_log" ON monthly_billing_log;

-- ============================================================
-- Part 5: Drop overly permissive INSERT policies
-- INSERT with with_check=true on {public} means any user can insert arbitrary records
-- All inserts for these tables happen in edge functions (service_role)
-- ============================================================
DROP POLICY IF EXISTS "Service role can insert collected data" ON collected_call_data;
DROP POLICY IF EXISTS "Service role can insert credit transactions" ON credit_transactions;
DROP POLICY IF EXISTS "Service role can insert usage history" ON usage_history;
DROP POLICY IF EXISTS "Service role can insert audit log" ON admin_audit_log;

-- ============================================================
-- Part 6: Tighten users table INSERT policy
-- Currently any user can INSERT any user record (with_check=true)
-- Restrict to own ID (user has JWT from signUp() during profile creation)
-- ============================================================
DROP POLICY IF EXISTS "Users can insert own record" ON users;
CREATE POLICY "Users can insert own profile" ON users
  FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());
