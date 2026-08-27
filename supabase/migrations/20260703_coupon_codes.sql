-- Coupon codes that grant account credits when redeemed.
-- Managed in Admin > Marketing > Coupon codes; redeemed in Settings > Billing.

CREATE TABLE IF NOT EXISTS public.coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  description TEXT,
  credit_amount DECIMAL(10,2) NOT NULL CHECK (credit_amount > 0),
  max_redemptions INTEGER CHECK (max_redemptions > 0),  -- NULL = unlimited
  times_redeemed INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ,                               -- NULL = never
  active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.coupon_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- RESTRICT: a redeemed coupon can only be deactivated, never deleted (audit trail)
  coupon_id UUID NOT NULL REFERENCES public.coupons(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  amount DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (coupon_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_user ON public.coupon_redemptions(user_id);

-- Service-role only (edge functions); no client policies.
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupon_redemptions ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.redeem_coupon(p_user_id UUID, p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_coupon public.coupons%ROWTYPE;
  v_result JSONB;
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
    -- Roll back the redemption + counter along with the failed grant
    RAISE EXCEPTION 'add_credits failed: %', v_result->>'error';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'amount', v_coupon.credit_amount,
    'balance_after', v_result->'balance_after'
  );
END;
$$;

-- Redemption goes through the redeem-coupon edge function (service role only)
REVOKE ALL ON FUNCTION public.redeem_coupon(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_coupon(UUID, TEXT) TO service_role;

-- Conveyor migration coupon ($50 for users coming over from Conveyor)
INSERT INTO public.coupons (code, description, credit_amount)
VALUES ('CONVEYR50', 'Conveyor migration credit — welcome to Magpipe', 50.00)
ON CONFLICT (code) DO NOTHING;
