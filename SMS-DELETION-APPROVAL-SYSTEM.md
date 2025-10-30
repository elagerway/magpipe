# SMS Deletion Approval System

## Overview

Phone number deletions now require SMS approval from the admin before being processed. This prevents accidental deletions and provides an audit trail.

## How It Works

### 1. User Queues Number for Deletion
- User clicks "Delete" on a phone number in Pat UI
- Number is moved to `numbers_to_delete` table with `deletion_status='pending'`
- System automatically sends SMS to admin

### 2. Admin Receives SMS
```
Phone Number Deletion Request

Numbers: +12025551234, +13105559876
User: 77873635-9f5a-4eee-90f3-d145aed0c2c4

Reply YES to approve deletion
Reply NO to reject and remove from Pat

Approval ID: a1b2c3d4
```

### 3. Admin Responds

#### If Admin Replies **YES** (or Y/y/yes):
1. Approval status → `approved`
2. Deletion status → `approved`
3. Number will be deleted from SignalWire on next cron run (2 AM UTC)
4. Admin receives confirmation: "Deletion approved. Numbers will be released."

#### If Admin Replies **NO** (or N/n/no):
1. Approval status → `rejected`
2. Number removed from deletion queue
3. SignalWire number label updated to: `removed_from_pat_{user_id}`
4. Admin receives confirmation: "Deletion rejected. Numbers removed from queue and labeled in SignalWire."

## Database Tables

### `pending_deletion_approvals`
Tracks SMS approval requests.

```sql
- id: UUID
- deletion_record_id: References numbers_to_delete
- phone_numbers: Comma-separated list
- user_id: User who requested deletion
- admin_phone: Admin's phone number
- approval_status: 'pending' | 'approved' | 'rejected' | 'expired'
- approval_sms_sid: SignalWire message SID
- response_received_at: When admin responded
- response_text: Admin's response (yes/no)
- expires_at: 24 hours from creation
```

### `numbers_to_delete`
**Updated field:**
- `deletion_status`: Now requires `'approved'` status (not `'pending'`) for cron to process

## Edge Functions

### `request-deletion-approval`
- Called automatically by `queue-number-deletion`
- Sends SMS to admin via SignalWire
- Creates approval record in database

### `handle-deletion-approval`
- **Webhook endpoint for SignalWire**
- Receives admin's YES/NO response
- Updates approval status
- If YES: Sets deletion_status to 'approved'
- If NO: Removes from queue + updates SignalWire label

### `queue-number-deletion` (Updated)
- Queues number for deletion
- Automatically requests approval via SMS
- Returns `approval_requested: true`

### `process-scheduled-deletions` (Updated)
- Only processes deletions with `deletion_status='approved'`
- Runs daily at 2 AM UTC via pg_cron

## Setup Instructions

### 1. Set Admin Phone Number
```bash
# In Supabase Dashboard → Project Settings → Edge Functions → Secrets
ADMIN_PHONE_NUMBER=+12025551234
```

### 2. Deploy Edge Functions
```bash
export SUPABASE_ACCESS_TOKEN=your_token
npx supabase functions deploy request-deletion-approval
npx supabase functions deploy handle-deletion-approval
npx supabase functions deploy queue-number-deletion
npx supabase functions deploy process-scheduled-deletions
```

### 3. Apply Database Migration
```bash
npx supabase db push
```

### 4. Configure SignalWire Webhook
In SignalWire Dashboard, set the webhook for incoming SMS on your admin number to:
```
https://your-project.supabase.co/functions/v1/handle-deletion-approval
```

## Testing

### Test Approval Flow
```bash
# 1. Queue a number for deletion
curl -X POST https://your-project.supabase.co/functions/v1/queue-number-deletion \
  -H "Authorization: Bearer YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "phone_numbers": ["+12025551234"]}'

# 2. Check for SMS on admin phone

# 3. Reply with "YES" or "NO"

# 4. Verify approval status
# Check pending_deletion_approvals table
```

## Important Notes

- **24-Hour Expiry**: Approvals expire after 24 hours if no response
- **Admin Phone**: Only one admin phone number supported (set in env var)
- **Cron Schedule**: Deletions only process at 2 AM UTC daily
- **SignalWire Labels**: Rejected numbers get labeled `removed_from_pat_{user_id}`
- **Audit Trail**: All approval requests and responses are logged in database

## Troubleshooting

### SMS Not Received
- Check ADMIN_PHONE_NUMBER env var is set correctly
- Verify SignalWire credentials are valid
- Check Edge Function logs for errors

### Response Not Processing
- Verify SignalWire webhook URL is configured
- Check that admin phone number matches exactly
- Look for Edge Function logs in handle-deletion-approval

### Numbers Not Deleting
- Verify approval_status is 'approved'
- Check deletion_status is 'approved' (not 'pending')
- Confirm cron job is running (check pg_cron logs)
