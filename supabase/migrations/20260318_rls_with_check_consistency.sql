-- Fix remaining UPDATE policies missing WITH CHECK
-- and FOR ALL policies missing explicit WITH CHECK for consistency

-- agent_skills UPDATE
DROP POLICY IF EXISTS "Users can update skills for own agents" ON public.agent_skills;
CREATE POLICY "Users can update skills for own agents" ON public.agent_skills FOR UPDATE
  USING (is_phone_verified() AND agent_id IN (SELECT id FROM agent_configs WHERE user_id = auth.uid()))
  WITH CHECK (is_phone_verified() AND agent_id IN (SELECT id FROM agent_configs WHERE user_id = auth.uid()));

-- batch_call_recipients UPDATE
DROP POLICY IF EXISTS "batch_recipients_update" ON public.batch_call_recipients;
CREATE POLICY "batch_recipients_update" ON public.batch_call_recipients FOR UPDATE
  USING (is_phone_verified() AND EXISTS (SELECT 1 FROM batch_calls WHERE id = batch_call_recipients.batch_id AND user_id = auth.uid()))
  WITH CHECK (is_phone_verified() AND EXISTS (SELECT 1 FROM batch_calls WHERE id = batch_call_recipients.batch_id AND user_id = auth.uid()));

-- notification_preferences UPDATE
DROP POLICY IF EXISTS "Users can update own notification preferences" ON public.notification_preferences;
CREATE POLICY "Users can update own notification preferences" ON public.notification_preferences FOR UPDATE
  USING (auth.uid() = user_id AND is_phone_verified())
  WITH CHECK (auth.uid() = user_id AND is_phone_verified());

-- numbers_to_delete UPDATE
DROP POLICY IF EXISTS "Users can update own numbers to delete" ON public.numbers_to_delete;
CREATE POLICY "Users can update own numbers to delete" ON public.numbers_to_delete FOR UPDATE
  USING (auth.uid() = user_id AND is_phone_verified())
  WITH CHECK (auth.uid() = user_id AND is_phone_verified());

-- organizations UPDATE
DROP POLICY IF EXISTS "Owners can update own organizations" ON public.organizations;
CREATE POLICY "Owners can update own organizations" ON public.organizations FOR UPDATE
  USING (owner_id = auth.uid() AND is_phone_verified())
  WITH CHECK (owner_id = auth.uid() AND is_phone_verified());

-- skill_executions UPDATE
DROP POLICY IF EXISTS "Users can cancel pending executions for own agents" ON public.skill_executions;
CREATE POLICY "Users can cancel pending executions for own agents" ON public.skill_executions FOR UPDATE
  USING (is_phone_verified() AND agent_id IN (SELECT id FROM agent_configs WHERE user_id = auth.uid()) AND status = 'pending')
  WITH CHECK (is_phone_verified() AND agent_id IN (SELECT id FROM agent_configs WHERE user_id = auth.uid()) AND status = 'pending');

-- user_mcp_connections UPDATE
DROP POLICY IF EXISTS "Users can update their own MCP connections" ON public.user_mcp_connections;
CREATE POLICY "Users can update their own MCP connections" ON public.user_mcp_connections FOR UPDATE
  USING (auth.uid() = user_id AND is_phone_verified())
  WITH CHECK (auth.uid() = user_id AND is_phone_verified());

-- user_mcp_servers UPDATE
DROP POLICY IF EXISTS "Users can update their own MCP servers" ON public.user_mcp_servers;
CREATE POLICY "Users can update their own MCP servers" ON public.user_mcp_servers FOR UPDATE
  USING (auth.uid() = user_id AND is_phone_verified())
  WITH CHECK (auth.uid() = user_id AND is_phone_verified());

-- whatsapp_accounts UPDATE
DROP POLICY IF EXISTS "Users can update own whatsapp accounts" ON public.whatsapp_accounts;
CREATE POLICY "Users can update own whatsapp accounts" ON public.whatsapp_accounts FOR UPDATE
  USING (auth.uid() = user_id AND is_phone_verified())
  WITH CHECK (auth.uid() = user_id AND is_phone_verified());

-- FOR ALL policies: add explicit WITH CHECK for consistency
DROP POLICY IF EXISTS "Users can manage their own whitelist entries" ON public.call_whitelist;
CREATE POLICY "Users can manage their own whitelist entries" ON public.call_whitelist
  FOR ALL USING (user_id = auth.uid() AND is_phone_verified())
  WITH CHECK (user_id = auth.uid() AND is_phone_verified());

DROP POLICY IF EXISTS "Users manage own widgets" ON public.chat_widgets;
CREATE POLICY "Users manage own widgets" ON public.chat_widgets
  FOR ALL USING (auth.uid() = user_id AND is_phone_verified())
  WITH CHECK (auth.uid() = user_id AND is_phone_verified());

DROP POLICY IF EXISTS "Users can manage own dynamic variables" ON public.dynamic_variables;
CREATE POLICY "Users can manage own dynamic variables" ON public.dynamic_variables
  FOR ALL USING (auth.uid() = user_id AND is_phone_verified())
  WITH CHECK (auth.uid() = user_id AND is_phone_verified());

DROP POLICY IF EXISTS "Users can manage own templates" ON public.sms_templates;
CREATE POLICY "Users can manage own templates" ON public.sms_templates
  FOR ALL USING (auth.uid() = user_id AND is_phone_verified())
  WITH CHECK (auth.uid() = user_id AND is_phone_verified());
