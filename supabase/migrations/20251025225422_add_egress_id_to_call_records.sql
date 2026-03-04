-- Add egress_id column to call_records for deferred recording URL fetch
-- Instead of trying to fetch the recording URL immediately (which fails because
-- egress is still processing), we save the egress_id and fetch the URL later

-- Add the column
ALTER TABLE public.call_records
  ADD COLUMN IF NOT EXISTS egress_id TEXT;

-- Add index for querying calls by egress_id
CREATE INDEX IF NOT EXISTS idx_call_records_egress_id
  ON public.call_records(egress_id)
  WHERE egress_id IS NOT NULL;

-- Add comment
COMMENT ON COLUMN public.call_records.egress_id IS 'LiveKit Egress ID for deferred recording URL fetch';
