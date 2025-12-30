-- Plan Limits and Usage Tracking Migration
-- Adds usage tracking columns for calls, minutes, and SMS
-- Adds plan limits enforcement

-- Add usage tracking columns to users table
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS usage_calls_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS usage_minutes_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS usage_sms_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS usage_period_start TIMESTAMPTZ DEFAULT date_trunc('month', NOW()),
  ADD COLUMN IF NOT EXISTS usage_period_end TIMESTAMPTZ DEFAULT (date_trunc('month', NOW()) + INTERVAL '1 month');

-- Create index for usage queries
CREATE INDEX IF NOT EXISTS idx_users_usage_period ON public.users(usage_period_start, usage_period_end);

-- Usage history table for analytics
CREATE TABLE IF NOT EXISTS public.usage_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  calls_count INTEGER DEFAULT 0,
  minutes_count INTEGER DEFAULT 0,
  sms_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for usage history
CREATE INDEX IF NOT EXISTS idx_usage_history_user ON public.usage_history(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_history_period ON public.usage_history(period_start, period_end);

-- Enable RLS on usage history
ALTER TABLE public.usage_history ENABLE ROW LEVEL SECURITY;

-- Users can view their own usage history
CREATE POLICY "Users can view own usage history"
  ON public.usage_history
  FOR SELECT
  USING (auth.uid() = user_id);

-- Admins can view all usage history
CREATE POLICY "Admins can view all usage history"
  ON public.usage_history
  FOR SELECT
  USING (
    auth.uid() IN (SELECT id FROM public.users WHERE role IN ('admin', 'support'))
  );

-- Service role can insert usage history
CREATE POLICY "Service role can insert usage history"
  ON public.usage_history
  FOR INSERT
  WITH CHECK (true);

-- Plan limits configuration table
CREATE TABLE IF NOT EXISTS public.plan_limits (
  plan TEXT PRIMARY KEY,
  max_phone_numbers INTEGER,
  max_calls_per_month INTEGER,
  max_minutes_per_month INTEGER,
  max_sms_per_month INTEGER,
  voice_cloning_enabled BOOLEAN DEFAULT false,
  advanced_analytics_enabled BOOLEAN DEFAULT false,
  priority_support_enabled BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert plan limit configurations
INSERT INTO public.plan_limits (plan, max_phone_numbers, max_calls_per_month, max_minutes_per_month, max_sms_per_month, voice_cloning_enabled, advanced_analytics_enabled, priority_support_enabled)
VALUES
  ('free', 1, 100, 100, 100, false, false, false),
  ('pro', NULL, NULL, NULL, NULL, true, true, true)  -- NULL means unlimited
ON CONFLICT (plan) DO UPDATE SET
  max_phone_numbers = EXCLUDED.max_phone_numbers,
  max_calls_per_month = EXCLUDED.max_calls_per_month,
  max_minutes_per_month = EXCLUDED.max_minutes_per_month,
  max_sms_per_month = EXCLUDED.max_sms_per_month,
  voice_cloning_enabled = EXCLUDED.voice_cloning_enabled,
  advanced_analytics_enabled = EXCLUDED.advanced_analytics_enabled,
  priority_support_enabled = EXCLUDED.priority_support_enabled,
  updated_at = NOW();

-- Enable RLS on plan_limits (read-only for all authenticated users)
ALTER TABLE public.plan_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read plan limits"
  ON public.plan_limits
  FOR SELECT
  USING (true);

-- Function to check if user has exceeded usage limits
CREATE OR REPLACE FUNCTION public.check_usage_limit(
  p_user_id UUID,
  p_limit_type TEXT  -- 'calls', 'minutes', 'sms'
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_plan TEXT;
  v_current_usage INTEGER;
  v_limit INTEGER;
  v_period_start TIMESTAMPTZ;
  v_period_end TIMESTAMPTZ;
BEGIN
  -- Get user's plan and current usage
  SELECT
    COALESCE(plan, 'free'),
    CASE p_limit_type
      WHEN 'calls' THEN usage_calls_count
      WHEN 'minutes' THEN usage_minutes_count
      WHEN 'sms' THEN usage_sms_count
      ELSE 0
    END,
    usage_period_start,
    usage_period_end
  INTO v_user_plan, v_current_usage, v_period_start, v_period_end
  FROM public.users
  WHERE id = p_user_id;

  -- Reset usage if period has ended
  IF v_period_end < NOW() THEN
    -- Archive old usage to history
    INSERT INTO public.usage_history (user_id, period_start, period_end, calls_count, minutes_count, sms_count)
    SELECT id, usage_period_start, usage_period_end, usage_calls_count, usage_minutes_count, usage_sms_count
    FROM public.users WHERE id = p_user_id;

    -- Reset usage for new period
    UPDATE public.users
    SET
      usage_calls_count = 0,
      usage_minutes_count = 0,
      usage_sms_count = 0,
      usage_period_start = date_trunc('month', NOW()),
      usage_period_end = date_trunc('month', NOW()) + INTERVAL '1 month'
    WHERE id = p_user_id;

    v_current_usage := 0;
    v_period_start := date_trunc('month', NOW());
    v_period_end := date_trunc('month', NOW()) + INTERVAL '1 month';
  END IF;

  -- Get limit for user's plan
  SELECT
    CASE p_limit_type
      WHEN 'calls' THEN max_calls_per_month
      WHEN 'minutes' THEN max_minutes_per_month
      WHEN 'sms' THEN max_sms_per_month
      ELSE NULL
    END
  INTO v_limit
  FROM public.plan_limits
  WHERE plan = v_user_plan;

  RETURN jsonb_build_object(
    'plan', v_user_plan,
    'limit_type', p_limit_type,
    'current_usage', v_current_usage,
    'limit', v_limit,
    'is_unlimited', v_limit IS NULL,
    'has_exceeded', v_limit IS NOT NULL AND v_current_usage >= v_limit,
    'remaining', CASE WHEN v_limit IS NULL THEN NULL ELSE GREATEST(0, v_limit - v_current_usage) END,
    'period_start', v_period_start,
    'period_end', v_period_end
  );
END;
$$;

-- Function to increment usage counter
CREATE OR REPLACE FUNCTION public.increment_usage(
  p_user_id UUID,
  p_usage_type TEXT,  -- 'calls', 'minutes', 'sms'
  p_amount INTEGER DEFAULT 1
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB;
BEGIN
  -- First check the limit
  v_result := public.check_usage_limit(p_user_id, p_usage_type);

  -- If already exceeded, return error
  IF (v_result->>'has_exceeded')::boolean THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Usage limit exceeded',
      'details', v_result
    );
  END IF;

  -- Increment the usage
  EXECUTE format(
    'UPDATE public.users SET usage_%s_count = usage_%s_count + $1 WHERE id = $2',
    p_usage_type, p_usage_type
  ) USING p_amount, p_user_id;

  -- Return updated usage info
  v_result := public.check_usage_limit(p_user_id, p_usage_type);

  RETURN jsonb_build_object(
    'success', true,
    'details', v_result
  );
END;
$$;

-- Function to check phone number limit
CREATE OR REPLACE FUNCTION public.check_phone_number_limit(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_plan TEXT;
  v_current_count INTEGER;
  v_limit INTEGER;
BEGIN
  -- Get user's plan
  SELECT COALESCE(plan, 'free')
  INTO v_user_plan
  FROM public.users
  WHERE id = p_user_id;

  -- Get current phone number count
  SELECT COUNT(*)
  INTO v_current_count
  FROM public.service_numbers
  WHERE user_id = p_user_id;

  -- Get limit for user's plan
  SELECT max_phone_numbers
  INTO v_limit
  FROM public.plan_limits
  WHERE plan = v_user_plan;

  RETURN jsonb_build_object(
    'plan', v_user_plan,
    'current_count', v_current_count,
    'limit', v_limit,
    'is_unlimited', v_limit IS NULL,
    'can_add_more', v_limit IS NULL OR v_current_count < v_limit,
    'remaining', CASE WHEN v_limit IS NULL THEN NULL ELSE GREATEST(0, v_limit - v_current_count) END
  );
END;
$$;

-- Function to check if feature is enabled for user's plan
CREATE OR REPLACE FUNCTION public.is_feature_enabled(
  p_user_id UUID,
  p_feature TEXT  -- 'voice_cloning', 'advanced_analytics', 'priority_support'
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_plan TEXT;
  v_enabled BOOLEAN;
BEGIN
  -- Get user's plan
  SELECT COALESCE(plan, 'free')
  INTO v_user_plan
  FROM public.users
  WHERE id = p_user_id;

  -- Check if feature is enabled
  EXECUTE format(
    'SELECT %I FROM public.plan_limits WHERE plan = $1',
    p_feature || '_enabled'
  ) INTO v_enabled USING v_user_plan;

  RETURN COALESCE(v_enabled, false);
END;
$$;

-- Comments for documentation
COMMENT ON COLUMN public.users.usage_calls_count IS 'Number of calls made in current billing period';
COMMENT ON COLUMN public.users.usage_minutes_count IS 'Number of minutes used in current billing period';
COMMENT ON COLUMN public.users.usage_sms_count IS 'Number of SMS sent in current billing period';
COMMENT ON COLUMN public.users.usage_period_start IS 'Start of current billing period';
COMMENT ON COLUMN public.users.usage_period_end IS 'End of current billing period';

COMMENT ON TABLE public.plan_limits IS 'Configuration table for plan limits (free vs pro)';
COMMENT ON TABLE public.usage_history IS 'Historical usage data for analytics';

COMMENT ON FUNCTION public.check_usage_limit IS 'Check if user has exceeded usage limit for calls/minutes/sms';
COMMENT ON FUNCTION public.increment_usage IS 'Increment usage counter and check limits';
COMMENT ON FUNCTION public.check_phone_number_limit IS 'Check if user can add more phone numbers';
COMMENT ON FUNCTION public.is_feature_enabled IS 'Check if a feature is enabled for user plan';
