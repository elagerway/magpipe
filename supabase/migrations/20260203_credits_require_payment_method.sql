-- Credits Require Payment Method Migration
-- Users must add a valid payment method before receiving $20 free credits
-- This prevents abuse of free credits

-- Update the default credits_balance to 0 (no free credits until payment method added)
ALTER TABLE public.users
  ALTER COLUMN credits_balance SET DEFAULT 0;

-- Add a column to track if user has received their signup bonus
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS received_signup_bonus BOOLEAN DEFAULT false;

-- Update the handle_new_user trigger to NOT give free credits
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, name, credits_balance, received_signup_bonus)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.email),
    0,     -- No free credits until payment method added
    false  -- Has not received signup bonus yet
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to grant signup bonus when payment method is added
CREATE OR REPLACE FUNCTION public.grant_signup_bonus(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_already_received BOOLEAN;
  v_current_balance DECIMAL;
  v_new_balance DECIMAL;
  v_transaction_id UUID;
BEGIN
  -- Check if user already received bonus (with lock)
  SELECT received_signup_bonus, credits_balance
  INTO v_already_received, v_current_balance
  FROM public.users
  WHERE id = p_user_id
  FOR UPDATE;

  IF v_already_received IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'User not found'
    );
  END IF;

  IF v_already_received THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Signup bonus already received',
      'balance', v_current_balance
    );
  END IF;

  -- Grant the $20 signup bonus and enable auto-recharge
  v_new_balance := v_current_balance + 20.00;

  UPDATE public.users
  SET
    credits_balance = v_new_balance,
    received_signup_bonus = true,
    has_payment_method = true,
    auto_recharge_enabled = true,  -- Auto-recharge enabled as part of signup bonus
    updated_at = NOW()
  WHERE id = p_user_id;

  -- Record the transaction
  INSERT INTO public.credit_transactions (
    user_id, amount, balance_after, transaction_type, description,
    reference_type, metadata
  ) VALUES (
    p_user_id, 20.00, v_new_balance, 'bonus', 'Welcome bonus - $20 free credits',
    'signup_bonus', '{"type": "signup_bonus", "auto_recharge_enabled": true}'::jsonb
  ) RETURNING id INTO v_transaction_id;

  RETURN jsonb_build_object(
    'success', true,
    'transaction_id', v_transaction_id,
    'bonus_amount', 20.00,
    'balance_after', v_new_balance,
    'auto_recharge_enabled', true
  );
END;
$$;

-- Update get_credits_info to include received_signup_bonus
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
    'received_signup_bonus', received_signup_bonus,
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

COMMENT ON COLUMN public.users.received_signup_bonus IS 'Whether user has received their $20 signup bonus (requires payment method first)';
COMMENT ON FUNCTION public.grant_signup_bonus IS 'Grant $20 signup bonus to user when they add their first payment method';
