CREATE TABLE IF NOT EXISTS public.campaign_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id TEXT UNIQUE NOT NULL,
  campaign_id TEXT NOT NULL,
  state TEXT NOT NULL,
  phone_numbers JSONB NOT NULL,
  processed_at TIMESTAMPTZ,
  raw_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_campaign_registrations_order_id
  ON public.campaign_registrations(order_id);

CREATE INDEX IF NOT EXISTS idx_campaign_registrations_campaign_id
  ON public.campaign_registrations(campaign_id);

CREATE INDEX IF NOT EXISTS idx_campaign_registrations_state
  ON public.campaign_registrations(state);

COMMENT ON TABLE public.campaign_registrations IS 'Tracks SMS campaign registration status for phone numbers';
COMMENT ON COLUMN public.campaign_registrations.state IS 'Campaign registration state: pending, approved, rejected';
