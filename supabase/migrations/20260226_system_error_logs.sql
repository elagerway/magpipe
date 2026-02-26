-- System error logs table for tracking SMS verification failures, notification errors, etc.
CREATE TABLE IF NOT EXISTS system_error_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now() NOT NULL,
  error_type text NOT NULL,         -- e.g. 'sms_verification', 'sms_notification'
  error_code text,                  -- e.g. '30006', 'ECONNREFUSED'
  error_message text NOT NULL,
  user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  metadata jsonb DEFAULT '{}'::jsonb -- phone_number, from_number, edge_function, etc.
);

-- Index for admin queries
CREATE INDEX idx_system_error_logs_created_at ON system_error_logs (created_at DESC);
CREATE INDEX idx_system_error_logs_error_type ON system_error_logs (error_type);
CREATE INDEX idx_system_error_logs_user_id ON system_error_logs (user_id);

-- RLS: admin/god/support can read
ALTER TABLE system_error_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/god/support can view error logs"
  ON system_error_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('admin', 'god', 'support')
    )
  );

-- Service role (edge functions) can insert
CREATE POLICY "Service role can insert error logs"
  ON system_error_logs FOR INSERT
  WITH CHECK (true);
