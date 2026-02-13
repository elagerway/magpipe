-- Low Balance Protection & Referral System
-- Adds columns for low-balance notifications, referral tracking, and gamification bonuses

-- New user columns
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS low_balance_notified BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS referred_by UUID REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS cc_bonus_claimed BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS recharge_bonus_claimed BOOLEAN DEFAULT false;

-- Referral tracking table
CREATE TABLE IF NOT EXISTS public.referral_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID NOT NULL REFERENCES public.users(id),
  referred_id UUID NOT NULL REFERENCES public.users(id),
  referred_call_minutes DECIMAL(10,2) DEFAULT 0,
  threshold_met BOOLEAN DEFAULT false,
  referrer_bonus_paid BOOLEAN DEFAULT false,
  referred_bonus_paid BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  UNIQUE(referrer_id, referred_id)
);

-- Enable RLS on referral_rewards
ALTER TABLE public.referral_rewards ENABLE ROW LEVEL SECURITY;

-- Users can see their own referral rewards (as referrer or referred)
CREATE POLICY "Users can view own referral rewards" ON public.referral_rewards
  FOR SELECT USING (auth.uid() = referrer_id OR auth.uid() = referred_id);

-- Only service role can insert/update referral rewards
CREATE POLICY "Service role manages referral rewards" ON public.referral_rewards
  FOR ALL USING (auth.role() = 'service_role');


-- Updated deduct_credits: sets low_balance_notified flag and returns trigger signal
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
  v_was_notified BOOLEAN;
  v_trigger_notification BOOLEAN := false;
BEGIN
  -- Get current balance and auto-recharge settings (with lock)
  SELECT credits_balance, auto_recharge_enabled, auto_recharge_threshold, low_balance_notified
  INTO v_current_balance, v_auto_recharge, v_auto_recharge_threshold, v_was_notified
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

  -- Check if we should trigger low balance notification
  IF v_new_balance <= 1.0 AND (v_was_notified IS NULL OR v_was_notified = false) THEN
    v_trigger_notification := true;
  END IF;

  -- Update user's balance (and set low_balance_notified if triggered)
  UPDATE public.users
  SET
    credits_balance = v_new_balance,
    credits_used_this_period = credits_used_this_period + p_amount,
    low_balance_notified = CASE
      WHEN v_trigger_notification THEN true
      ELSE low_balance_notified
    END,
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
    'needs_recharge', v_auto_recharge AND v_new_balance <= v_auto_recharge_threshold,
    'trigger_low_balance_notification', v_trigger_notification
  );
END;
$$;


-- Updated add_credits: resets low_balance_notified when balance goes above $1
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

  -- Update user's balance, reset low_balance_notified if balance is now above $1
  UPDATE public.users
  SET
    credits_balance = v_new_balance,
    low_balance_notified = CASE
      WHEN v_new_balance > 1.0 THEN false
      ELSE low_balance_notified
    END,
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


-- Generate a unique referral code for a user
CREATE OR REPLACE FUNCTION public.generate_referral_code(p_user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_code TEXT;
  v_exists BOOLEAN;
BEGIN
  -- Check if user already has a referral code
  SELECT referral_code INTO v_code FROM public.users WHERE id = p_user_id;
  IF v_code IS NOT NULL THEN
    RETURN v_code;
  END IF;

  -- Generate unique code
  LOOP
    v_code := 'MAGP-' || upper(substr(md5(random()::text), 1, 5));
    SELECT EXISTS(SELECT 1 FROM public.users WHERE referral_code = v_code) INTO v_exists;
    EXIT WHEN NOT v_exists;
  END LOOP;

  -- Save to user
  UPDATE public.users SET referral_code = v_code WHERE id = p_user_id;

  RETURN v_code;
END;
$$;


-- Claim credit card bonus ($10 if has_payment_method and not yet claimed)
CREATE OR REPLACE FUNCTION public.claim_cc_bonus(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_has_payment BOOLEAN;
  v_already_claimed BOOLEAN;
  v_result JSONB;
BEGIN
  SELECT has_payment_method, cc_bonus_claimed
  INTO v_has_payment, v_already_claimed
  FROM public.users WHERE id = p_user_id;

  IF v_has_payment IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;

  IF v_already_claimed THEN
    RETURN jsonb_build_object('success', false, 'error', 'Bonus already claimed');
  END IF;

  IF NOT v_has_payment THEN
    RETURN jsonb_build_object('success', false, 'error', 'No payment method on file');
  END IF;

  -- Mark as claimed
  UPDATE public.users SET cc_bonus_claimed = true WHERE id = p_user_id;

  -- Award $10 bonus
  SELECT public.add_credits(p_user_id, 10.00, 'bonus', 'Credit card bonus: +$10 for adding a payment method')
  INTO v_result;

  RETURN jsonb_build_object('success', true, 'amount', 10.00, 'add_credits_result', v_result);
END;
$$;


-- Claim auto-recharge bonus ($10 if auto_recharge_enabled and not yet claimed)
CREATE OR REPLACE FUNCTION public.claim_recharge_bonus(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_auto_recharge BOOLEAN;
  v_already_claimed BOOLEAN;
  v_result JSONB;
BEGIN
  SELECT auto_recharge_enabled, recharge_bonus_claimed
  INTO v_auto_recharge, v_already_claimed
  FROM public.users WHERE id = p_user_id;

  IF v_auto_recharge IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;

  IF v_already_claimed THEN
    RETURN jsonb_build_object('success', false, 'error', 'Bonus already claimed');
  END IF;

  IF NOT v_auto_recharge THEN
    RETURN jsonb_build_object('success', false, 'error', 'Auto-recharge not enabled');
  END IF;

  -- Mark as claimed
  UPDATE public.users SET recharge_bonus_claimed = true WHERE id = p_user_id;

  -- Award $10 bonus
  SELECT public.add_credits(p_user_id, 10.00, 'bonus', 'Auto-recharge bonus: +$10 for enabling auto-recharge')
  INTO v_result;

  RETURN jsonb_build_object('success', true, 'amount', 10.00, 'add_credits_result', v_result);
END;
$$;
