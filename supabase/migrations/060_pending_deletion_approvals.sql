-- Migration 060: Add pending deletion approvals table
-- Tracks SMS approval requests for phone number deletions

CREATE TABLE IF NOT EXISTS pending_deletion_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Reference to the deletion record
  deletion_record_id UUID REFERENCES numbers_to_delete(id) ON DELETE CASCADE,

  -- Numbers being deleted (comma-separated for batch approvals)
  phone_numbers TEXT NOT NULL,

  -- User who requested deletion
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Admin contact info
  admin_phone TEXT NOT NULL,

  -- Approval status
  approval_status TEXT NOT NULL DEFAULT 'pending' CHECK (approval_status IN ('pending', 'approved', 'rejected', 'expired')),

  -- SMS tracking
  approval_sms_sid TEXT,
  approval_sms_sent_at TIMESTAMPTZ,

  -- Response tracking
  response_received_at TIMESTAMPTZ,
  response_text TEXT,
  response_sms_sid TEXT,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '24 hours')
);

-- Index for quick lookups
CREATE INDEX idx_pending_approvals_status ON pending_deletion_approvals(approval_status);
CREATE INDEX idx_pending_approvals_admin_phone ON pending_deletion_approvals(admin_phone);
CREATE INDEX idx_pending_approvals_expires ON pending_deletion_approvals(expires_at);

-- RLS policies
ALTER TABLE pending_deletion_approvals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON pending_deletion_approvals
  FOR ALL USING (auth.role() = 'service_role');

-- Trigger to update updated_at
CREATE TRIGGER update_pending_deletion_approvals_updated_at
  BEFORE UPDATE ON pending_deletion_approvals
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Comments
COMMENT ON TABLE pending_deletion_approvals IS 'Tracks SMS approval requests for phone number deletions. Admin receives SMS and responds YES/NO.';
COMMENT ON COLUMN pending_deletion_approvals.approval_status IS 'pending: awaiting response, approved: admin said yes, rejected: admin said no, expired: no response within 24h';
