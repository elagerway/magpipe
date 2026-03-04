-- Batch Calls: tables for tracking batch outbound call operations
-- Deploy via Supabase Management API (not supabase db push)

-- Table: batch_calls - Tracks each batch operation
CREATE TABLE IF NOT EXISTS batch_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  caller_id TEXT NOT NULL,
  agent_id UUID REFERENCES agent_configs(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'running', 'paused', 'completed', 'cancelled', 'failed')),

  -- Scheduling
  send_now BOOLEAN DEFAULT TRUE,
  scheduled_at TIMESTAMPTZ,

  -- Call window constraints
  window_start_time TIME DEFAULT '00:00',
  window_end_time TIME DEFAULT '23:59',
  window_days INTEGER[] DEFAULT '{0,1,2,3,4,5,6}',

  -- Concurrency
  max_concurrency INTEGER DEFAULT 1,
  reserved_concurrency INTEGER DEFAULT 5,

  -- Stats (denormalized for fast reads)
  total_recipients INTEGER DEFAULT 0,
  completed_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,

  -- Template reference
  template_id UUID REFERENCES outbound_call_templates(id) ON DELETE SET NULL,
  purpose TEXT,
  goal TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_batch_calls_user ON batch_calls (user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_batch_calls_scheduled ON batch_calls (scheduled_at) WHERE status = 'scheduled';

-- Table: batch_call_recipients - One row per recipient in a batch
CREATE TABLE IF NOT EXISTS batch_call_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID REFERENCES batch_calls(id) ON DELETE CASCADE NOT NULL,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  phone_number TEXT NOT NULL,
  name TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'calling', 'completed', 'failed', 'skipped', 'no_answer')),
  call_record_id UUID REFERENCES call_records(id) ON DELETE SET NULL,
  error_message TEXT,
  attempted_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_batch_recipients_batch ON batch_call_recipients (batch_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_batch_recipients_status ON batch_call_recipients (batch_id, status) WHERE status = 'pending';

-- RLS policies
ALTER TABLE batch_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE batch_call_recipients ENABLE ROW LEVEL SECURITY;

-- batch_calls: users can CRUD their own
CREATE POLICY batch_calls_select ON batch_calls FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY batch_calls_insert ON batch_calls FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY batch_calls_update ON batch_calls FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY batch_calls_delete ON batch_calls FOR DELETE USING (auth.uid() = user_id);

-- batch_calls: service role full access
CREATE POLICY batch_calls_service ON batch_calls FOR ALL USING (
  (current_setting('request.jwt.claims', true)::json->>'role') = 'service_role'
);

-- batch_call_recipients: access via batch ownership
CREATE POLICY batch_recipients_select ON batch_call_recipients FOR SELECT USING (
  EXISTS (SELECT 1 FROM batch_calls WHERE batch_calls.id = batch_call_recipients.batch_id AND batch_calls.user_id = auth.uid())
);
CREATE POLICY batch_recipients_insert ON batch_call_recipients FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM batch_calls WHERE batch_calls.id = batch_call_recipients.batch_id AND batch_calls.user_id = auth.uid())
);
CREATE POLICY batch_recipients_update ON batch_call_recipients FOR UPDATE USING (
  EXISTS (SELECT 1 FROM batch_calls WHERE batch_calls.id = batch_call_recipients.batch_id AND batch_calls.user_id = auth.uid())
);
CREATE POLICY batch_recipients_delete ON batch_call_recipients FOR DELETE USING (
  EXISTS (SELECT 1 FROM batch_calls WHERE batch_calls.id = batch_call_recipients.batch_id AND batch_calls.user_id = auth.uid())
);

-- batch_call_recipients: service role full access
CREATE POLICY batch_recipients_service ON batch_call_recipients FOR ALL USING (
  (current_setting('request.jwt.claims', true)::json->>'role') = 'service_role'
);
