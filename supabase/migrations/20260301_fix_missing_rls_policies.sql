-- Fix missing RLS policies for sms_messages and service_numbers
--
-- Root cause: The bootstrap consolidation (001_bootstrap.sql) was generated when
-- these tables had RLS disabled, so it didn't include their policies.
-- The RLS hardening migration (20260226) then enabled RLS on these tables,
-- but assumed the policies already existed. With RLS enabled and no policies,
-- all queries return empty results — breaking the inbox for SMS conversations.

-- ============================================================
-- sms_messages: Add user-scoped policies
-- ============================================================
DROP POLICY IF EXISTS "Users can view own sms messages" ON sms_messages;
CREATE POLICY "Users can view own sms messages"
  ON sms_messages
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own sms messages" ON sms_messages;
CREATE POLICY "Users can insert own sms messages"
  ON sms_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own sms messages" ON sms_messages;
CREATE POLICY "Users can update own sms messages"
  ON sms_messages
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own sms messages" ON sms_messages;
CREATE POLICY "Users can delete own sms messages"
  ON sms_messages
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ============================================================
-- service_numbers: Add user-scoped policies
-- ============================================================
DROP POLICY IF EXISTS "Users can view own service numbers" ON service_numbers;
CREATE POLICY "Users can view own service numbers"
  ON service_numbers
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own service numbers" ON service_numbers;
CREATE POLICY "Users can insert own service numbers"
  ON service_numbers
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own service numbers" ON service_numbers;
CREATE POLICY "Users can update own service numbers"
  ON service_numbers
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own service numbers" ON service_numbers;
CREATE POLICY "Users can delete own service numbers"
  ON service_numbers
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
