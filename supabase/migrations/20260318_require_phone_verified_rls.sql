-- Migration: require phone_verified for all user-facing RLS policies
-- Fixes: unverified users bypassing phone gate via direct API access
-- Critical: also blocks self-verification via users UPDATE

-- 1. Helper function
CREATE OR REPLACE FUNCTION public.is_phone_verified()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT COALESCE(
    (SELECT phone_verified FROM public.users WHERE id = auth.uid()),
    false
  )
$$;

-- 2. Update has_org_access to require phone verification
--    (covers: agent_configs, call_records, collected_call_data, contacts,
--    conversation_contexts, external_sip_trunks, knowledge_sources,
--    outbound_call_templates, service_numbers team policies, sms_messages team,
--    transfer_numbers, voices)
CREATE OR REPLACE FUNCTION public.has_org_access(resource_owner_id uuid, required_roles text[])
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  IF NOT is_phone_verified() THEN RETURN FALSE; END IF;
  IF auth.uid() = resource_owner_id THEN RETURN TRUE; END IF;
  RETURN EXISTS (
    SELECT 1 FROM organization_members om
    JOIN organizations o ON o.id = om.organization_id
    WHERE o.owner_id = resource_owner_id
      AND om.user_id = auth.uid()
      AND om.status = 'approved'
      AND om.role = ANY(required_roles)
  );
END;
$function$;

-- 3. Trigger to prevent unverified users from self-setting phone_verified = true
CREATE OR REPLACE FUNCTION public.prevent_self_phone_verify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.phone_verified = true AND (OLD.phone_verified IS DISTINCT FROM true) THEN
    IF COALESCE((current_setting('request.jwt.claims', true)::json->>'role'), '') != 'service_role' THEN
      RAISE EXCEPTION 'phone_verified cannot be set directly';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_self_phone_verify_trigger ON public.users;
CREATE TRIGGER prevent_self_phone_verify_trigger
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION prevent_self_phone_verify();

-- 4. Update remaining user-facing policies
--    (Tables covered by has_org_access are already fixed above)
--    Skipped (intentionally accessible to unverified users):
--      users, phone_verifications, sms_confirmations (verification flow)
--      area_codes, blog_posts, plan_limits, integration_providers,
--      mcp_server_catalog, skill_definitions, test_framework_config (public data)
--      admin_conversations, admin_messages (support chat during onboarding)
--      access_code_attempts (may be needed during verification)

-- api_keys
DROP POLICY IF EXISTS "Users can insert own API keys" ON public.api_keys;
DROP POLICY IF EXISTS "Users can view own API keys" ON public.api_keys;
DROP POLICY IF EXISTS "Users can update own API keys" ON public.api_keys;
CREATE POLICY "Users can insert own API keys" ON public.api_keys FOR INSERT WITH CHECK (auth.uid() = user_id AND is_phone_verified());
CREATE POLICY "Users can view own API keys" ON public.api_keys FOR SELECT USING (auth.uid() = user_id AND is_phone_verified());
CREATE POLICY "Users can update own API keys" ON public.api_keys FOR UPDATE USING (auth.uid() = user_id AND is_phone_verified());

-- agent_email_configs (user policy only; service role policy untouched)
DROP POLICY IF EXISTS "Users can manage their own agent email configs" ON public.agent_email_configs;
CREATE POLICY "Users can manage their own agent email configs" ON public.agent_email_configs
  FOR ALL USING (user_id = auth.uid() AND is_phone_verified()) WITH CHECK (user_id = auth.uid() AND is_phone_verified());

-- agent_skills (user policies only; service role policy untouched)
DROP POLICY IF EXISTS "Users can delete skills for own agents" ON public.agent_skills;
DROP POLICY IF EXISTS "Users can insert skills for own agents" ON public.agent_skills;
DROP POLICY IF EXISTS "Users can view skills for own agents" ON public.agent_skills;
DROP POLICY IF EXISTS "Users can update skills for own agents" ON public.agent_skills;
CREATE POLICY "Users can delete skills for own agents" ON public.agent_skills FOR DELETE
  USING (is_phone_verified() AND agent_id IN (SELECT id FROM agent_configs WHERE user_id = auth.uid()));
