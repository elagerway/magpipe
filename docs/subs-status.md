# Status Page Subscriptions — Email + SMS + Webhook

## Context
The public status page at `status.magpipe.ai` shows live service health. Users want to be notified when status changes (outages, recoveries) without having to watch the page. This adds public subscriptions with email, SMS, and webhook delivery channels.

Also: rename "Degraded" → "Partial Outage" throughout the status page for clarity.

## Architecture

### 1. Database: `status_subscribers` table

```sql
CREATE TABLE status_subscribers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text,                          -- nullable (webhook-only subs)
  phone text,                          -- nullable (E.164, for SMS)
  webhook_url text,                    -- nullable (for developers)
  channels text[] NOT NULL DEFAULT '{email}',  -- array of: email, sms, webhook
  confirmed boolean NOT NULL DEFAULT false,
  confirm_token uuid DEFAULT gen_random_uuid(),
  unsubscribe_token uuid DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  confirmed_at timestamptz
);
-- No RLS (public endpoint uses service role key)
-- Unique on email (where email is not null)
-- Unique on phone (where phone is not null)
```

### 2. Database: `status_state_cache` table

Stores the last known status per category to detect transitions.

```sql
CREATE TABLE status_state_cache (
  category text PRIMARY KEY,
  status text NOT NULL,
  detail text,
  updated_at timestamptz DEFAULT now()
);
```

### 3. Edge function: `status-subscribe` (no auth)

**Deploy with `--no-verify-jwt`**

Handles subscription lifecycle:

- `POST /` — Subscribe: accepts `{ email?, phone?, webhook_url?, channels }`. Validates inputs, inserts into `status_subscribers`, sends confirmation email (if email channel) or SMS (if sms channel). Webhook subs confirmed immediately.
- `GET /?confirm=<token>` — Confirm: marks subscriber as confirmed.
- `GET /?unsubscribe=<token>` — Unsubscribe: deletes the subscriber row.

**Confirmation email** via Postmark (reuse existing pattern from `send-notification-email`):
- From: `Magpipe Status <help@magpipe.ai>`
- Subject: `Confirm your Magpipe status subscription`
- Body: Confirm link → `https://api.magpipe.ai/functions/v1/status-subscribe?confirm=<token>`
- Unsubscribe link in footer

**Confirmation SMS** via SignalWire (reuse `sms-compliance.ts` for sender routing):
- Body: `Magpipe Status: Reply YES to confirm status alerts. Msg & data rates may apply.`
- Use `getSenderNumber()` for US/CA routing

### 4. Edge function: `status-notify` (no auth, called by cron)

**Deploy with `--no-verify-jwt`**

Called every 5 minutes (by enhancing the existing cron that pings `public-status`).

Flow:
1. Fetch current status from `public-status` endpoint (or re-check inline)
2. Compare each category against `status_state_cache`
3. For any transitions (e.g. `operational → degraded`, `down → operational`):
   - Update `status_state_cache`
   - Fetch all confirmed subscribers
   - Send notifications per channel:
     - **Email**: Postmark with HTML summary of changes
     - **SMS**: SignalWire with short summary, using `getSenderNumber()` for compliance
     - **Webhook**: POST JSON payload to subscriber's webhook_url with 5s timeout

**Notification content:**
- Subject: `Magpipe Status Update: [Category] is now [Status]`
- Body: list of changed categories with old → new status and detail
- Footer: unsubscribe link (email) or "Reply STOP to unsubscribe" (SMS)

**Status labels in notifications:**
- `operational` → "Operational"
- `degraded` → "Partial Outage" (NOT "Degraded")
- `down` → "Outage"

### 5. Cron: trigger `status-notify` every 5 min

Reuse the existing `status-check-every-5min` cron pattern. Add a second `net.http_get` call to `status-notify` after the `public-status` ping.

### 6. Update `status/index.html` — subscription form + label fix

**Subscription form** at the bottom of the page:
- Email input field
- Phone input field (optional)
- Webhook URL input field (optional, collapsed by default)
- Subscribe button
- Success/error message area
- Matches existing dark card UI style

**Label fix:**
- Change `degraded: 'Degraded'` → `degraded: 'Partial Outage'` in `STATUS_LABELS`
- Change `degraded: 'Some Systems Degraded'` → `degraded: 'Partial Service Disruption'` in `OVERALL_LABELS`

## Files to create/modify

1. **Create** `supabase/migrations/20260302_status_subscribers.sql` — tables + cron
2. **Create** `supabase/functions/status-subscribe/index.ts` — subscribe/confirm/unsubscribe
3. **Create** `supabase/functions/status-notify/index.ts` — detect transitions, send alerts
4. **Modify** `status/index.html` — add subscription form + fix "Degraded" → "Partial Outage"
5. **Modify** `supabase/functions/public-status/index.ts` — fix "Degraded" label in overall logic if needed

## Key patterns to reuse

- **Postmark email**: `send-notification-email/index.ts` pattern (headers, From, MessageStream)
- **SMS sending + compliance**: `_shared/sms-compliance.ts` (`getSenderNumber`, `isUSNumber`, opt-out text)
- **SignalWire SMS API**: `send-notification-sms/index.ts` (Basic auth, LAML endpoint)
- **CORS + response utils**: `_shared/cors.ts`, `_shared/response.ts`
- **Config**: `_shared/config.ts` (APP_NAME, SUPPORT_EMAIL, NOTIFICATION_EMAIL)

## Verification

1. Deploy both functions with `--no-verify-jwt`
2. `curl -X POST .../status-subscribe -d '{"email":"test@example.com","channels":["email"]}'` → should receive confirmation email
3. Click confirm link → subscriber marked confirmed
4. Manually trigger `status-notify` → should detect any current transitions and send email
5. Click unsubscribe link → subscriber removed
6. Test SMS subscription with a real phone number
7. Test webhook subscription with a webhook.site URL
8. Open `status/index.html` → verify "Partial Outage" label and subscription form
