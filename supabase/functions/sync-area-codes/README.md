# Area Code Sync Function

This Edge Function synchronizes the `area_codes` table with data from NANPA (North American Numbering Plan Administration).

## Purpose

Keeps the Canadian area code database up-to-date for USA SMS compliance. The system uses this data to determine whether a phone number is from the US or Canada, which affects:

- Which sender number to use (USA campaign number vs regular service number)
- SMS compliance requirements (STOP/CANCEL keywords)

## Setup

### 1. Deploy the Function

```bash
export SUPABASE_ACCESS_TOKEN=your_access_token
npx supabase functions deploy sync-area-codes --no-verify-jwt
```

### 2. Set the Sync Secret

Add a secret in GitHub repository settings:

1. Go to: Settings → Secrets and variables → Actions
2. Create new secret: `SYNC_SECRET`
3. Value: Choose a secure random string (e.g., `Bearer abc123xyz456`)

### 3. Add the Secret to Supabase

Add the same secret to your Supabase environment:

```bash
npx supabase secrets set SYNC_SECRET="Bearer abc123xyz456"
```

## Automated Sync

The GitHub Actions workflow (`.github/workflows/sync-area-codes.yml`) runs:
- **Automatically**: Every Sunday at 2 AM UTC
- **Manually**: Via the "Actions" tab in GitHub

## Manual Trigger

You can also trigger the sync manually:

```bash
curl -X POST \
  -H "Authorization: Bearer your_sync_secret" \
  https://api.magpipe.ai/functions/v1/sync-area-codes
```

## Data Source

Currently uses a hardcoded list of Canadian area codes that should be updated quarterly by checking:

1. **NANPA Official Site**: https://www.nationalnanpa.com/
2. **Canadian NPAs**: https://www.nationalnanpa.com/area_codes/index.html
3. **CRTC (Canada)**: https://crtc.gc.ca/

### Future Improvements

Consider implementing automatic scraping from NANPA or using a third-party API like:
- Twilio Lookup API
- Google libphonenumber metadata
- NANPA's reporting tools

## Monitoring

Check the function logs in Supabase Dashboard:
- Dashboard → Edge Functions → sync-area-codes → Logs

The function returns:
```json
{
  "success": true,
  "updated": 52,
  "total": 52,
  "timestamp": "2025-09-30T10:00:00.000Z"
}
```
