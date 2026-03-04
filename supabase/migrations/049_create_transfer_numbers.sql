-- Create transfer_numbers table
CREATE TABLE IF NOT EXISTS transfer_numbers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id TEXT,
  llm_id TEXT,
  label TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_transfer_numbers_user_id ON transfer_numbers(user_id);
CREATE INDEX IF NOT EXISTS idx_transfer_numbers_agent_id ON transfer_numbers(agent_id);

-- Enable RLS
ALTER TABLE transfer_numbers ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own transfer numbers"
  ON transfer_numbers FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own transfer numbers"
  ON transfer_numbers FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own transfer numbers"
  ON transfer_numbers FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own transfer numbers"
  ON transfer_numbers FOR DELETE
  USING (auth.uid() = user_id);

-- Create updated_at trigger function if it doesn't exist
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add updated_at trigger
CREATE TRIGGER update_transfer_numbers_updated_at
  BEFORE UPDATE ON transfer_numbers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
