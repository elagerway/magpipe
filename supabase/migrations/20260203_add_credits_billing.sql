-- Credits-Based Billing Migration
-- Replaces subscription model with usage-based credits system
-- Users pay for what they use at $0.07/minute voice, $0.001/message SMS, etc.

-- Add credits columns to users table
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS credits_balance DECIMAL(10,4) DEFAULT 20.00,  -- $20 free on signup
  ADD COLUMN IF NOT EXISTS credits_used_this_period DECIMAL(10,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS has_payment_method BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_recharge_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_recharge_amount DECIMAL(10,2) DEFAULT 50.00,
  ADD COLUMN IF NOT EXISTS auto_recharge_threshold DECIMAL(10,2) DEFAULT 5.00;

-- Create index for credits queries
CREATE INDEX IF NOT EXISTS idx_users_credits ON public.users(credits_balance);
CREATE INDEX IF NOT EXISTS idx_users_auto_recharge ON public.users(auto_recharge_enabled) WHERE auto_recharge_enabled = true;

-- Credit transaction history table for auditing
CREATE TABLE IF NOT EXISTS public.credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  amount DECIMAL(10,4) NOT NULL,  -- Positive for credits added, negative for deductions
  balance_after DECIMAL(10,4) NOT NULL,  -- Balance after this transaction
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('purchase', 'deduction', 'auto_recharge', 'refund', 'bonus', 'adjustment')),
  description TEXT,  -- Human-readable description (e.g., "Voice call - 5 minutes", "SMS - 3 messages")
  reference_type TEXT,  -- 'call', 'sms', 'stripe_payment', etc.
  reference_id TEXT,  -- call_record.id, sms_message.id, stripe_payment_intent, etc.
  metadata JSONB DEFAULT '{}',  -- Additional data (rates used, duration, etc.)
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for credit transactions
CREATE INDEX IF NOT EXISTS idx_credit_transactions_user ON public.credit_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_type ON public.credit_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_created ON public.credit_transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_reference ON public.credit_transactions(reference_type, reference_id);

-- Enable RLS on credit_transactions
ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;

-- Users can view their own transactions
DROP POLICY IF EXISTS "Users can view own credit transactions" ON public.credit_transactions;
CREATE POLICY "Users can view own credit transactions"
  ON public.credit_transactions
  FOR SELECT
  USING (auth.uid() = user_id);

-- Service role can insert transactions (for edge functions)
DROP POLICY IF EXISTS "Service role can insert credit transactions" ON public.credit_transactions;
CREATE POLICY "Service role can insert credit transactions"
  ON public.credit_transactions
  FOR INSERT
  WITH CHECK (true);

-- Admins can view all transactions
DROP POLICY IF EXISTS "Admins can view all credit transactions" ON public.credit_transactions;
CREATE POLICY "Admins can view all credit transactions"
  ON public.credit_transactions
  FOR SELECT
  USING (
    auth.uid() IN (SELECT id FROM public.users WHERE role IN ('admin', 'support'))
  );

-- Function to deduct credits from user
-- Returns success/failure with updated balance or error message
CREATE OR REPLACE FUNCTION public.deduct_credits(
  p_user_id UUID,
  p_amount DECIMAL,
  p_description TEXT,
  p_reference_type TEXT DEFAULT NULL,
  p_reference_id TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_balance DECIMAL;
  v_new_balance DECIMAL;
  v_auto_recharge BOOLEAN;
  v_auto_recharge_threshold DECIMAL;
  v_transaction_id UUID;
BEGIN
  -- Get current balance and auto-recharge settings (with lock)
  SELECT credits_balance, auto_recharge_enabled, auto_recharge_threshold
  INTO v_current_balance, v_auto_recharge, v_auto_recharge_threshold
  FROM public.users
  WHERE id = p_user_id
  FOR UPDATE;

  IF v_current_balance IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'User not found',
      'balance', NULL
    );
  END IF;

  -- Calculate new balance
  v_new_balance := v_current_balance - p_amount;

  -- Update user's balance
  UPDATE public.users
  SET
    credits_balance = v_new_balance,
    credits_used_this_period = credits_used_this_period + p_amount,
    updated_at = NOW()
  WHERE id = p_user_id;

  -- Record the transaction
  INSERT INTO public.credit_transactions (
    user_id, amount, balance_after, transaction_type, description,
    reference_type, reference_id, metadata
  ) VALUES (
    p_user_id, -p_amount, v_new_balance, 'deduction', p_description,
    p_reference_type, p_reference_id, p_metadata
  ) RETURNING id INTO v_transaction_id;

  RETURN jsonb_build_object(
    'success', true,
    'transaction_id', v_transaction_id,
    'amount_deducted', p_amount,
    'balance_before', v_current_balance,
    'balance_after', v_new_balance,
    'needs_recharge', v_auto_recharge AND v_new_balance <= v_auto_recharge_threshold
  );
