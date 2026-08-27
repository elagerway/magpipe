-- Fixes from the 2026-07-03 code review of the coupon / phone-verification work.

-- Finding: coupons.code uppercase+format invariant lived only in admin-coupons-api,
-- but redeem_coupon() matches `WHERE code = upper(trim(p_code))` — a lowercase code
-- inserted via SQL/seed would be un-redeemable with no error at insert time.
ALTER TABLE public.coupons
  ADD CONSTRAINT coupons_code_format CHECK (code = upper(code) AND code ~ '^[A-Z0-9][A-Z0-9-]{2,31}$'),
  ADD CONSTRAINT coupons_amount_cap CHECK (credit_amount <= 1000);

-- Finding: 20260703_phone_verification_fully_disabled.sql backfilled phone_verified=true
-- for everyone; the honest-meaning follow-up only reset number-less rows, leaving users
-- who set a number but never completed SMS verification flagged as verified. Reset any
-- phone_verified=true user with no genuine verified phone_verifications row.
UPDATE public.users u SET phone_verified = false
WHERE u.phone_verified = true
  AND NOT EXISTS (SELECT 1 FROM public.phone_verifications pv WHERE pv.user_id = u.id AND pv.verified = true);

-- Finding: verify-phone-check sends the onboarding "Welcome to MAGPIPE" email on every
-- successful verification. With inline verification in Settings, an existing customer who
-- edits their number would get onboarding copy. Gate the email on a once-per-user flag.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS welcome_email_sent BOOLEAN NOT NULL DEFAULT false;
-- Already-verified users have been onboarded; don't email them on their next verify.
UPDATE public.users SET welcome_email_sent = true WHERE phone_verified = true;
