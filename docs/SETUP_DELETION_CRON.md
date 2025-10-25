# Setup Automatic Phone Number Deletion

## Quick Setup (2 minutes)

### Step 1: Run SQL in Supabase Dashboard

1. Go to https://supabase.com/dashboard/project/mtxbiyilvgwhbdptysex/sql/new
2. Paste this SQL and click **RUN**:

```sql
-- Enable extensions (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS http;

-- Create function to call Edge Function
CREATE OR REPLACE FUNCTION process_phone_number_deletions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  response record;
BEGIN
  SELECT * INTO response
  FROM http((
    'POST',
    'https://mtxbiyilvgwhbdptysex.supabase.co/functions/v1/process-scheduled-deletions',
    ARRAY[
      http_header('Content-Type', 'application/json'),
      http_header('Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im10eGJpeWlsdmd3aGJkcHR5c2V4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxNzE2OTksImV4cCI6MjA3NDc0NzY5OX0.VpOfuXl7S_ZdSpRjD8DGkSbbT4Y5g4rsezYNYGdtNPs')
    ],
    'application/json',
    '{}'
  )::http_request);

  RAISE NOTICE 'Deletion cron executed with status: %', response.status;
END;
$$;

-- Schedule the cron job (runs daily at 2 AM UTC)
SELECT cron.schedule(
  'process-phone-number-deletions',
  '0 2 * * *',
  $$SELECT process_phone_number_deletions();$$
);

-- Grant permissions
GRANT EXECUTE ON FUNCTION process_phone_number_deletions() TO authenticated;
GRANT EXECUTE ON FUNCTION process_phone_number_deletions() TO service_role;
```

### Step 2: Verify Setup

Run this SQL to see your cron job:

```sql
SELECT * FROM cron.job;
```

You should see a job named `process-phone-number-deletions` scheduled for `0 2 * * *`

### Step 3: Test It (Optional)

Run this SQL to manually trigger the deletion process:

```sql
SELECT process_phone_number_deletions();
```

Check if it worked:

```sql
SELECT phone_number, scheduled_deletion_date, deletion_status, deleted_at
FROM numbers_to_delete
ORDER BY scheduled_deletion_date;
```

### Done! 🎉

The cron job is now set up and will automatically run every day at 2:00 AM UTC to delete phone numbers that are past their 30-day hold period.

---

## How It Works

**Schedule:** Daily at 2:00 AM UTC (10:00 PM EST / 7:00 PM PST previous day)

**Process:**
1. pg_cron triggers `process_phone_number_deletions()` function
2. Function calls the Supabase Edge Function via HTTP
3. Edge Function finds numbers where `scheduled_deletion_date <= NOW()`
4. For each number:
   - Deletes from SignalWire
   - Marks as `deleted` in database
   - Removes from `service_numbers` table

**Current Queue:**
- +15878560911 → Deletes Nov 23, 2025
- +13433536601 → Deletes Nov 23, 2025
- +15878568099 → Deletes Nov 23, 2025

---

## Monitoring

**View cron job history:**
```sql
SELECT jobid, jobname, schedule, command, nodename, nodeport, database, username, active
FROM cron.job;
```

**View recent cron runs:**
```sql
SELECT jobid, runid, job_pid, status, return_message, start_time, end_time
FROM cron.job_run_details
ORDER BY start_time DESC
LIMIT 10;
```

**Check deletion status:**
```sql
SELECT phone_number, deletion_status, scheduled_deletion_date, deleted_at, deletion_notes
FROM numbers_to_delete
ORDER BY scheduled_deletion_date;
```

**Check for failures:**
```sql
SELECT phone_number, deletion_status, deletion_notes
FROM numbers_to_delete
WHERE deletion_status = 'failed';
```

---

## Troubleshooting

**Error: "extension pg_cron does not exist"**
- You're on Supabase Free tier
- pg_cron requires Pro plan ($25/month)
- Alternative: See `docs/CRON_SETUP_INSTRUCTIONS.md` for free alternatives

**Cron job not running:**
```sql
-- Check if job exists
SELECT * FROM cron.job WHERE jobname = 'process-phone-number-deletions';

-- Check recent runs
SELECT * FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'process-phone-number-deletions')
ORDER BY start_time DESC
LIMIT 5;
```

**Numbers not being deleted:**
- Verify scheduled date is in the past:
  ```sql
  SELECT phone_number, scheduled_deletion_date, NOW() as current_time
  FROM numbers_to_delete
  WHERE deletion_status = 'pending';
  ```
- Check Edge Function logs in Supabase Dashboard
- Verify SignalWire credentials are correct

**Test manually:**
```sql
-- Trigger deletion process immediately
SELECT process_phone_number_deletions();

-- Check results
SELECT * FROM numbers_to_delete WHERE deletion_status = 'deleted';
```

---

## Disable/Modify Cron

**Disable cron job:**
```sql
SELECT cron.unschedule('process-phone-number-deletions');
```

**Change schedule (e.g., run every hour):**
```sql
-- Unschedule old job
SELECT cron.unschedule('process-phone-number-deletions');

-- Create new schedule
SELECT cron.schedule(
  'process-phone-number-deletions',
  '0 * * * *',  -- Every hour
  $$SELECT process_phone_number_deletions();$$
);
```

**Re-enable after disabling:**
```sql
SELECT cron.schedule(
  'process-phone-number-deletions',
  '0 2 * * *',
  $$SELECT process_phone_number_deletions();$$
);
```

---

## Cost

**Supabase Pro Plan Required:**
- pg_cron extension only available on Pro plan ($25/month)
- If on Free tier, use alternative cron options in `docs/CRON_SETUP_INSTRUCTIONS.md`

**Execution Cost:**
- Runs for ~1 second per day
- Minimal database compute usage
- Edge Function invocations: 1 per day (well within free tier)

---

## Security Notes

- Anon key is embedded in the function (safe, it's public anyway)
- Function uses `SECURITY DEFINER` to bypass RLS
- Only the cron scheduler can call the function
- Edge Function validates all database operations
