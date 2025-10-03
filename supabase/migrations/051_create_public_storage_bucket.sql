-- Create public storage bucket for voice previews and other public assets
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'public',
  'public',
  true,
  52428800, -- 50MB
  ARRAY['audio/mpeg', 'audio/mp3', 'image/png', 'image/jpeg', 'image/jpg', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Set up RLS policies for public bucket
CREATE POLICY "Public bucket is publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'public');

CREATE POLICY "Authenticated users can upload to public bucket"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'public' AND auth.role() = 'authenticated');

CREATE POLICY "Service role can manage public bucket"
ON storage.objects FOR ALL
USING (bucket_id = 'public' AND auth.role() = 'service_role');
