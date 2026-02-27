# Session Notes

## Date: 2026-02-26

### Current Session
- Reviewed and archived 1,268 lines of historical session notes
- Migrated all lessons/patterns to memory files:
  - `MEMORY.md` — Fixed +16042101966 SMS status, added deploy safety script reference
  - `patterns.md` — Added: agent_configs.agent_id dropped, Supabase no `.catch()`, call billing flow, TTS char tracking
  - `livekit-agent.md` — Added: warm transfer SIP routing, outbound greeting via session.say(), memory save timing with pre_disconnect_callback, llm_model column name lesson

### Admin Users Tab — New Features (continued from previous session)
Features added and deployed this session:

1. **Region info in user view**
   - `admin-get-user` now selects `signup_ip`, `signup_city`, `signup_country`
   - Account Information section shows Region row (e.g. "Vancouver, Canada (203.0.113.5)")

2. **Support subtab URL updates**
   - Clicking any support subtab now updates URL: `?tab=support&subtab=users` etc.
   - One-liner added to subtab click handler in `support-tab.js`

3. **Welcome email button (manual re-send)**
   - New edge function `admin-send-welcome-email` — sends via Postmark
   - From: `Magpipe Onboarding <help@magpipe.ai>`
   - Button appears inline with phone number when `phone_verified` is true
   - Guards against sending to unverified users (returns 400)

4. **Auto welcome email on signup**
   - Added welcome email send directly in `notify-signup` edge function
   - Fires on every signup (email + OAuth), fire-and-forget
   - Tested: confirmed in Postmark logs, also caught a real signup (xtenholdings@gmail.com)

5. **Credits used this period fix**
   - `erik@snapsonic.com` had `credits_used_this_period = $74.18` due to duplicate billing
   - Refund of $54.75 was applied to balance but counter not decremented
   - Manually corrected to $19.42 via REST API
   - Upgrade modal was also showing wrong value ($9.29) — was recalculating from credit_transactions with a billing period boundary issue
   - Fixed `BottomNav.js` `fetchNavUserData()` to use `credits_used_this_period` directly instead of summing transactions

6. **NOTIFICATION_EMAIL Supabase secret**
   - Set `NOTIFICATION_EMAIL=help@magpipe.ai` via Supabase secrets API
   - Updated `_shared/config.ts` fallback to `help@magpipe.ai`

### Duplicate Signup SMS Fix
- Root cause: race condition between `signup.js` and `main.js` auth handler
  - `signup.js` calls `notify-signup` immediately after `User.signUp()`
  - `SIGNED_IN` event fires in `main.js` before DB trigger creates profile → `!profile` is true → second `notify-signup` call
- Fix: `signup.js` sets `sessionStorage.signup_notified = true` before calling `notify-signup`
- `main.js` checks and clears the flag before firing — skips if already sent

### Commits This Session
- `bc34db1` — Admin users tab: credits, phone editor, region info, welcome email
- `eceb7aa` — Fix upgrade modal to use credits_used_this_period as source of truth
- `885a435` — Auto-send welcome email on signup via notify-signup
- `fcc7de0` — Fix duplicate signup SMS via sessionStorage flag