CREATE POLICY "Users can insert skills for own agents" ON public.agent_skills FOR INSERT
  WITH CHECK (is_phone_verified() AND user_id = auth.uid() AND agent_id IN (SELECT id FROM agent_configs WHERE user_id = auth.uid()));
CREATE POLICY "Users can view skills for own agents" ON public.agent_skills FOR SELECT
  USING (is_phone_verified() AND agent_id IN (SELECT id FROM agent_configs WHERE user_id = auth.uid()));
CREATE POLICY "Users can update skills for own agents" ON public.agent_skills FOR UPDATE
  USING (is_phone_verified() AND agent_id IN (SELECT id FROM agent_configs WHERE user_id = auth.uid()));

-- batch_calls (user policies only; service role policy untouched)
DROP POLICY IF EXISTS "batch_calls_delete" ON public.batch_calls;
DROP POLICY IF EXISTS "batch_calls_insert" ON public.batch_calls;
DROP POLICY IF EXISTS "batch_calls_select" ON public.batch_calls;
DROP POLICY IF EXISTS "batch_calls_update" ON public.batch_calls;
CREATE POLICY "batch_calls_delete" ON public.batch_calls FOR DELETE USING (auth.uid() = user_id AND is_phone_verified());
CREATE POLICY "batch_calls_insert" ON public.batch_calls FOR INSERT WITH CHECK (auth.uid() = user_id AND is_phone_verified());
CREATE POLICY "batch_calls_select" ON public.batch_calls FOR SELECT USING (auth.uid() = user_id AND is_phone_verified());
CREATE POLICY "batch_calls_update" ON public.batch_calls FOR UPDATE USING (auth.uid() = user_id AND is_phone_verified());

-- batch_call_recipients (user policies only; service role policy untouched)
DROP POLICY IF EXISTS "batch_recipients_delete" ON public.batch_call_recipients;
DROP POLICY IF EXISTS "batch_recipients_insert" ON public.batch_call_recipients;
DROP POLICY IF EXISTS "batch_recipients_select" ON public.batch_call_recipients;
DROP POLICY IF EXISTS "batch_recipients_update" ON public.batch_call_recipients;
CREATE POLICY "batch_recipients_delete" ON public.batch_call_recipients FOR DELETE
  USING (is_phone_verified() AND EXISTS (SELECT 1 FROM batch_calls WHERE id = batch_call_recipients.batch_id AND user_id = auth.uid()));
CREATE POLICY "batch_recipients_insert" ON public.batch_call_recipients FOR INSERT
  WITH CHECK (is_phone_verified() AND EXISTS (SELECT 1 FROM batch_calls WHERE id = batch_call_recipients.batch_id AND user_id = auth.uid()));
CREATE POLICY "batch_recipients_select" ON public.batch_call_recipients FOR SELECT
  USING (is_phone_verified() AND EXISTS (SELECT 1 FROM batch_calls WHERE id = batch_call_recipients.batch_id AND user_id = auth.uid()));
CREATE POLICY "batch_recipients_update" ON public.batch_call_recipients FOR UPDATE
  USING (is_phone_verified() AND EXISTS (SELECT 1 FROM batch_calls WHERE id = batch_call_recipients.batch_id AND user_id = auth.uid()));

-- call_state_logs (user policy only; service role policy untouched)
DROP POLICY IF EXISTS "Users can view their call state logs" ON public.call_state_logs;
CREATE POLICY "Users can view their call state logs" ON public.call_state_logs FOR SELECT
  USING (is_phone_verified() AND call_id IN (SELECT id FROM call_records WHERE user_id = auth.uid()));

-- call_whitelist
DROP POLICY IF EXISTS "Users can manage their own whitelist entries" ON public.call_whitelist;
CREATE POLICY "Users can manage their own whitelist entries" ON public.call_whitelist
  FOR ALL USING (user_id = auth.uid() AND is_phone_verified());

-- chat_sessions
DROP POLICY IF EXISTS "Users view own sessions" ON public.chat_sessions;
CREATE POLICY "Users view own sessions" ON public.chat_sessions FOR SELECT USING (auth.uid() = user_id AND is_phone_verified());

