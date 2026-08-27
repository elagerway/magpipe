-- Make the payment-method requirement per-coupon (defaults to true) so a trusted
-- partner / card-optional promo can waive it while every normal coupon still
-- requires a card on file. Supersedes the blanket check in
-- 20260704_coupon_requires_payment_method.sql.

ALTER TABLE public.coupons
  ADD COLUMN IF NOT EXISTS requires_payment_method BOOLEAN NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.redeem_coupon(p_user_id UUID, p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_coupon public.coupons%ROWTYPE;
  v_result JSONB;
  v_has_payment_method BOOLEAN;
BEGIN
  SELECT * INTO v_coupon
  FROM public.coupons
  WHERE code = upper(trim(p_code))
  FOR UPDATE;

  IF v_coupon.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid coupon code');
  END IF;

  IF NOT v_coupon.active THEN
    RETURN jsonb_build_object('success', false, 'error', 'This coupon is no longer active');
  END IF;

  IF v_coupon.expires_at IS NOT NULL AND v_coupon.expires_at < NOW() THEN
    RETURN jsonb_build_object('success', false, 'error', 'This coupon has expired');
  END IF;

  IF v_coupon.max_redemptions IS NOT NULL AND v_coupon.times_redeemed >= v_coupon.max_redemptions THEN
    RETURN jsonb_build_object('success', false, 'error', 'This coupon has reached its redemption limit');
  END IF;

  -- Fraud guard: card on file required unless this coupon explicitly waives it
  IF v_coupon.requires_payment_method THEN
    SELECT COALESCE(has_payment_method, false) INTO v_has_payment_method
    FROM public.users WHERE id = p_user_id;

    IF NOT v_has_payment_method THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Add a payment method before redeeming a coupon',
        'code', 'payment_method_required'
      );
    END IF;
  END IF;

  BEGIN
    INSERT INTO public.coupon_redemptions (coupon_id, user_id, amount)
    VALUES (v_coupon.id, p_user_id, v_coupon.credit_amount);
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('success', false, 'error', 'You have already redeemed this coupon');
  END;

  UPDATE public.coupons
  SET times_redeemed = times_redeemed + 1, updated_at = NOW()
  WHERE id = v_coupon.id;

  v_result := public.add_credits(
    p_user_id,
    v_coupon.credit_amount,
    'bonus',
    'Coupon ' || v_coupon.code,
    'coupon',
    v_coupon.code,
    jsonb_build_object('coupon_id', v_coupon.id)
  );

  IF NOT (v_result->>'success')::boolean THEN
    RAISE EXCEPTION 'add_credits failed: %', v_result->>'error';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'amount', v_coupon.credit_amount,
    'balance_after', v_result->'balance_after'
  );
END;
$$;
