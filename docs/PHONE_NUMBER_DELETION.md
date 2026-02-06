# Phone Number Deletion System

## Overview

Phone numbers require a 30-day hold period before deletion from SignalWire. This system automates the process of scheduling and executing number deletions.

## Database Tables

### `numbers_to_delete`
Holds phone numbers scheduled for deletion with 30-day hold period.

**Columns:**
- `id` - UUID primary key
- `user_id` - Reference to users table
- `phone_number` - E.164 formatted number
- `phone_sid` - SignalWire SID for the number
- `provider` - Default 'signalwire'
- `deactivated_at` - When number was deactivated
- `scheduled_deletion_date` - Date when deletion should occur (30 days from deactivation)
- `deleted_at` - When deletion was completed
- `deletion_status` - `pending`, `deleting`, `deleted`, or `failed`
- `friendly_name` - Display name
- `capabilities` - JSON object with voice/sms/mms flags
- `deletion_notes` - Notes or error messages

## Edge Functions

### `queue-number-deletion`
Deactivates service numbers and queues them for deletion.

**Request:**
```json
{
  "email": "user@example.com",
  "phone_numbers": ["+16282954771", "+15878560911"]
}
```

**Response:**
```json
{
  "success": true,
  "scheduled_deletion_date": "2025-11-23T22:20:09.934Z",
  "results": [
    {
      "phone_number": "+16282954771",
      "success": true,
      "scheduled_deletion_date": "2025-11-23T22:20:09.934Z"
    }
  ]
}
```

### `process-scheduled-deletions`
Processes all numbers whose scheduled_deletion_date has passed.

**Scheduled Execution:**
This function should be called daily via cron job or manually when needed.

**What it does:**
1. Finds all `pending` numbers with `scheduled_deletion_date <= NOW()`
2. For each number:
   - Updates status to `deleting`
   - Calls SignalWire DELETE API
   - On success: marks as `deleted`, removes from `service_numbers`
   - On failure: marks as `failed` with error message

**Manual Invocation:**
```bash
curl -X POST https://api.magpipe.ai/functions/v1/process-scheduled-deletions \
  -H "Authorization: Bearer ANON_KEY"
```

### `activate-service-number`
Activates a specific service number and deactivates all others for a user.

**Request:**
```json
{
  "email": "user@example.com",
  "phone_number": "+16282954771"
}
```

## Scripts

### `scripts/queue-numbers-for-deletion.js`
Queues multiple numbers for deletion.

**Usage:**
```bash
node scripts/queue-numbers-for-deletion.js
```

### `scripts/activate-erik-number.js`
Activates a specific number for erik@snapsonic.com.

**Usage:**
```bash
node scripts/activate-erik-number.js
```

## Workflow

### Deactivating and Scheduling Numbers for Deletion

1. User deactivates a number (or admin queues it)
2. Number is added to `numbers_to_delete` with:
   - `deletion_status = 'pending'`
   - `scheduled_deletion_date = NOW() + 30 days`
   - `deactivated_at = NOW()`
3. Number is marked as `is_active = false` in `service_numbers`

### Processing Scheduled Deletions

1. Cron job calls `process-scheduled-deletions` daily
2. Function finds all numbers with `scheduled_deletion_date <= NOW()` and `deletion_status = 'pending'`
3. For each number:
   - Marks as `deleting`
   - Calls SignalWire API to delete
   - On success: marks as `deleted`, removes from `service_numbers`
   - On failure: marks as `failed` with error notes

### Setting Up Cron Job

**Option 1: Supabase Cron (pg_cron)**
```sql
-- Run daily at 2:00 AM UTC
SELECT cron.schedule(
  'process-phone-deletions',
  '0 2 * * *',
  $$
  SELECT net.http_post(
    url := 'https://api.magpipe.ai/functions/v1/process-scheduled-deletions',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb
  );
  $$
);
```

**Option 2: External Cron Service**
Use a service like GitHub Actions, Render Cron Jobs, or Vercel Cron to call the function daily.

**GitHub Actions Example:**
```yaml
name: Process Phone Number Deletions
on:
  schedule:
    - cron: '0 2 * * *'  # Daily at 2 AM UTC
  workflow_dispatch:  # Allow manual trigger

jobs:
  process-deletions:
    runs-on: ubuntu-latest
    steps:
      - name: Call Supabase Function
        run: |
          curl -X POST https://api.magpipe.ai/functions/v1/process-scheduled-deletions \
            -H "Authorization: Bearer ${{ secrets.SUPABASE_ANON_KEY }}"
```

## Migration Applied

- **058_create_numbers_to_delete_table.sql** - Creates the `numbers_to_delete` table with RLS policies

## Example Usage

### Queue numbers for deletion
```bash
# Via script
node scripts/queue-numbers-for-deletion.js

# Via API
curl -X POST https://api.magpipe.ai/functions/v1/queue-number-deletion \
  -H "Authorization: Bearer ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "erik@snapsonic.com",
    "phone_numbers": ["+15878560911", "+13433536601"]
  }'
```

### Check numbers scheduled for deletion
```sql
SELECT phone_number, scheduled_deletion_date, deletion_status
FROM numbers_to_delete
WHERE deletion_status = 'pending'
ORDER BY scheduled_deletion_date;
```

### Manually trigger deletion processing
```bash
curl -X POST https://api.magpipe.ai/functions/v1/process-scheduled-deletions \
  -H "Authorization: Bearer ANON_KEY"
```

## Current Status (2025-10-24)

### Active Numbers
- **erik@snapsonic.com**: `+16282954771` ✅ ACTIVE

### Scheduled for Deletion (2025-11-23)
- `+15878560911` - Status: pending
- `+13433536601` - Status: pending
- `+15878568099` - Status: pending

## Notes

- **30-day hold period**: Required by SignalWire before numbers can be released
- **Deletion is permanent**: Once deleted from SignalWire, numbers cannot be recovered
- **Failed deletions**: Review `deletion_notes` for errors and retry manually if needed
- **SignalWire project**: Currently using `your-signalwire-project-id`