-- chat_messages
DROP POLICY IF EXISTS "Users insert messages to own sessions" ON public.chat_messages;
DROP POLICY IF EXISTS "Users view own messages" ON public.chat_messages;
CREATE POLICY "Users insert messages to own sessions" ON public.chat_messages FOR INSERT
  WITH CHECK (is_phone_verified() AND session_id IN (SELECT id FROM chat_sessions WHERE user_id = auth.uid()));
CREATE POLICY "Users view own messages" ON public.chat_messages FOR SELECT
  USING (is_phone_verified() AND session_id IN (SELECT id FROM chat_sessions WHERE user_id = auth.uid()));

-- chat_widgets
DROP POLICY IF EXISTS "Users manage own widgets" ON public.chat_widgets;
CREATE POLICY "Users manage own widgets" ON public.chat_widgets FOR ALL USING (auth.uid() = user_id AND is_phone_verified());

-- crawl_jobs
DROP POLICY IF EXISTS "Users can view their own crawl jobs" ON public.crawl_jobs;
CREATE POLICY "Users can view their own crawl jobs" ON public.crawl_jobs FOR SELECT
  USING (is_phone_verified() AND knowledge_source_id IN (SELECT id FROM knowledge_sources WHERE user_id = auth.uid()));

-- credit_transactions (user policy only; admin policy untouched)
DROP POLICY IF EXISTS "Users can view own credit transactions" ON public.credit_transactions;
CREATE POLICY "Users can view own credit transactions" ON public.credit_transactions FOR SELECT
  USING (auth.uid() = user_id AND is_phone_verified());

-- custom_functions (user policies only; service role policy untouched)
DROP POLICY IF EXISTS "Users can delete their own custom functions" ON public.custom_functions;
DROP POLICY IF EXISTS "Users can insert their own custom functions" ON public.custom_functions;
DROP POLICY IF EXISTS "Users can view their own custom functions" ON public.custom_functions;
DROP POLICY IF EXISTS "Users can update their own custom functions" ON public.custom_functions;
CREATE POLICY "Users can delete their own custom functions" ON public.custom_functions FOR DELETE USING (user_id = auth.uid() AND is_phone_verified());
CREATE POLICY "Users can insert their own custom functions" ON public.custom_functions FOR INSERT WITH CHECK (user_id = auth.uid() AND is_phone_verified());
CREATE POLICY "Users can view their own custom functions" ON public.custom_functions FOR SELECT USING (user_id = auth.uid() AND is_phone_verified());
CREATE POLICY "Users can update their own custom functions" ON public.custom_functions FOR UPDATE
  USING (user_id = auth.uid() AND is_phone_verified()) WITH CHECK (user_id = auth.uid() AND is_phone_verified());

-- dynamic_variables
DROP POLICY IF EXISTS "Users can manage own dynamic variables" ON public.dynamic_variables;
CREATE POLICY "Users can manage own dynamic variables" ON public.dynamic_variables
  FOR ALL USING (auth.uid() = user_id AND is_phone_verified());

-- email_messages (user policy only; service role policy untouched)
DROP POLICY IF EXISTS "Users manage own email_messages" ON public.email_messages;
CREATE POLICY "Users manage own email_messages" ON public.email_messages
  FOR ALL USING (user_id = auth.uid() AND is_phone_verified()) WITH CHECK (user_id = auth.uid() AND is_phone_verified());

-- external_sip_numbers
DROP POLICY IF EXISTS "Users can delete own external numbers" ON public.external_sip_numbers;
DROP POLICY IF EXISTS "Users can insert own external numbers" ON public.external_sip_numbers;
DROP POLICY IF EXISTS "Users can view own external numbers" ON public.external_sip_numbers;
DROP POLICY IF EXISTS "Users can update own external numbers" ON public.external_sip_numbers;
CREATE POLICY "Users can delete own external numbers" ON public.external_sip_numbers FOR DELETE USING (auth.uid() = user_id AND is_phone_verified());
CREATE POLICY "Users can insert own external numbers" ON public.external_sip_numbers FOR INSERT WITH CHECK (auth.uid() = user_id AND is_phone_verified());
CREATE POLICY "Users can view own external numbers" ON public.external_sip_numbers FOR SELECT USING (auth.uid() = user_id AND is_phone_verified());
CREATE POLICY "Users can update own external numbers" ON public.external_sip_numbers FOR UPDATE USING (auth.uid() = user_id AND is_phone_verified());

