-- Quarantine table for inbound emails dropped by the spam filter.
-- Populated when the bulk-header filter trips (List-Unsubscribe, Precedence:
-- bulk, Auto-Submitted, Feedback-ID, ESP X-Mailer signatures, etc.) — these
-- never become support_tickets or email_messages, but we record one row per
-- drop so admins can audit false positives and tune the filter.

CREATE TABLE IF NOT EXISTS public.quarantined_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  gmail_message_id TEXT NOT NULL,
  thread_id TEXT,
  from_email TEXT,
  from_name TEXT,
  to_email TEXT,
  subject TEXT,
  reason TEXT NOT NULL,
  reason_detail JSONB,
  body_text_preview TEXT,
  received_at TIMESTAMPTZ,
  quarantined_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quarantined_emails_user_recent
  ON public.quarantined_emails (user_id, quarantined_at DESC);

CREATE INDEX IF NOT EXISTS idx_quarantined_emails_msg
  ON public.quarantined_emails (gmail_message_id);

CREATE INDEX IF NOT EXISTS idx_quarantined_emails_reason
  ON public.quarantined_emails (reason, quarantined_at DESC);

ALTER TABLE public.quarantined_emails ENABLE ROW LEVEL SECURITY;

-- Service role (edge functions inserting) bypasses RLS automatically — no
-- INSERT policy needed.

-- Admins / support / god can read all quarantine rows for auditing.
CREATE POLICY "Admins can view quarantined emails"
  ON public.quarantined_emails
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.role IN ('admin', 'support', 'god')
    )
  );

COMMENT ON TABLE public.quarantined_emails IS
  'Inbound emails dropped by the spam/bulk filter — recorded for audit, not delivered downstream.';
