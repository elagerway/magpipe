-- ============================================================================
-- CONSOLIDATED MIGRATIONS FOR SUPABASE SQL EDITOR
-- ============================================================================
-- This file contains migrations 060, 061, 062, and 20251031120000
-- Copy and paste this entire file into Supabase SQL Editor and run it
-- URL: https://supabase.com/dashboard/project/mtxbiyilvgwhbdptysex/sql/new
-- ============================================================================

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
CREATE INDEX IF NOT EXISTS idx_pending_approvals_status ON pending_deletion_approvals(approval_status);
CREATE INDEX IF NOT EXISTS idx_pending_approvals_admin_phone ON pending_deletion_approvals(admin_phone);
CREATE INDEX IF NOT EXISTS idx_pending_approvals_expires ON pending_deletion_approvals(expires_at);

-- RLS policies
ALTER TABLE pending_deletion_approvals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access" ON pending_deletion_approvals;
CREATE POLICY "Service role full access" ON pending_deletion_approvals
  FOR ALL USING (auth.role() = 'service_role');

-- Trigger to update updated_at
DROP TRIGGER IF EXISTS update_pending_deletion_approvals_updated_at ON pending_deletion_approvals;
CREATE TRIGGER update_pending_deletion_approvals_updated_at
  BEFORE UPDATE ON pending_deletion_approvals
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Comments
COMMENT ON TABLE pending_deletion_approvals IS 'Tracks SMS approval requests for phone number deletions. Admin receives SMS and responds YES/NO.';
COMMENT ON COLUMN pending_deletion_approvals.approval_status IS 'pending: awaiting response, approved: admin said yes, rejected: admin said no, expired: no response within 24h';

-- ============================================================================

-- Migration 061: Add unique constraint to prevent duplicate phone numbers in deletion queue
-- A phone number should only appear once in numbers_to_delete per user

-- Add unique constraint on (user_id, phone_number)
-- This prevents the same number from being queued multiple times by the same user
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'unique_user_phone_in_deletion'
  ) THEN
    ALTER TABLE numbers_to_delete
    ADD CONSTRAINT unique_user_phone_in_deletion UNIQUE (user_id, phone_number);
  END IF;
END$$;

-- Comment explaining the constraint
COMMENT ON CONSTRAINT unique_user_phone_in_deletion ON numbers_to_delete IS
  'Ensures each phone number can only appear once in deletion queue per user, preventing duplicates from double-clicks or retries';

-- ============================================================================

-- Migration 062: Add purchased_at field to numbers_to_delete
-- This allows us to preserve the original purchase date when cancelling deletion

ALTER TABLE numbers_to_delete
ADD COLUMN IF NOT EXISTS purchased_at TIMESTAMPTZ;

COMMENT ON COLUMN numbers_to_delete.purchased_at IS 'Original purchase date of the number (preserved from service_numbers for accurate 30-day hold calculation)';

-- ============================================================================

-- Migration 20251031120000: Add SIP credential fields to service_numbers table

ALTER TABLE service_numbers
ADD COLUMN IF NOT EXISTS sip_username VARCHAR(255),
ADD COLUMN IF NOT EXISTS sip_password VARCHAR(255),
ADD COLUMN IF NOT EXISTS sip_domain VARCHAR(255) DEFAULT 'erik.signalwire.com',
ADD COLUMN IF NOT EXISTS sip_ws_server VARCHAR(255) DEFAULT 'wss://erik.signalwire.com:7443';

-- Add comments
COMMENT ON COLUMN service_numbers.sip_username IS 'SIP username for WebRTC calling';
COMMENT ON COLUMN service_numbers.sip_password IS 'SIP password (should be encrypted in production)';
COMMENT ON COLUMN service_numbers.sip_domain IS 'SIP domain (SignalWire space)';
COMMENT ON COLUMN service_numbers.sip_ws_server IS 'WebSocket server for SIP over WebRTC';

-- ============================================================================
-- VERIFICATION QUERIES
-- Run these after the migrations to verify everything worked
-- ============================================================================

-- Check that pending_deletion_approvals table exists
SELECT 'pending_deletion_approvals table' as check_name,
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'pending_deletion_approvals')
            THEN '✅ EXISTS' ELSE '❌ MISSING' END as status;

-- Check that unique constraint was added
SELECT 'unique_user_phone_in_deletion constraint' as check_name,
       CASE WHEN EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'unique_user_phone_in_deletion')
            THEN '✅ EXISTS' ELSE '❌ MISSING' END as status;

-- Check that purchased_at column was added to numbers_to_delete
SELECT 'numbers_to_delete.purchased_at column' as check_name,
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'numbers_to_delete' AND column_name = 'purchased_at')
            THEN '✅ EXISTS' ELSE '❌ MISSING' END as status;

-- Check that all SIP credential columns were added
SELECT 'service_numbers.sip_username' as check_name,
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'service_numbers' AND column_name = 'sip_username')
            THEN '✅ EXISTS' ELSE '❌ MISSING' END as status
UNION ALL
SELECT 'service_numbers.sip_password',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'service_numbers' AND column_name = 'sip_password')
            THEN '✅ EXISTS' ELSE '❌ MISSING' END
UNION ALL
SELECT 'service_numbers.sip_domain',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'service_numbers' AND column_name = 'sip_domain')
            THEN '✅ EXISTS' ELSE '❌ MISSING' END
UNION ALL
SELECT 'service_numbers.sip_ws_server',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'service_numbers' AND column_name = 'sip_ws_server')
            THEN '✅ EXISTS' ELSE '❌ MISSING' END;

-- ============================================================================
-- ALL DONE!
-- ============================================================================