-- integration_tool_logs (user policies only; service role policy untouched)
DROP POLICY IF EXISTS "Users can insert their own tool logs" ON public.integration_tool_logs;
DROP POLICY IF EXISTS "Users can view their own tool logs" ON public.integration_tool_logs;
CREATE POLICY "Users can insert their own tool logs" ON public.integration_tool_logs FOR INSERT WITH CHECK (user_id = auth.uid() AND is_phone_verified());
CREATE POLICY "Users can view their own tool logs" ON public.integration_tool_logs FOR SELECT USING (user_id = auth.uid() AND is_phone_verified());

-- knowledge_chunks
DROP POLICY IF EXISTS "Users can view chunks from their knowledge sources" ON public.knowledge_chunks;
CREATE POLICY "Users can view chunks from their knowledge sources" ON public.knowledge_chunks FOR SELECT
  USING (is_phone_verified() AND knowledge_source_id IN (SELECT id FROM knowledge_sources WHERE user_id = auth.uid()));

-- notification_preferences
DROP POLICY IF EXISTS "Users can insert own notification preferences" ON public.notification_preferences;
DROP POLICY IF EXISTS "Users can view own notification preferences" ON public.notification_preferences;
DROP POLICY IF EXISTS "Users can update own notification preferences" ON public.notification_preferences;
CREATE POLICY "Users can insert own notification preferences" ON public.notification_preferences FOR INSERT WITH CHECK (auth.uid() = user_id AND is_phone_verified());
CREATE POLICY "Users can view own notification preferences" ON public.notification_preferences FOR SELECT USING (auth.uid() = user_id AND is_phone_verified());
CREATE POLICY "Users can update own notification preferences" ON public.notification_preferences FOR UPDATE USING (auth.uid() = user_id AND is_phone_verified());

-- numbers_to_delete
DROP POLICY IF EXISTS "Users can insert own numbers to delete" ON public.numbers_to_delete;
DROP POLICY IF EXISTS "Users can view own numbers to delete" ON public.numbers_to_delete;
DROP POLICY IF EXISTS "Users can update own numbers to delete" ON public.numbers_to_delete;
CREATE POLICY "Users can insert own numbers to delete" ON public.numbers_to_delete FOR INSERT WITH CHECK (auth.uid() = user_id AND is_phone_verified());
CREATE POLICY "Users can view own numbers to delete" ON public.numbers_to_delete FOR SELECT USING (auth.uid() = user_id AND is_phone_verified());
CREATE POLICY "Users can update own numbers to delete" ON public.numbers_to_delete FOR UPDATE USING (auth.uid() = user_id AND is_phone_verified());

-- oauth_states
DROP POLICY IF EXISTS "Users can view own oauth states" ON public.oauth_states;
CREATE POLICY "Users can view own oauth states" ON public.oauth_states FOR SELECT USING (auth.uid() = user_id AND is_phone_verified());

-- organization_members
DROP POLICY IF EXISTS "Org owners can delete members" ON public.organization_members;
DROP POLICY IF EXISTS "Org owners can invite members" ON public.organization_members;
DROP POLICY IF EXISTS "Org owners can view all members" ON public.organization_members;
DROP POLICY IF EXISTS "Org owners can update members" ON public.organization_members;
CREATE POLICY "Org owners can delete members" ON public.organization_members FOR DELETE
  USING (is_phone_verified() AND organization_id IN (SELECT id FROM organizations WHERE owner_id = auth.uid()));
CREATE POLICY "Org owners can invite members" ON public.organization_members FOR INSERT
  WITH CHECK (is_phone_verified() AND organization_id IN (SELECT id FROM organizations WHERE owner_id = auth.uid()));
CREATE POLICY "Org owners can view all members" ON public.organization_members FOR SELECT
  USING (is_phone_verified() AND (EXISTS (SELECT 1 FROM organizations WHERE id = organization_members.organization_id AND owner_id = auth.uid()) OR user_id = auth.uid()));
CREATE POLICY "Org owners can update members" ON public.organization_members FOR UPDATE
  USING (is_phone_verified() AND organization_id IN (SELECT id FROM organizations WHERE owner_id = auth.uid()));

