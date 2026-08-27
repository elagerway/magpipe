-- Phone number transfers between accounts (issue #115).
-- Sender initiates by email; the recipient (who must be phone-verified) confirms
-- before the number moves. Writes go through number-transfer-initiate /
-- number-transfer-respond edge functions (service role); clients only SELECT
-- their own side. Distinct from `transfer_numbers` (that table is warm-transfer
-- destinations, a different concept). Applied live 2026-07-01 (schema history
-- frozen — this file is the record).

CREATE TABLE IF NOT EXISTS public.number_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_number_id uuid NOT NULL REFERENCES public.service_numbers(id) ON DELETE CASCADE,
  phone_number text NOT NULL,                  -- snapshot for display/audit
  from_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  to_email text NOT NULL,
  to_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','accepted','declined','cancelled','expired')),
  token text NOT NULL,                         -- set by the edge function
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '72 hours'
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_pending_number_transfer
  ON public.number_transfers (service_number_id) WHERE status='pending';
CREATE INDEX IF NOT EXISTS idx_number_transfer_to_user
  ON public.number_transfers (to_user_id) WHERE status='pending';
CREATE INDEX IF NOT EXISTS idx_number_transfer_token ON public.number_transfers (token);

ALTER TABLE public.number_transfers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "parties read own number transfers" ON public.number_transfers;
CREATE POLICY "parties read own number transfers"
  ON public.number_transfers FOR SELECT
  USING (from_user_id = auth.uid() OR to_user_id = auth.uid());

-- Atomic accept: reassign the number to the recipient, detach the former owner's
-- agents (inbound/text/outbound — otherwise their agent would answer the new
-- owner's calls) and clear stale legacy SIP columns. Re-verifies the sender
-- still owns the number and the recipient is phone-verified (service_numbers RLS
-- requires is_phone_verified()). Conversation history stays with the sender
-- (call_records/sms_messages/conversation_contexts are user_id-keyed — untouched).
CREATE OR REPLACE FUNCTION public.accept_number_transfer(p_transfer_id uuid, p_to_user_id uuid)
RETURNS TABLE(service_number_id uuid, phone_number text, from_user_id uuid, to_user_id uuid)
LANGUAGE plpgsql SECURITY DEFINER AS $$
#variable_conflict use_column
DECLARE
  t record;
  v_verified boolean;
BEGIN
  SELECT * INTO t FROM public.number_transfers WHERE id = p_transfer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'transfer not found'; END IF;
  IF t.status <> 'pending' THEN RAISE EXCEPTION 'transfer is % (not pending)', t.status; END IF;
  IF t.expires_at < now() THEN
    UPDATE public.number_transfers SET status='expired', responded_at=now() WHERE id = p_transfer_id;
    RAISE EXCEPTION 'transfer expired';
  END IF;
  IF p_to_user_id IS NULL OR t.to_user_id IS NULL OR t.to_user_id <> p_to_user_id THEN
    RAISE EXCEPTION 'not the transfer recipient';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.service_numbers s WHERE s.id = t.service_number_id AND s.user_id = t.from_user_id) THEN
    RAISE EXCEPTION 'sender no longer owns this number';
  END IF;
  SELECT phone_verified INTO v_verified FROM public.users WHERE id = p_to_user_id;
  IF v_verified IS NOT TRUE THEN RAISE EXCEPTION 'recipient must verify their phone number first'; END IF;

  UPDATE public.service_numbers SET
    user_id = t.to_user_id,
    agent_id = NULL, text_agent_id = NULL, outbound_agent_id = NULL,
    sip_username = NULL, sip_password = NULL, sip_domain = NULL, sip_ws_server = NULL,
    updated_at = now()
  WHERE id = t.service_number_id;

  UPDATE public.number_transfers
    SET status='accepted', responded_at=now(), to_user_id = p_to_user_id
    WHERE id = p_transfer_id;

  RETURN QUERY SELECT t.service_number_id, t.phone_number, t.from_user_id, t.to_user_id;
END;
$$;
