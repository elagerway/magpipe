-- Phone verification is disabled (REQUIRE_PHONE_VERIFICATION=false) but two DB
-- artifacts kept enforcing it, breaking every new signup's org access:
--
-- 1. handle_new_user() (rewritten 20260701_org_per_signup_and_backfill.sql)
--    still inserted phone_verified=false explicitly, overriding the column
--    default of true. The RLS gate (20260318_require_phone_verified_rls.sql)
--    then blocked the user from reading their own auto-created org, so the
--    Team page bounced to /inbox.
-- 2. The prevent_self_phone_verify_trigger BEFORE trigger was never dropped
--    when verification was disabled; it also blocks any backfill.
--
-- Fix: drop the gate trigger, stop overriding the default in handle_new_user,
-- and backfill all unverified users. Re-enable checklist lives in
-- src/lib/feature-flags.js.

DROP TRIGGER IF EXISTS prevent_self_phone_verify_trigger ON public.users;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  new_org_id uuid;
  has_pending_invite boolean;
BEGIN
  -- phone_verified intentionally omitted: it follows the column default
  -- (true while phone verification is disabled; the re-enable checklist
  -- flips the default back to false and re-creates prevent_self_phone_verify)
  INSERT INTO public.users (id, email, name, credits_balance, received_signup_bonus)
  VALUES (
    NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'name', NEW.email), 0, false
  );

  BEGIN
    SELECT EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE lower(email) = lower(NEW.email) AND status = 'pending'
    ) INTO has_pending_invite;

    IF NOT has_pending_invite THEN
      INSERT INTO public.organizations (name, owner_id)
      VALUES (COALESCE(NULLIF(NEW.raw_user_meta_data->>'name', ''), NULLIF(NEW.email, ''), 'My Team'), NEW.id)
      RETURNING id INTO new_org_id;

      INSERT INTO public.organization_members
        (organization_id, user_id, email, full_name, role, status, approved_at)
      VALUES (new_org_id, NEW.id, COALESCE(NEW.email, ''), COALESCE(NEW.raw_user_meta_data->>'name', NEW.email), 'owner', 'approved', now());

      UPDATE public.users SET current_organization_id = new_org_id WHERE id = NEW.id;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'handle_new_user: org provisioning failed for % (%): %', NEW.id, NEW.email, SQLERRM;
  END;

  -- Link any pending org-ownership transfer offered to this email so the new
  -- user can take ownership (they accept it from Settings — #114/#131). Never
  -- let this block signup.
  BEGIN
    UPDATE public.organization_ownership_transfers
    SET to_user_id = NEW.id
    WHERE to_user_id IS NULL AND lower(to_email) = lower(NEW.email) AND status = 'pending';
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'handle_new_user: linking ownership transfer failed for %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$function$;

-- Unblock everyone the gate was still holding (90 users at time of apply)
UPDATE public.users SET phone_verified = true WHERE phone_verified = false;