-- organizations
DROP POLICY IF EXISTS "Users can insert organizations" ON public.organizations;
DROP POLICY IF EXISTS "Users can view own organizations" ON public.organizations;
DROP POLICY IF EXISTS "Members can view their organizations" ON public.organizations;
DROP POLICY IF EXISTS "Owners can update own organizations" ON public.organizations;
CREATE POLICY "Users can insert organizations" ON public.organizations FOR INSERT WITH CHECK (owner_id = auth.uid() AND is_phone_verified());
CREATE POLICY "Users can view own organizations" ON public.organizations FOR SELECT USING (owner_id = auth.uid() AND is_phone_verified());
CREATE POLICY "Members can view their organizations" ON public.organizations FOR SELECT
  USING (is_phone_verified() AND id IN (SELECT current_organization_id FROM users WHERE id = auth.uid()));
CREATE POLICY "Owners can update own organizations" ON public.organizations FOR UPDATE USING (owner_id = auth.uid() AND is_phone_verified());

-- push_subscriptions
DROP POLICY IF EXISTS "Users can delete own push subscriptions" ON public.push_subscriptions;
DROP POLICY IF EXISTS "Users can insert own push subscriptions" ON public.push_subscriptions;
DROP POLICY IF EXISTS "Users can view own push subscriptions" ON public.push_subscriptions;
DROP POLICY IF EXISTS "Users can update own push subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users can delete own push subscriptions" ON public.push_subscriptions FOR DELETE USING (auth.uid() = user_id AND is_phone_verified());
CREATE POLICY "Users can insert own push subscriptions" ON public.push_subscriptions FOR INSERT WITH CHECK (auth.uid() = user_id AND is_phone_verified());
CREATE POLICY "Users can view own push subscriptions" ON public.push_subscriptions FOR SELECT USING (auth.uid() = user_id AND is_phone_verified());
CREATE POLICY "Users can update own push subscriptions" ON public.push_subscriptions FOR UPDATE USING (auth.uid() = user_id AND is_phone_verified());

-- referral_rewards (user policy only; service role policy untouched)
DROP POLICY IF EXISTS "Users can view own referral rewards" ON public.referral_rewards;
CREATE POLICY "Users can view own referral rewards" ON public.referral_rewards FOR SELECT
  USING (is_phone_verified() AND (auth.uid() = referrer_id OR auth.uid() = referred_id));

-- scheduled_actions (user policies only; service role policy untouched)
DROP POLICY IF EXISTS "Users can insert own scheduled actions" ON public.scheduled_actions;
DROP POLICY IF EXISTS "Users can view own scheduled actions" ON public.scheduled_actions;
DROP POLICY IF EXISTS "Users can cancel own pending scheduled actions" ON public.scheduled_actions;
CREATE POLICY "Users can insert own scheduled actions" ON public.scheduled_actions FOR INSERT WITH CHECK (auth.uid() = user_id AND is_phone_verified());
CREATE POLICY "Users can view own scheduled actions" ON public.scheduled_actions FOR SELECT USING (auth.uid() = user_id AND is_phone_verified());
CREATE POLICY "Users can cancel own pending scheduled actions" ON public.scheduled_actions FOR UPDATE
  USING (auth.uid() = user_id AND is_phone_verified() AND status = 'pending');

-- semantic_match_actions (user policy only; service role policy untouched)
DROP POLICY IF EXISTS "users_own_actions" ON public.semantic_match_actions;
CREATE POLICY "users_own_actions" ON public.semantic_match_actions
  FOR ALL USING (user_id = auth.uid() AND is_phone_verified()) WITH CHECK (user_id = auth.uid() AND is_phone_verified());

-- service_numbers (user-direct policies; team policies covered by has_org_access)
DROP POLICY IF EXISTS "Users can delete own service numbers" ON public.service_numbers;
DROP POLICY IF EXISTS "Users can insert own service numbers" ON public.service_numbers;
DROP POLICY IF EXISTS "Users can view own service numbers" ON public.service_numbers;
DROP POLICY IF EXISTS "Users can update own service numbers" ON public.service_numbers;
CREATE POLICY "Users can delete own service numbers" ON public.service_numbers FOR DELETE USING (auth.uid() = user_id AND is_phone_verified());
CREATE POLICY "Users can insert own service numbers" ON public.service_numbers FOR INSERT WITH CHECK (auth.uid() = user_id AND is_phone_verified());
CREATE POLICY "Users can view own service numbers" ON public.service_numbers FOR SELECT USING (auth.uid() = user_id AND is_phone_verified());
CREATE POLICY "Users can update own service numbers" ON public.service_numbers FOR UPDATE USING (auth.uid() = user_id AND is_phone_verified());

