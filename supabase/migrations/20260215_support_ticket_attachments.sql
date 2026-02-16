-- Add attachments JSONB column to support_tickets
-- Each entry: {filename, url, mime_type, size_bytes}
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]';

-- Create storage bucket for support attachments
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'support-attachments',
  'support-attachments',
  true,
  5242880, -- 5MB
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml']
)
ON CONFLICT (id) DO NOTHING;

-- RLS policies for support-attachments bucket
CREATE POLICY "Public read access for support attachments"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'support-attachments');

CREATE POLICY "Authenticated users can upload support attachments"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'support-attachments');

CREATE POLICY "Service role full access to support attachments"
  ON storage.objects FOR ALL
  TO service_role
  USING (bucket_id = 'support-attachments');
