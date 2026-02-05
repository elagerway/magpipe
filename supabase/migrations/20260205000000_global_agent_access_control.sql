-- Add can_edit_global_agent permission to users table
-- This allows admins to grant specific users permission to edit the global agent

-- Add can_edit_global_agent column
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS can_edit_global_agent BOOLEAN DEFAULT false;

-- Add index for efficient querying
CREATE INDEX IF NOT EXISTS idx_users_can_edit_global_agent
  ON public.users(can_edit_global_agent)
  WHERE can_edit_global_agent = true;

-- Update the role constraint to include 'god' role
-- First drop the existing constraint if it exists
ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_role_check;

-- Add updated constraint with 'god' role
ALTER TABLE public.users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('user', 'admin', 'support', 'god'));

-- Comments for documentation
COMMENT ON COLUMN public.users.can_edit_global_agent IS 'If true, user can view and edit the global platform agent configuration (god role always has access regardless of this flag)';
