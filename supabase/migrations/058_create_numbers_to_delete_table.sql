-- Migration 058: Create numbers_to_delete table
-- Holds phone numbers scheduled for deletion with 30-day hold period

CREATE TABLE IF NOT EXISTS numbers_to_delete (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL,
  phone_sid TEXT NOT NULL,
  provider TEXT DEFAULT 'signalwire',

  -- Deletion tracking
  deactivated_at TIMESTAMPTZ DEFAULT NOW(),
  scheduled_deletion_date TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  deletion_status TEXT DEFAULT 'pending' CHECK (deletion_status IN ('pending', 'deleting', 'deleted', 'failed')),

  -- Metadata
  friendly_name TEXT,
  capabilities JSONB,
  deletion_notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_numbers_to_delete_user_id ON numbers_to_delete(user_id);
CREATE INDEX idx_numbers_to_delete_scheduled_date ON numbers_to_delete(scheduled_deletion_date) WHERE deletion_status = 'pending';
CREATE INDEX idx_numbers_to_delete_phone_number ON numbers_to_delete(phone_number);

-- Enable RLS
ALTER TABLE numbers_to_delete ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own numbers to delete"
  ON numbers_to_delete
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own numbers to delete"
  ON numbers_to_delete
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own numbers to delete"
  ON numbers_to_delete
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

-- Add trigger for updated_at
CREATE TRIGGER numbers_to_delete_updated_at
  BEFORE UPDATE ON numbers_to_delete
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Comments
COMMENT ON TABLE numbers_to_delete IS 'Phone numbers scheduled for deletion with 30-day hold period before removal from provider';
COMMENT ON COLUMN numbers_to_delete.scheduled_deletion_date IS 'Date when number should be deleted from provider (30 days from deactivation)';
COMMENT ON COLUMN numbers_to_delete.deletion_status IS 'Current status: pending (waiting), deleting (in progress), deleted (complete), failed (error occurred)';
COMMENT ON COLUMN numbers_to_delete.deletion_notes IS 'Notes or error messages related to deletion process';
