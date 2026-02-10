-- Monthly billing infrastructure
-- Adds tracking for recurring monthly charges (phone numbers, concurrency, extra KBs)

-- Add billing tracking columns to service_numbers
ALTER TABLE public.service_numbers
  ADD COLUMN IF NOT EXISTS last_billed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS monthly_fee DECIMAL(10,2) DEFAULT 2.00;

-- Allow 'monthly_fee' as a transaction type in credit_transactions
-- The CHECK constraint needs to be updated to include the new type
ALTER TABLE public.credit_transactions
  DROP CONSTRAINT IF EXISTS credit_transactions_transaction_type_check;

ALTER TABLE public.credit_transactions
  ADD CONSTRAINT credit_transactions_transaction_type_check
  CHECK (transaction_type IN ('purchase', 'deduction', 'auto_recharge', 'refund', 'bonus', 'adjustment', 'monthly_fee'));

-- Create monthly_billing_log to track what was billed and when
CREATE TABLE IF NOT EXISTS public.monthly_billing_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  fee_type TEXT NOT NULL,  -- 'phone_number', 'concurrency_slot', 'extra_knowledge_base'
  reference_id TEXT,       -- service_number.id or other reference
  amount DECIMAL(10,4) NOT NULL,
  billing_period_start TIMESTAMPTZ NOT NULL,
  billing_period_end TIMESTAMPTZ NOT NULL,
  transaction_id UUID,     -- reference to credit_transactions.id
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for efficient monthly billing queries
CREATE INDEX IF NOT EXISTS idx_monthly_billing_user_id ON public.monthly_billing_log(user_id);
CREATE INDEX IF NOT EXISTS idx_monthly_billing_fee_type ON public.monthly_billing_log(fee_type);
CREATE INDEX IF NOT EXISTS idx_service_numbers_last_billed ON public.service_numbers(last_billed_at);

-- Disable RLS on monthly_billing_log (service role only)
ALTER TABLE public.monthly_billing_log ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
CREATE POLICY "Service role full access on monthly_billing_log"
  ON public.monthly_billing_log
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Schedule daily cron job at 3am UTC to process monthly fees
SELECT cron.schedule(
  'process-monthly-fees',
  '0 3 * * *',
  $$
  SELECT
    net.http_post(
      url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url') || '/functions/v1/process-monthly-fees',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_service_role_key')
      ),
      body := '{}'::jsonb
    );
  $$
);
