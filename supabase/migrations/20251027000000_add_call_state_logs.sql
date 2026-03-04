-- Create call_state_logs table to track every step of call lifecycle
CREATE TABLE IF NOT EXISTS public.call_state_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id UUID REFERENCES public.call_records(id) ON DELETE CASCADE,
  room_name TEXT, -- LiveKit room name for correlation
  state TEXT NOT NULL, -- 'initiated', 'room_created', 'sip_participant_created', 'agent_dispatched', 'agent_connected', 'call_answered', 'call_ended', 'error'
  component TEXT NOT NULL, -- 'edge_function', 'agent', 'sip', 'browser'
  details JSONB, -- Additional details about this state
  error_message TEXT, -- If state is 'error'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_call_state_logs_call_id ON public.call_state_logs(call_id);
CREATE INDEX IF NOT EXISTS idx_call_state_logs_room_name ON public.call_state_logs(room_name);
CREATE INDEX IF NOT EXISTS idx_call_state_logs_created_at ON public.call_state_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_call_state_logs_state ON public.call_state_logs(state);

-- Enable RLS
ALTER TABLE public.call_state_logs ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
CREATE POLICY "Service role has full access to call_state_logs"
  ON public.call_state_logs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Allow authenticated users to view their own call state logs
CREATE POLICY "Users can view their call state logs"
  ON public.call_state_logs
  FOR SELECT
  TO authenticated
  USING (
    call_id IN (
      SELECT id FROM public.call_records WHERE user_id = auth.uid()
    )
  );

COMMENT ON TABLE public.call_state_logs IS 'Tracks every state transition in the call lifecycle for debugging';
COMMENT ON COLUMN public.call_state_logs.state IS 'Current state: initiated, room_created, sip_participant_created, agent_dispatched, agent_connected, call_answered, call_ended, error';
COMMENT ON COLUMN public.call_state_logs.component IS 'Which component logged this state: edge_function, agent, sip, browser';
COMMENT ON COLUMN public.call_state_logs.details IS 'Additional details like participant IDs, error codes, timestamps';
