-- Per-turn voice latency metrics for the LiveKit agent (PSTN -> Agent QoS).
-- One row per assistant turn, sourced from livekit-agents 1.5 ChatMessage.metrics
-- (MetricsReport). Lets us see WHERE the response gap comes from instead of guessing.
--
--   e2e_latency_ms        = end of caller speech -> agent begins responding (headline)
--   end_of_turn_delay_ms  = turn-detector / endpointing decision time (caller-side)
--   transcription_delay_ms= STT finalize lag after end of speech (caller-side)
--   llm_ttft_ms           = LLM time-to-first-token (assistant-side)
--   tts_ttfb_ms           = TTS time-to-first-audio-byte (assistant-side)
--
-- NOTE: this does NOT include network transport (SignalWire -> LiveKit edge ->
-- Render agent). The agent only sees audio once it arrives; transport is a
-- separate axis measured by geographic colocation, not by these numbers.

CREATE TABLE IF NOT EXISTS public.call_latency_metrics (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now() NOT NULL,
  room_name text,
  call_record_id uuid REFERENCES public.call_records(id) ON DELETE SET NULL,
  user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  agent_id uuid,
  direction text,                  -- 'inbound' | 'outbound'
  turn_index integer NOT NULL DEFAULT 0,
  e2e_latency_ms integer,          -- headline: end of speech -> agent responds
  end_of_turn_delay_ms integer,    -- turn detection / endpointing (caller-side)
  transcription_delay_ms integer,  -- STT finalize lag (caller-side)
  llm_ttft_ms integer,             -- LLM time-to-first-token (assistant-side)
  tts_ttfb_ms integer,             -- TTS time-to-first-byte (assistant-side)
  llm_model text,
  tts_model text,
  metadata jsonb DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_call_latency_metrics_created_at ON public.call_latency_metrics (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_call_latency_metrics_user_id ON public.call_latency_metrics (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_call_latency_metrics_call_record_id ON public.call_latency_metrics (call_record_id);

-- RLS mirrors system_error_logs: admin/god/support read, service_role (agent) inserts.
ALTER TABLE public.call_latency_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin/god/support can view latency metrics" ON public.call_latency_metrics;
CREATE POLICY "Admin/god/support can view latency metrics"
  ON public.call_latency_metrics FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
      AND users.role IN ('admin', 'god', 'support')
    )
  );

DROP POLICY IF EXISTS "Service role can insert latency metrics" ON public.call_latency_metrics;
CREATE POLICY "Service role can insert latency metrics"
  ON public.call_latency_metrics FOR INSERT TO service_role WITH CHECK (true);
