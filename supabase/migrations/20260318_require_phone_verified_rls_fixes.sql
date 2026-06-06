-- Fixes for security review of 20260318_require_phone_verified_rls.sql

-- Fix 1: Extend trigger to cover INSERT (not just UPDATE)
-- A user could INSERT their own users row with phone_verified = true,
-- bypassing the gate entirely since the original trigger was BEFORE UPDATE only.
CREATE OR REPLACE FUNCTION public.prevent_self_phone_verify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.phone_verified = true AND (TG_OP = 'INSERT' OR OLD.phone_verified IS DISTINCT FROM true) THEN
    IF COALESCE((current_setting('request.jwt.claims', true)::json->>'role'), '') != 'service_role' THEN
      RAISE EXCEPTION 'phone_verified cannot be set directly';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_self_phone_verify_trigger ON public.users;
CREATE TRIGGER prevent_self_phone_verify_trigger
  BEFORE INSERT OR UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION prevent_self_phone_verify();

-- Fix 2: external_sip_trunks was missed entirely
DROP POLICY IF EXISTS "Team can delete external trunks" ON public.external_sip_trunks;
DROP POLICY IF EXISTS "Team can insert external trunks" ON public.external_sip_trunks;
DROP POLICY IF EXISTS "Team can view external trunks" ON public.external_sip_trunks;
DROP POLICY IF EXISTS "Team can update external trunks" ON public.external_sip_trunks;
CREATE POLICY "Team can delete external trunks" ON public.external_sip_trunks FOR DELETE
  USING (has_org_access(user_id, ARRAY['owner', 'editor']));
CREATE POLICY "Team can insert external trunks" ON public.external_sip_trunks FOR INSERT
  WITH CHECK (has_org_access(user_id, ARRAY['owner', 'editor']));
CREATE POLICY "Team can view external trunks" ON public.external_sip_trunks FOR SELECT
  USING (has_org_access(user_id, ARRAY['owner', 'editor', 'support']));
CREATE POLICY "Team can update external trunks" ON public.external_sip_trunks FOR UPDATE
  USING (has_org_access(user_id, ARRAY['owner', 'editor']))
  WITH CHECK (has_org_access(user_id, ARRAY['owner', 'editor']));

-- Fix 3: Add WITH CHECK to UPDATE policies that were missing it
-- (prevents column reassignment e.g. changing user_id on owned rows)

DROP POLICY IF EXISTS "Users can update own API keys" ON public.api_keys;
CREATE POLICY "Users can update own API keys" ON public.api_keys FOR UPDATE
  USING (auth.uid() = user_id AND is_phone_verified())
  WITH CHECK (auth.uid() = user_id AND is_phone_verified());

DROP POLICY IF EXISTS "batch_calls_update" ON public.batch_calls;
CREATE POLICY "batch_calls_update" ON public.batch_calls FOR UPDATE
  USING (auth.uid() = user_id AND is_phone_verified())
  WITH CHECK (auth.uid() = user_id AND is_phone_verified());

DROP POLICY IF EXISTS "Users can update own external numbers" ON public.external_sip_numbers;
CREATE POLICY "Users can update own external numbers" ON public.external_sip_numbers FOR UPDATE
  USING (auth.uid() = user_id AND is_phone_verified())
  WITH CHECK (auth.uid() = user_id AND is_phone_verified());

DROP POLICY IF EXISTS "Users can update own service numbers" ON public.service_numbers;
CREATE POLICY "Users can update own service numbers" ON public.service_numbers FOR UPDATE
  USING (auth.uid() = user_id AND is_phone_verified())
  WITH CHECK (auth.uid() = user_id AND is_phone_verified());

DROP POLICY IF EXISTS "Users can update own sms messages" ON public.sms_messages;
CREATE POLICY "Users can update own sms messages" ON public.sms_messages FOR UPDATE
  USING (auth.uid() = user_id AND is_phone_verified())
  WITH CHECK (auth.uid() = user_id AND is_phone_verified());

DROP POLICY IF EXISTS "Users can update own push subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users can update own push subscriptions" ON public.push_subscriptions FOR UPDATE
  USING (auth.uid() = user_id AND is_phone_verified())
  WITH CHECK (auth.uid() = user_id AND is_phone_verified());

DROP POLICY IF EXISTS "Users can cancel own pending scheduled actions" ON public.scheduled_actions;
CREATE POLICY "Users can cancel own pending scheduled actions" ON public.scheduled_actions FOR UPDATE
  USING (auth.uid() = user_id AND is_phone_verified() AND status = 'pending')
  WITH CHECK (auth.uid() = user_id AND is_phone_verified() AND status = 'pending');

DROP POLICY IF EXISTS "Org owners can update members" ON public.organization_members;
CREATE POLICY "Org owners can update members" ON public.organization_members FOR UPDATE
  USING (is_phone_verified() AND organization_id IN (SELECT id FROM organizations WHERE owner_id = auth.uid()))
  WITH CHECK (is_phone_verified() AND organization_id IN (SELECT id FROM organizations WHERE owner_id = auth.uid()));
