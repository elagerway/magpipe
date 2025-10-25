SELECT 
  id,
  contact_phone,
  call_sid,
  status,
  started_at,
  ended_at,
  duration_seconds,
  LENGTH(transcript) as transcript_length,
  SUBSTRING(transcript, 1, 200) as transcript_preview,
  recording_url
FROM call_records
ORDER BY started_at DESC
LIMIT 3;
