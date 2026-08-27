-- Organization ownership transfers (issue #114).
-- An owner initiates a transfer to another user by email; the recipient must
-- confirm before anything changes. Writes go through the org-transfer-initiate
-- / org-transfer-respond edge functions (service role); clients only SELECT
-- their own side. Applied live 2026-07-01 (schema history is frozen — see
-- MEMORY; this file is the record).

CREATE TABLE IF NOT EXISTS public.organization_ownership_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  from_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  to_email text NOT NULL,
  to_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  move_billing boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled', 'expired')),
  token text NOT NULL,                         -- set by the edge function
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '72 hours'
);

-- At most one pending transfer per organization.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_pending_org_ownership_transfer
  ON public.organization_ownership_transfers (organization_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_org_ownership_transfer_to_user
  ON public.organization_ownership_transfers (to_user_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_org_ownership_transfer_token
  ON public.organization_ownership_transfers (token);

ALTER TABLE public.organization_ownership_transfers ENABLE ROW LEVEL SECURITY;

-- Both parties can read their own transfers (to show status / accept prompt).
-- All inserts/updates go through service-role edge functions, so there are no
-- client INSERT/UPDATE/DELETE policies.
DROP POLICY IF EXISTS "parties read own ownership transfers" ON public.organization_ownership_transfers;
CREATE POLICY "parties read own ownership transfers"
  ON public.organization_ownership_transfers FOR SELECT
  USING (from_user_id = auth.uid() OR to_user_id = auth.uid());

-- Atomic accept: swap ownership + roles + current org, mark transfer accepted.
-- Called by the org-transfer-respond edge function (service role) AFTER it has
-- authenticated the recipient. Re-verifies the initiator still owns the org and
-- the transfer is still pending/unexpired, so a stale or duplicate accept fails
-- cleanly. Stripe (billing) reassignment happens in the edge function afterward.
CREATE OR REPLACE FUNCTION public.accept_org_ownership_transfer(p_transfer_id uuid, p_to_user_id uuid)
RETURNS TABLE(organization_id uuid, from_user_id uuid, to_user_id uuid, move_billing boolean)
LANGUAGE plpgsql SECURITY DEFINER AS $$
-- The RETURNS TABLE output names (organization_id, ...) collide with table
-- column names used in the WHERE clauses below; resolve bare references to the
-- columns so those predicates aren't ambiguous.
#variable_conflict use_column
DECLARE
  t record;
BEGIN
  SELECT * INTO t FROM public.organization_ownership_transfers WHERE id = p_transfer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'transfer not found'; END IF;
  IF t.status <> 'pending' THEN RAISE EXCEPTION 'transfer is % (not pending)', t.status; END IF;
  IF t.expires_at < now() THEN
    UPDATE public.organization_ownership_transfers SET status='expired', responded_at=now() WHERE id = p_transfer_id;
    RAISE EXCEPTION 'transfer expired';
  END IF;
  IF p_to_user_id IS NULL OR t.to_user_id IS NULL OR t.to_user_id <> p_to_user_id THEN
    RAISE EXCEPTION 'not the transfer recipient';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.organizations o WHERE o.id = t.organization_id AND o.owner_id = t.from_user_id) THEN
    RAISE EXCEPTION 'initiator no longer owns the organization';
  END IF;

  UPDATE public.organizations SET owner_id = t.to_user_id, updated_at = now() WHERE id = t.organization_id;

  IF EXISTS (SELECT 1 FROM public.organization_members WHERE organization_id = t.organization_id AND user_id = t.to_user_id) THEN
    UPDATE public.organization_members
      SET role='owner', status='approved', approved_at=COALESCE(approved_at, now()), removed_at=NULL, suspended_at=NULL, updated_at=now()
      WHERE organization_id = t.organization_id AND user_id = t.to_user_id;
  ELSE
    INSERT INTO public.organization_members (organization_id, user_id, email, full_name, role, status, approved_at)
    SELECT t.organization_id, t.to_user_id, u.email, u.name, 'owner', 'approved', now()
    FROM public.users u WHERE u.id = t.to_user_id;
  END IF;

  -- Former owner keeps access but drops to editor (loses ownership + billing).
  UPDATE public.organization_members
    SET role='editor', updated_at=now()
    WHERE organization_id = t.organization_id AND user_id = t.from_user_id AND role='owner';

  UPDATE public.users SET current_organization_id = t.organization_id WHERE id = t.to_user_id;

  UPDATE public.organization_ownership_transfers
    SET status='accepted', responded_at=now(), to_user_id = p_to_user_id
    WHERE id = p_transfer_id;

  RETURN QUERY SELECT t.organization_id, t.from_user_id, t.to_user_id, t.move_billing;
END;
$$;

-- Atomic billing column move (issue #114 review follow-up). Copies the billing
-- columns from the former owner to the new owner and resets the former owner to
-- free, in one transaction, so the two users can never both carry the same
-- Stripe customer/subscription. Called by org-transfer-respond after the Stripe
-- customer/subscription metadata has been re-pointed.
CREATE OR REPLACE FUNCTION public.move_org_billing(p_from uuid, p_to uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.users nu SET
    plan = fu.plan,
    stripe_customer_id = fu.stripe_customer_id,
    stripe_subscription_id = fu.stripe_subscription_id,
    stripe_subscription_status = fu.stripe_subscription_status,
    stripe_current_period_end = fu.stripe_current_period_end,
    has_payment_method = fu.has_payment_method,
    card_brand = fu.card_brand,
    card_last4 = fu.card_last4
  FROM public.users fu
  WHERE nu.id = p_to AND fu.id = p_from;

  UPDATE public.users SET
    plan = 'free', stripe_customer_id = NULL, stripe_subscription_id = NULL,
    stripe_subscription_status = NULL, stripe_current_period_end = NULL,
    has_payment_method = false, card_brand = NULL, card_last4 = NULL
  WHERE id = p_from;
END;
$$;
