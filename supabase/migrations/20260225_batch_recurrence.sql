-- Batch Calls Recurrence: Add repeating schedule support to batch_calls
-- Deploy via Supabase Management API (not supabase db push)

-- Add recurrence columns to batch_calls
ALTER TABLE batch_calls
  ADD COLUMN IF NOT EXISTS recurrence_type TEXT DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS recurrence_interval INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS recurrence_end_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS recurrence_max_runs INTEGER,
  ADD COLUMN IF NOT EXISTS recurrence_run_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS parent_batch_id UUID REFERENCES batch_calls(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS occurrence_number INTEGER;

-- Update status constraint to include 'recurring'
-- Drop existing constraint and recreate
ALTER TABLE batch_calls DROP CONSTRAINT IF EXISTS batch_calls_status_check;
ALTER TABLE batch_calls ADD CONSTRAINT batch_calls_status_check
  CHECK (status IN ('draft', 'scheduled', 'running', 'paused', 'completed', 'cancelled', 'failed', 'recurring'));

-- Add constraint on recurrence_type values
ALTER TABLE batch_calls ADD CONSTRAINT batch_calls_recurrence_type_check
  CHECK (recurrence_type IN ('none', 'hourly', 'daily', 'weekly', 'monthly'));

-- Indexes for recurring batch lookups
CREATE INDEX IF NOT EXISTS idx_batch_calls_parent ON batch_calls (parent_batch_id) WHERE parent_batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_batch_calls_recurring ON batch_calls (status, user_id) WHERE status = 'recurring';
