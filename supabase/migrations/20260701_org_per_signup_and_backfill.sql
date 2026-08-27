-- Every user gets their own organization (they are the owner) so the Team page
-- works out of the box. Previously handle_new_user() only created a public.users
-- row and nothing ever called Organization.create(), so 96/99 users had no org
-- and the Team page bounced them to /inbox.
--
-- NOTE: This project's schema is applied manually to the live DB (migration
-- history is frozen). This file documents changes already applied via SQL on
-- 2026-07-01; it is not run through `supabase db push`.

-- 1) Signup trigger: create an owner org for every new signup, EXCEPT users who
--    were invited to an existing team (they join that org on invite acceptance).
--
--    DEPENDENCY (do not break): this function is SECURITY DEFINER and relies on
--    its owner role (postgres) having BYPASSRLS. At signup time there is no
--    auth.uid() and the new user's phone_verified is false, so the RLS WITH CHECK
--    policies on organizations/organization_members (20260318_require_phone_verified_rls.sql)
--    would REJECT all three org writes if they were enforced. The definer owner
--    bypasses RLS, which is why it works. If this function is ever recreated
--    under a non-superuser / non-BYPASSRLS role, every signup's org provisioning
--    will fail (now caught by the EXCEPTION block below — users would silently
--    become orgless rather than erroring, so watch for the RAISE WARNING).
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  new_org_id uuid;
  has_pending_invite boolean;
BEGIN
  -- Create the platform user row (this must succeed; unchanged behaviour).
  INSERT INTO public.users (id, email, name, credits_balance, received_signup_bonus, phone_verified)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.email),
    0,
    false,
    false
  );

  -- Org provisioning must NEVER block account creation. Wrap it so any failure
  -- (constraint, RLS, unexpected trigger) only logs a warning and lets signup
  -- succeed; the user ends up orgless and the Team page / backfill repairs it
  -- later — exactly the pre-migration status quo.
  BEGIN
    SELECT EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE lower(email) = lower(NEW.email) AND status = 'pending'
    ) INTO has_pending_invite;

    IF NOT has_pending_invite THEN
      INSERT INTO public.organizations (name, owner_id)
      VALUES (
        COALESCE(NULLIF(NEW.raw_user_meta_data->>'name', ''), NULLIF(NEW.email, ''), 'My Team'),
        NEW.id
      )
      RETURNING id INTO new_org_id;

      INSERT INTO public.organization_members
        (organization_id, user_id, email, full_name, role, status, approved_at)
      VALUES (
        new_org_id, NEW.id,
        COALESCE(NEW.email, ''),
        COALESCE(NEW.raw_user_meta_data->>'name', NEW.email),
        'owner', 'approved', now()
      );

      UPDATE public.users SET current_organization_id = new_org_id WHERE id = NEW.id;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'handle_new_user: org provisioning failed for % (%): %', NEW.id, NEW.email, SQLERRM;
  END;

  RETURN NEW;
END;
$function$;

-- 2) One-time backfill: give every existing orgless user (who isn't mid-invite)
--    their own owner org. Ran once on 2026-07-01 (96 users). Idempotent via the
--    NOT EXISTS guards; safe to re-run.
WITH orgless AS (
  SELECT u.id, u.email, u.name
  FROM users u
  WHERE NOT EXISTS (SELECT 1 FROM organization_members om WHERE om.user_id = u.id)
    AND NOT EXISTS (SELECT 1 FROM organization_members om WHERE lower(om.email) = lower(u.email) AND om.status = 'pending')
),
new_orgs AS (
  INSERT INTO organizations (name, owner_id)
  SELECT COALESCE(NULLIF(o.name, ''), o.email), o.id FROM orgless o
  RETURNING id, owner_id
),
new_members AS (
  INSERT INTO organization_members (organization_id, user_id, email, full_name, role, status, approved_at)
  SELECT no.id, no.owner_id, u.email, u.name, 'owner', 'approved', now()
  FROM new_orgs no JOIN users u ON u.id = no.owner_id
  RETURNING id
)
UPDATE users u
SET current_organization_id = no.id
FROM new_orgs no
WHERE u.id = no.owner_id;
