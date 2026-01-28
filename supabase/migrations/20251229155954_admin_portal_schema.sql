-- Admin Portal Schema Migration
-- Adds role, plan, account status columns to users table
-- Creates impersonation tokens and audit log tables

-- Add admin columns to users table
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS role TEXT CHECK (role IN ('user', 'admin', 'support')) DEFAULT 'user',
  ADD COLUMN IF NOT EXISTS plan TEXT CHECK (plan IN ('free', 'pro')) DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS account_status TEXT CHECK (account_status IN ('active', 'suspended', 'banned')) DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS suspended_reason TEXT,
  ADD COLUMN IF NOT EXISTS banned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS banned_reason TEXT;

-- Create index for role-based queries
CREATE INDEX IF NOT EXISTS idx_users_role ON public.users(role);
CREATE INDEX IF NOT EXISTS idx_users_plan ON public.users(plan);
CREATE INDEX IF NOT EXISTS idx_users_account_status ON public.users(account_status);

-- Impersonation tokens table
CREATE TABLE IF NOT EXISTS public.admin_impersonation_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  target_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for token lookup
CREATE INDEX IF NOT EXISTS idx_impersonation_tokens_token ON public.admin_impersonation_tokens(token);
CREATE INDEX IF NOT EXISTS idx_impersonation_tokens_expires ON public.admin_impersonation_tokens(expires_at);

-- Enable RLS on impersonation tokens
ALTER TABLE public.admin_impersonation_tokens ENABLE ROW LEVEL SECURITY;

-- Only admins can create/view impersonation tokens
DROP POLICY IF EXISTS "Admins can manage impersonation tokens" ON public.admin_impersonation_tokens;
CREATE POLICY "Admins can manage impersonation tokens"
  ON public.admin_impersonation_tokens
  FOR ALL
  USING (
    auth.uid() IN (SELECT id FROM public.users WHERE role IN ('admin', 'support'))
  );

-- Audit log table
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID REFERENCES public.users(id),
  target_user_id UUID REFERENCES public.users(id),
  action TEXT NOT NULL,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for audit log queries
CREATE INDEX IF NOT EXISTS idx_audit_log_admin ON public.admin_audit_log(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_target ON public.admin_audit_log(target_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON public.admin_audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON public.admin_audit_log(created_at DESC);

-- Enable RLS on audit log
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

-- Only admins can view audit log
DROP POLICY IF EXISTS "Admins can view audit log" ON public.admin_audit_log;
CREATE POLICY "Admins can view audit log"
  ON public.admin_audit_log
  FOR SELECT
  USING (
    auth.uid() IN (SELECT id FROM public.users WHERE role IN ('admin', 'support'))
  );

-- Only service role can insert audit log (via Edge Functions)
DROP POLICY IF EXISTS "Service role can insert audit log" ON public.admin_audit_log;
CREATE POLICY "Service role can insert audit log"
  ON public.admin_audit_log
  FOR INSERT
  WITH CHECK (true);

-- Update the existing users RLS policy to allow admins to view all users
-- First drop the existing policy
DROP POLICY IF EXISTS "Users can view own record" ON public.users;
DROP POLICY IF EXISTS "Users can view own record or admins can view all" ON public.users;

-- Create new policy allowing admins to view all, users to view own
CREATE POLICY "Users can view own record or admins can view all"
  ON public.users
  FOR SELECT
  USING (
    auth.uid() = id
    OR auth.uid() IN (SELECT id FROM public.users WHERE role IN ('admin', 'support'))
  );

-- Allow admins to update any user record
DROP POLICY IF EXISTS "Users can update own record" ON public.users;
DROP POLICY IF EXISTS "Users can update own or admins can update all" ON public.users;

CREATE POLICY "Users can update own or admins can update all"
  ON public.users
  FOR UPDATE
  USING (
    auth.uid() = id
    OR auth.uid() IN (SELECT id FROM public.users WHERE role IN ('admin', 'support'))
  );

-- Comments for documentation
COMMENT ON COLUMN public.users.role IS 'User role: user, admin, or support';
COMMENT ON COLUMN public.users.plan IS 'Subscription plan: free or pro';
COMMENT ON COLUMN public.users.account_status IS 'Account status: active, suspended, or banned';
COMMENT ON COLUMN public.users.suspended_at IS 'Timestamp when account was suspended';
COMMENT ON COLUMN public.users.suspended_reason IS 'Reason for suspension';
COMMENT ON COLUMN public.users.banned_at IS 'Timestamp when account was banned';
COMMENT ON COLUMN public.users.banned_reason IS 'Reason for ban';

COMMENT ON TABLE public.admin_impersonation_tokens IS 'Tokens for admin impersonation of user accounts';
COMMENT ON TABLE public.admin_audit_log IS 'Audit trail of admin actions';
