-- Allow video uploads and increase size limit for support-attachments bucket
UPDATE storage.buckets
SET
  file_size_limit = 26214400, -- 25MB
  allowed_mime_types = ARRAY[
    'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
    'video/mp4', 'video/quicktime', 'video/webm'
  ]
WHERE id = 'support-attachments';
