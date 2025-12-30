-- Stripe Billing Integration Migration
-- Adds Stripe customer and subscription fields to users table

-- Add Stripe columns to users table
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_status TEXT CHECK (stripe_subscription_status IN ('active', 'past_due', 'canceled', 'unpaid', 'trialing', 'incomplete', 'incomplete_expired', 'paused')) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS stripe_current_period_end TIMESTAMPTZ;

-- Create index for Stripe customer lookups
CREATE INDEX IF NOT EXISTS idx_users_stripe_customer ON public.users(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_users_stripe_subscription ON public.users(stripe_subscription_id);

-- Comments for documentation
COMMENT ON COLUMN public.users.stripe_customer_id IS 'Stripe customer ID (cus_xxx)';
COMMENT ON COLUMN public.users.stripe_subscription_id IS 'Stripe subscription ID (sub_xxx)';
COMMENT ON COLUMN public.users.stripe_subscription_status IS 'Current Stripe subscription status';
COMMENT ON COLUMN public.users.stripe_current_period_end IS 'End of current billing period';
