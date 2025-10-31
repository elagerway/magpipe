-- Add outbound call disposition types
-- Previously only supported inbound AI-answered calls
-- Now supporting user-initiated outbound calls

ALTER TABLE call_records
DROP CONSTRAINT IF EXISTS call_records_disposition_check;

ALTER TABLE call_records
ADD CONSTRAINT call_records_disposition_check CHECK (disposition IN (
  -- Inbound dispositions (AI-answered calls)
  'answered_by_pat',
  'transferred_to_user',
  'screened_out',
  'voicemail',

  -- Outbound dispositions (user-initiated calls)
  'outbound_completed',  -- Call was answered and completed
  'outbound_no_answer',  -- Call rang but wasn't answered
  'outbound_busy',       -- Busy signal
  'outbound_failed',     -- Call failed to connect

  -- Generic
  'failed'
));

-- Add comment to document disposition types
COMMENT ON COLUMN call_records.disposition IS
'Call outcome:
Inbound: answered_by_pat, transferred_to_user, screened_out, voicemail, failed
Outbound: outbound_completed, outbound_no_answer, outbound_busy, outbound_failed';
