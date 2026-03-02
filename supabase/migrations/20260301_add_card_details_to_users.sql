-- Add card brand and last4 columns to users table
-- These are populated by the stripe-webhook when setup_intent.succeeded fires
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS card_brand text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS card_last4 text;
