# API Domain Migration Plan

**From:** `https://mtxbiyilvgwhbdptysex.supabase.co`
**To:** `https://api.magpipe.ai`

**Status:** Preparing (waiting for DNS propagation)

---

## Pre-Migration Checklist

- [x] Supabase custom domain configured
- [ ] DNS propagation complete
- [ ] SSL certificate provisioned
- [ ] Verify with: `curl -I https://api.magpipe.ai/functions/v1/`

---

## Phase 1: Code Changes (Ready to Deploy)

### Frontend
- [ ] `public/widget/magpipe-chat.js` - Update API_URL and SUPABASE_URL
- [ ] `src/pages/inbox.js` - Update fallback URLs (3 places)
- [ ] `src/voice-preview-generator.js` - Update hardcoded URL

### Edge Functions
- [ ] `supabase/functions/livekit-swml-handler/index.ts` - Webhook URLs (3 places)
- [ ] `supabase/functions/bridge-outbound-call/index.ts` - Recording callback
- [ ] `supabase/functions/transfer-cxml/index.ts` - Fallback URL
- [ ] `supabase/functions/send-password-reset/index.ts` - Fallback URL

### Documentation
- [ ] `docs/mint.json` - API base URL
- [ ] `docs/openapi.json` - Server URL
- [ ] `docs/api-reference/introduction.mdx`
- [ ] `docs/api-reference/authentication.mdx`
- [ ] All endpoint docs (30+ files)

### Tests
- [ ] Update all test files with new URL

### Scripts
- [ ] Update utility scripts

---

## Phase 2: External Services (Erik - After Code Deployed)

### SignalWire Phone Numbers
All webhook URLs need updating. Current format:
```
https://mtxbiyilvgwhbdptysex.supabase.co/functions/v1/webhook-inbound-call
https://mtxbiyilvgwhbdptysex.supabase.co/functions/v1/webhook-inbound-sms
```

New format:
```
https://api.magpipe.ai/functions/v1/webhook-inbound-call
https://api.magpipe.ai/functions/v1/webhook-inbound-sms
```

**Script to update all numbers:**
```bash
# Will be generated after migration
```

### SignalWire SIP Endpoints
Update SWML handler URLs in SIP configuration.

### Stripe Webhooks
1. Go to: https://dashboard.stripe.com/webhooks
2. Update endpoint URL from:
   `https://mtxbiyilvgwhbdptysex.supabase.co/functions/v1/stripe-webhook`
   To:
   `https://api.magpipe.ai/functions/v1/stripe-webhook`

### LiveKit Cloud
1. Go to LiveKit Cloud Dashboard
2. Update agent dispatch webhook URLs

### OAuth Providers

**Cal.com:**
- Redirect URI: `https://api.magpipe.ai/functions/v1/cal-com-oauth-callback`

**HubSpot:**
- Redirect URI: `https://api.magpipe.ai/functions/v1/integration-oauth-callback`

**Slack:**
- Redirect URI: `https://api.magpipe.ai/functions/v1/integration-oauth-callback`

### GitHub Actions
- [ ] `.github/workflows/sync-area-codes.yml` - Update webhook URL

---

## Phase 3: Database Migrations

Run after code is deployed:

```sql
-- Update scheduled actions cron job webhook URL
-- Update deletion processing cron job webhook URL
```

---

## Phase 4: Verification

- [ ] Inbound call works
- [ ] Outbound call works
- [ ] SMS send/receive works
- [ ] Chat widget works
- [ ] OAuth reconnection works (HubSpot, Slack, Cal.com)
- [ ] Scheduled actions execute
- [ ] Stripe webhooks received
- [ ] Playwright tests pass

---

## Rollback Plan

If issues occur:

1. **Immediate**: Point DNS back to old URL (or remove CNAME)
2. **Code**: `git revert <migration-commit>`
3. **Webhooks**: Re-point all services to old Supabase URL

---

## Notes

- Old URL will continue to work (Supabase doesn't disable default URL)
- Can run both in parallel during transition
- Monitor error logs after migration