END;
$$;

-- Function to add credits to user
CREATE OR REPLACE FUNCTION public.add_credits(
  p_user_id UUID,
  p_amount DECIMAL,
  p_transaction_type TEXT,
  p_description TEXT,
  p_reference_type TEXT DEFAULT NULL,
  p_reference_id TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_balance DECIMAL;
  v_new_balance DECIMAL;
  v_transaction_id UUID;
BEGIN
  -- Validate transaction type
  IF p_transaction_type NOT IN ('purchase', 'auto_recharge', 'refund', 'bonus', 'adjustment') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Invalid transaction type'
    );
  END IF;

  -- Get current balance (with lock)
  SELECT credits_balance
  INTO v_current_balance
  FROM public.users
  WHERE id = p_user_id
  FOR UPDATE;

  IF v_current_balance IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'User not found'
    );
  END IF;

  -- Calculate new balance
  v_new_balance := v_current_balance + p_amount;

  -- Update user's balance
  UPDATE public.users
  SET
    credits_balance = v_new_balance,
    updated_at = NOW()
  WHERE id = p_user_id;

  -- Record the transaction
  INSERT INTO public.credit_transactions (
    user_id, amount, balance_after, transaction_type, description,
    reference_type, reference_id, metadata
  ) VALUES (
    p_user_id, p_amount, v_new_balance, p_transaction_type, p_description,
    p_reference_type, p_reference_id, p_metadata
  ) RETURNING id INTO v_transaction_id;

  RETURN jsonb_build_object(
    'success', true,
    'transaction_id', v_transaction_id,
    'amount_added', p_amount,
    'balance_before', v_current_balance,
    'balance_after', v_new_balance
  );
END;
$$;

-- Function to get user's credit balance and settings
CREATE OR REPLACE FUNCTION public.get_credits_info(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'balance', credits_balance,
    'used_this_period', credits_used_this_period,
    'has_payment_method', has_payment_method,
    'auto_recharge_enabled', auto_recharge_enabled,
    'auto_recharge_amount', auto_recharge_amount,
    'auto_recharge_threshold', auto_recharge_threshold
  )
  INTO v_result
  FROM public.users
  WHERE id = p_user_id;

  IF v_result IS NULL THEN
    RETURN jsonb_build_object('error', 'User not found');
  END IF;

  RETURN v_result;
END;
$$;

-- Update existing users: Set credits_balance to 20.00 for users who haven't used the system
-- For existing active users, we may want to give them their existing usage as credits
-- This is a one-time migration adjustment

-- Note: This does NOT retroactively change existing user data
-- New defaults only apply to new users or users with NULL values

-- Update the handle_new_user trigger to include credits
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, name, credits_balance)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.email),
    20.00  -- $20 free credits for new users
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comments for documentation
COMMENT ON COLUMN public.users.credits_balance IS 'Current credit balance in USD';
COMMENT ON COLUMN public.users.credits_used_this_period IS 'Credits used in current billing period for tracking';
COMMENT ON COLUMN public.users.has_payment_method IS 'Whether user has a payment method saved for auto-recharge';
COMMENT ON COLUMN public.users.auto_recharge_enabled IS 'Whether to automatically add credits when balance is low';
COMMENT ON COLUMN public.users.auto_recharge_amount IS 'Amount to add when auto-recharging (default $50)';
COMMENT ON COLUMN public.users.auto_recharge_threshold IS 'Balance threshold that triggers auto-recharge (default $5)';

COMMENT ON TABLE public.credit_transactions IS 'Audit log of all credit transactions (purchases, deductions, refunds)';
COMMENT ON FUNCTION public.deduct_credits IS 'Deduct credits from user balance, returns success/failure with new balance';
COMMENT ON FUNCTION public.add_credits IS 'Add credits to user balance (purchase, refund, bonus)';
COMMENT ON FUNCTION public.get_credits_info IS 'Get user credit balance and auto-recharge settings';
