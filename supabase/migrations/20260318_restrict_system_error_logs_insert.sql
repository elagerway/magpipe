-- Restrict system_error_logs INSERT to service_role only
-- Previously: WITH CHECK (true) with no TO clause = any authenticated user could insert junk
DROP POLICY IF EXISTS "Service role can insert error logs" ON public.system_error_logs;
CREATE POLICY "Service role can insert error logs" ON public.system_error_logs
  FOR INSERT TO service_role WITH CHECK (true);
