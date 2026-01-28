-- Fix infinite recursion in users RLS policies
-- The issue: policies were querying public.users to check admin role,
-- which triggered the same policy, causing infinite recursion.
-- Solution: Use a SECURITY DEFINER function to bypass RLS when checking admin status.

-- Create a function to check if current user is admin (bypasses RLS)
CREATE OR REPLACE FUNCTION public.is_admin_or_support()
RETURNS BOOLEAN AS $$
DECLARE
  user_role TEXT;
BEGIN
  -- Use SECURITY DEFINER to bypass RLS
  SELECT role INTO user_role
  FROM public.users
  WHERE id = auth.uid();
  
  RETURN user_role IN ('admin', 'support');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Drop existing problematic policies
DROP POLICY IF EXISTS "Users can view own record or admins can view all" ON public.users;
DROP POLICY IF EXISTS "Users can update own or admins can update all" ON public.users;
DROP POLICY IF EXISTS "Users can view own record" ON public.users;
DROP POLICY IF EXISTS "Users can update own record" ON public.users;
DROP POLICY IF EXISTS "Users can insert own record" ON public.users;

-- Recreate policies using the safe function
CREATE POLICY "Users can view own record or admins can view all"
  ON public.users
  FOR SELECT
  USING (
    auth.uid() = id
    OR public.is_admin_or_support()
  );

CREATE POLICY "Users can update own or admins can update all"
  ON public.users
  FOR UPDATE
  USING (
    auth.uid() = id
    OR public.is_admin_or_support()
  );

CREATE POLICY "Users can insert own record"
  ON public.users
  FOR INSERT
  WITH CHECK (auth.uid() = id);