-- skill_executions (user policies only; service role policy untouched)
DROP POLICY IF EXISTS "Users can view executions for own agents" ON public.skill_executions;
DROP POLICY IF EXISTS "Users can cancel pending executions for own agents" ON public.skill_executions;
CREATE POLICY "Users can view executions for own agents" ON public.skill_executions FOR SELECT
  USING (is_phone_verified() AND agent_id IN (SELECT id FROM agent_configs WHERE user_id = auth.uid()));
CREATE POLICY "Users can cancel pending executions for own agents" ON public.skill_executions FOR UPDATE
  USING (is_phone_verified() AND agent_id IN (SELECT id FROM agent_configs WHERE user_id = auth.uid()) AND status = 'pending');

-- sms_messages (user-direct policies; team policies covered by has_org_access)
DROP POLICY IF EXISTS "Users can delete own sms messages" ON public.sms_messages;
DROP POLICY IF EXISTS "Users can insert own sms messages" ON public.sms_messages;
DROP POLICY IF EXISTS "Users can view own sms messages" ON public.sms_messages;
DROP POLICY IF EXISTS "Users can update own sms messages" ON public.sms_messages;
CREATE POLICY "Users can delete own sms messages" ON public.sms_messages FOR DELETE USING (auth.uid() = user_id AND is_phone_verified());
CREATE POLICY "Users can insert own sms messages" ON public.sms_messages FOR INSERT WITH CHECK (auth.uid() = user_id AND is_phone_verified());
CREATE POLICY "Users can view own sms messages" ON public.sms_messages FOR SELECT USING (auth.uid() = user_id AND is_phone_verified());
CREATE POLICY "Users can update own sms messages" ON public.sms_messages FOR UPDATE USING (auth.uid() = user_id AND is_phone_verified());

-- sms_templates
DROP POLICY IF EXISTS "Users can manage own templates" ON public.sms_templates;
CREATE POLICY "Users can manage own templates" ON public.sms_templates
  FOR ALL USING (auth.uid() = user_id AND is_phone_verified());

-- test_cases / test_runs / test_suites
DROP POLICY IF EXISTS "Users manage own test cases" ON public.test_cases;
DROP POLICY IF EXISTS "Users manage own test runs" ON public.test_runs;
DROP POLICY IF EXISTS "Users manage own test suites" ON public.test_suites;
CREATE POLICY "Users manage own test cases" ON public.test_cases FOR ALL USING (auth.uid() = user_id AND is_phone_verified());
CREATE POLICY "Users manage own test runs" ON public.test_runs FOR ALL USING (auth.uid() = user_id AND is_phone_verified());
CREATE POLICY "Users manage own test suites" ON public.test_suites FOR ALL USING (auth.uid() = user_id AND is_phone_verified());

-- usage_history (user policy only; admin policy untouched)
DROP POLICY IF EXISTS "Users can view own usage history" ON public.usage_history;
CREATE POLICY "Users can view own usage history" ON public.usage_history FOR SELECT USING (auth.uid() = user_id AND is_phone_verified());

-- user_integrations (user policies only; service role policy untouched)
DROP POLICY IF EXISTS "Users can delete their own integrations" ON public.user_integrations;
DROP POLICY IF EXISTS "Users can insert their own integrations" ON public.user_integrations;
DROP POLICY IF EXISTS "Users can view their own integrations" ON public.user_integrations;
DROP POLICY IF EXISTS "Users can update their own integrations" ON public.user_integrations;
CREATE POLICY "Users can delete their own integrations" ON public.user_integrations FOR DELETE USING (user_id = auth.uid() AND is_phone_verified());
CREATE POLICY "Users can insert their own integrations" ON public.user_integrations FOR INSERT WITH CHECK (user_id = auth.uid() AND is_phone_verified());
CREATE POLICY "Users can view their own integrations" ON public.user_integrations FOR SELECT USING (user_id = auth.uid() AND is_phone_verified());
CREATE POLICY "Users can update their own integrations" ON public.user_integrations FOR UPDATE
  USING (user_id = auth.uid() AND is_phone_verified()) WITH CHECK (user_id = auth.uid() AND is_phone_verified());

