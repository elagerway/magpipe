# Phone Number Deletion Cron Setup

## Option 1: Supabase pg_cron (Recommended - Pro Plan or Higher)

### Prerequisites
- Supabase Pro plan or higher (pg_cron extension)
- Database access to enable extensions

### Steps

1. **Enable pg_cron extension** in Supabase Dashboard:
   - Go to Database → Extensions
   - Search for "pg_cron"
   - Enable it

2. **Enable http extension** in Supabase Dashboard:
   - Go to Database → Extensions
   - Search for "http"
   - Enable it

3. **Set custom settings** in Supabase Dashboard:
   - Go to Project Settings → Database → Custom Postgres configuration
   - Add these settings:
     ```
     app.settings.supabase_url = 'https://api.magpipe.ai'
     app.settings.supabase_anon_key = 'YOUR_ANON_KEY'
     ```

4. **Apply migration 059**:
   ```bash
   export SUPABASE_ACCESS_TOKEN=your_token
   npx supabase db push --include-all
   ```
   - Confirm when prompted

5. **Verify cron job**:
   ```sql
   SELECT * FROM cron.job;
   ```
   - Should see `process-phone-number-deletions` scheduled for `0 2 * * *`

6. **Test manually** (optional):
   ```sql
   SELECT process_phone_number_deletions();
   ```

### How It Works

- **Cron Job**: Runs daily at 2:00 AM UTC
- **Function**: `process_phone_number_deletions()` calls the Edge Function
- **Edge Function**: `process-scheduled-deletions` deletes numbers from SignalWire
- **Automatic**: No external services needed

---

## Option 2: GitHub Actions (Free Alternative)

If you don't have Supabase Pro, use GitHub Actions to call the Edge Function daily.

### Steps

1. **Create workflow file** `.github/workflows/delete-phone-numbers.yml`:
   ```yaml
   name: Process Phone Number Deletions

   on:
     schedule:
       - cron: '0 2 * * *'  # Daily at 2 AM UTC
     workflow_dispatch:      # Allow manual trigger

   jobs:
     process-deletions:
       runs-on: ubuntu-latest
       steps:
         - name: Call Supabase Edge Function
           run: |
             curl -X POST \
               https://api.magpipe.ai/functions/v1/process-scheduled-deletions \
               -H "Authorization: Bearer ${{ secrets.SUPABASE_ANON_KEY }}" \
               -H "Content-Type: application/json"
   ```

2. **Add GitHub Secret**:
   - Go to repo Settings → Secrets → Actions
   - Add `SUPABASE_ANON_KEY` with your anon key

3. **Test manually**:
   - Go to Actions tab
   - Select "Process Phone Number Deletions"
   - Click "Run workflow"

---

## Option 3: EasyCron (Free Web Cron)

Use a free external cron service.

### Steps

1. Sign up at https://www.easycron.com (free tier: 1 cron job)

2. Create new cron job:
   - **URL**: `https://api.magpipe.ai/functions/v1/process-scheduled-deletions`
   - **Cron Expression**: `0 2 * * *` (daily 2 AM)
   - **HTTP Method**: POST
   - **Headers**:
     ```
     Authorization: Bearer YOUR_SUPABASE_ANON_KEY
     Content-Type: application/json
     ```

3. Save and enable

---

## Option 4: Vercel Cron (if using Vercel)

If you deploy to Vercel, use Vercel Cron.

### Steps

1. Create `api/cron-delete-numbers.js`:
   ```javascript
   export default async function handler(req, res) {
     // Verify cron secret
     if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
       return res.status(401).json({ error: 'Unauthorized' });
     }

     const response = await fetch(
       'https://api.magpipe.ai/functions/v1/process-scheduled-deletions',
       {
         method: 'POST',
         headers: {
           'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`,
           'Content-Type': 'application/json'
         }
       }
     );

     const result = await response.json();
     return res.status(200).json(result);
   }
   ```

2. Add to `vercel.json`:
   ```json
   {
     "crons": [{
       "path": "/api/cron-delete-numbers",
       "schedule": "0 2 * * *"
     }]
   }
   ```

3. Set environment variables in Vercel dashboard

---

## Current Status

**Numbers Scheduled for Deletion:**
- +15878560911 - Scheduled: 2025-11-23
- +13433536601 - Scheduled: 2025-11-23
- +15878568099 - Scheduled: 2025-11-23

**Cron Job Status:** ⚠️ Not yet configured

**Next Action Required:** Choose one of the options above and set it up.

---

## Verification

After setting up cron, verify it's working:

1. **Check cron runs**:
   ```sql
   SELECT * FROM cron.job_run_details
   WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'process-phone-number-deletions')
   ORDER BY start_time DESC
   LIMIT 10;
   ```

2. **Check deletion status**:
   ```sql
   SELECT phone_number, scheduled_deletion_date, deletion_status, deleted_at
   FROM numbers_to_delete
   ORDER BY scheduled_deletion_date;
   ```

3. **Manual test**:
   ```bash
   curl -X POST https://api.magpipe.ai/functions/v1/process-scheduled-deletions \
     -H "Authorization: Bearer YOUR_ANON_KEY"
   ```

---

## Troubleshooting

**Cron not running:**
- Check pg_cron is enabled: `SELECT * FROM pg_extension WHERE extname = 'pg_cron';`
- Check job exists: `SELECT * FROM cron.job;`
- Check for errors: `SELECT * FROM cron.job_run_details WHERE status = 'failed';`

**Edge Function failing:**
- Check function logs in Supabase Dashboard
- Verify SignalWire credentials are correct
- Test manually with curl command above

**Numbers not being deleted:**
- Check `scheduled_deletion_date` is in the past
- Check `deletion_status = 'pending'`
- Review Edge Function logs for errors
