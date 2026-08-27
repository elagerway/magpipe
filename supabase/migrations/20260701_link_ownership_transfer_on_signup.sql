-- When ownership is transferred to a teammate who hasn't signed up yet (#131),
-- org-transfer-to-member queues a pending row in organization_ownership_transfers
-- with to_user_id = NULL and to_email set. This extends handle_new_user() to link
-- to_user_id when that person signs up, so the #114 accept prompt appears for them
-- and they can take ownership. Wrapped so it can never block signup.
-- Applied live 2026-07-01 (schema history frozen — this file is the record).
-- Supersedes the handle_new_user() in 20260701_org_per_signup_and_backfill.sql.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  new_org_id uuid;
  has_pending_invite boolean;
BEGIN
  INSERT INTO public.users (id, email, name, credits_balance, received_signup_bonus, phone_verified)
  VALUES (
    NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'name', NEW.email), 0, false, false
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

  -- Link any queued org-ownership transfer offered to this email (#131).
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