-- user_mcp_connections (user policies only; service role policy untouched)
DROP POLICY IF EXISTS "Users can delete their own MCP connections" ON public.user_mcp_connections;
DROP POLICY IF EXISTS "Users can insert their own MCP connections" ON public.user_mcp_connections;
DROP POLICY IF EXISTS "Users can view their own MCP connections" ON public.user_mcp_connections;
DROP POLICY IF EXISTS "Users can update their own MCP connections" ON public.user_mcp_connections;
CREATE POLICY "Users can delete their own MCP connections" ON public.user_mcp_connections FOR DELETE USING (auth.uid() = user_id AND is_phone_verified());
CREATE POLICY "Users can insert their own MCP connections" ON public.user_mcp_connections FOR INSERT WITH CHECK (auth.uid() = user_id AND is_phone_verified());
CREATE POLICY "Users can view their own MCP connections" ON public.user_mcp_connections FOR SELECT USING (auth.uid() = user_id AND is_phone_verified());
CREATE POLICY "Users can update their own MCP connections" ON public.user_mcp_connections FOR UPDATE USING (auth.uid() = user_id AND is_phone_verified());

-- user_mcp_servers (user policies only; service role policy untouched)
DROP POLICY IF EXISTS "Users can delete their own MCP servers" ON public.user_mcp_servers;
DROP POLICY IF EXISTS "Users can insert their own MCP servers" ON public.user_mcp_servers;
DROP POLICY IF EXISTS "Users can view their own MCP servers" ON public.user_mcp_servers;
DROP POLICY IF EXISTS "Users can update their own MCP servers" ON public.user_mcp_servers;
CREATE POLICY "Users can delete their own MCP servers" ON public.user_mcp_servers FOR DELETE USING (auth.uid() = user_id AND is_phone_verified());
CREATE POLICY "Users can insert their own MCP servers" ON public.user_mcp_servers FOR INSERT WITH CHECK (auth.uid() = user_id AND is_phone_verified());
CREATE POLICY "Users can view their own MCP servers" ON public.user_mcp_servers FOR SELECT USING (auth.uid() = user_id AND is_phone_verified());
CREATE POLICY "Users can update their own MCP servers" ON public.user_mcp_servers FOR UPDATE USING (auth.uid() = user_id AND is_phone_verified());

-- whatsapp_accounts
DROP POLICY IF EXISTS "Users can delete own whatsapp accounts" ON public.whatsapp_accounts;
DROP POLICY IF EXISTS "Users can insert own whatsapp accounts" ON public.whatsapp_accounts;
DROP POLICY IF EXISTS "Users can view own whatsapp accounts" ON public.whatsapp_accounts;
DROP POLICY IF EXISTS "Users can update own whatsapp accounts" ON public.whatsapp_accounts;
CREATE POLICY "Users can delete own whatsapp accounts" ON public.whatsapp_accounts FOR DELETE USING (auth.uid() = user_id AND is_phone_verified());
CREATE POLICY "Users can insert own whatsapp accounts" ON public.whatsapp_accounts FOR INSERT WITH CHECK (auth.uid() = user_id AND is_phone_verified());
CREATE POLICY "Users can view own whatsapp accounts" ON public.whatsapp_accounts FOR SELECT USING (auth.uid() = user_id AND is_phone_verified());
CREATE POLICY "Users can update own whatsapp accounts" ON public.whatsapp_accounts FOR UPDATE USING (auth.uid() = user_id AND is_phone_verified());

-- webhook_deliveries
DROP POLICY IF EXISTS "Users can view own webhook deliveries" ON public.webhook_deliveries;
CREATE POLICY "Users can view own webhook deliveries" ON public.webhook_deliveries FOR SELECT
  USING (is_phone_verified() AND api_key_id IN (SELECT id FROM api_keys WHERE user_id = auth.uid()));
