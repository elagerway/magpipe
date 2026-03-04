-- Create voices table for user's cloned and preset voices
CREATE TABLE IF NOT EXISTS public.voices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,

  -- Voice identifiers
  voice_id TEXT NOT NULL, -- ElevenLabs voice ID (for cloned) or preset ID (11labs-Kate, etc)
  voice_name TEXT NOT NULL,
  is_cloned BOOLEAN DEFAULT true,

  -- ElevenLabs voice settings (used during TTS generation)
  stability NUMERIC(3,2) DEFAULT 0.50 CHECK (stability BETWEEN 0 AND 1),
  similarity_boost NUMERIC(3,2) DEFAULT 0.75 CHECK (similarity_boost BETWEEN 0 AND 1),
  style NUMERIC(3,2) DEFAULT 0.00 CHECK (style BETWEEN 0 AND 1),
  use_speaker_boost BOOLEAN DEFAULT true,

  -- Retell voice settings (used during calls)
  voice_speed NUMERIC(3,2) DEFAULT 1.00 CHECK (voice_speed BETWEEN 0.5 AND 2.0),
  voice_temperature NUMERIC(3,2) DEFAULT 1.00 CHECK (voice_temperature BETWEEN 0 AND 2.0),
  interruption_sensitivity NUMERIC(3,2) DEFAULT 1.00 CHECK (interruption_sensitivity BETWEEN 0 AND 1),
  responsiveness NUMERIC(3,2) DEFAULT 1.00 CHECK (responsiveness BETWEEN 0 AND 2.0),
  enable_backchannel BOOLEAN DEFAULT false,

  -- Audio settings
  agent_volume NUMERIC(3,2) DEFAULT 1.00 CHECK (agent_volume BETWEEN 0 AND 2.0),
  ambient_sound TEXT DEFAULT 'off' CHECK (ambient_sound IN ('off', 'coffee-shop', 'convention-hall', 'summer-outdoor', 'mountain-outdoor', 'high-school-hallway')),
  ambient_sound_volume NUMERIC(3,2) DEFAULT 1.00 CHECK (ambient_sound_volume BETWEEN 0 AND 2.0),
  noise_suppression TEXT DEFAULT 'medium' CHECK (noise_suppression IN ('off', 'low', 'medium', 'high')),

  -- Boosted keywords (array of words to emphasize)
  boosted_keywords TEXT[] DEFAULT ARRAY[]::TEXT[],

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_voices_user_id ON public.voices(user_id);
CREATE INDEX IF NOT EXISTS idx_voices_voice_id ON public.voices(voice_id);

-- Enable Row Level Security
ALTER TABLE public.voices ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only access their own voices
CREATE POLICY "Users can view own voices"
  ON public.voices
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own voices"
  ON public.voices
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own voices"
  ON public.voices
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own voices"
  ON public.voices
  FOR DELETE
  USING (auth.uid() = user_id);

-- Updated at trigger
CREATE TRIGGER update_voices_updated_at
  BEFORE UPDATE ON public.voices
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Comments
COMMENT ON TABLE public.voices IS 'User voice library including cloned and preset voices with metadata';
COMMENT ON COLUMN public.voices.voice_id IS 'ElevenLabs voice ID or preset identifier (11labs-Kate, etc)';
COMMENT ON COLUMN public.voices.stability IS 'ElevenLabs: Voice consistency (0=variable, 1=stable)';
COMMENT ON COLUMN public.voices.similarity_boost IS 'ElevenLabs: Similarity to original voice (0=low, 1=high)';
COMMENT ON COLUMN public.voices.style IS 'ElevenLabs: Style exaggeration (0=neutral, 1=expressive)';
COMMENT ON COLUMN public.voices.use_speaker_boost IS 'ElevenLabs: Enhance speaker similarity';
COMMENT ON COLUMN public.voices.voice_speed IS 'Retell: Speech speed multiplier (0.5=slow, 2.0=fast)';
COMMENT ON COLUMN public.voices.voice_temperature IS 'Retell: Speech creativity/randomness (0=consistent, 2=varied)';
COMMENT ON COLUMN public.voices.interruption_sensitivity IS 'Retell: How easily voice can be interrupted (0=hard, 1=easy)';
COMMENT ON COLUMN public.voices.responsiveness IS 'Retell: Response delay (0=slow, 2=instant)';
COMMENT ON COLUMN public.voices.enable_backchannel IS 'Retell: Enable conversational fillers (uh-huh, mm-hmm)';
COMMENT ON COLUMN public.voices.boosted_keywords IS 'Words to emphasize during speech';
