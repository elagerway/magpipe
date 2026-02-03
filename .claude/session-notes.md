# Session Notes - MAGPIPE Rebrand

## Date: 2026-02-02

## Revert Point
**Last stable commit before rebrand:** `e553171` (Add magpipe bird logo to header)

To revert all rebrand changes:
```bash
git reset --hard e553171
```

## Rebrand Status

### ✅ Completed - Frontend App

| File | Changes |
|------|---------|
| `index.html` | Title, meta tags, loading text |
| `public/manifest.json` | name, short_name |
| `package.json` | name, description |
| `src/lib/supabase.js` | DB_NAME, storageKey |
| `src/components/PublicHeader.js` | docs URL |
| `src/components/PublicFooter.js` | docs URLs |
| `src/components/BottomNav.js` | docs URLs, chat URL |
| `src/pages/home.js` | Install text |
| `src/pages/login.js` | Subtitle |
| `src/pages/pricing.js` | Telephony button/table |
| `src/pages/custom-plan.js` | Email, testimonials |
| `src/pages/verify-email.js` | Logo, docs link |
| `src/pages/forgot-password.js` | Logo, docs link |
| `src/pages/reset-password.js` | Logo, docs link |
| `src/pages/terms.js` | All legal text |
| `src/pages/privacy.js` | All privacy text |
| `src/pages/phone.js` | Whisper comment |
| `src/pages/agent-detail.js` | Portal text, widget embed |
| `src/pages/chat-widget-settings.js` | Support agent text |
| `src/services/realtimeAdminService.js` | Instructions |
| `src/main.js` | Widget reference |

### ✅ Completed - Supabase Edge Functions

| File | Changes |
|------|---------|
| `send-notification-push/index.ts` | VAPID_SUBJECT email |
| `create-chat-widget/index.ts` | Widget embed code |
| `callback-call-handler/index.ts` | Whisper text |
| `integration-oauth-callback/index.ts` | FRONTEND_URL |
| `cal-com-oauth-callback/index.ts` | FRONTEND_URL |
| `send-contact-email/index.ts` | Email footer |
| `send-team-invitation/index.ts` | APP_URL, email body |
| `webhook-chat-message/index.ts` | Support agent text |
| `initiate-callback-call/index.ts` | Comment text |

### ✅ Completed - Public Widget

| File | Changes |
|------|---------|
| `public/widget/solo-chat.js` | Renamed to `magpipe-chat.js`, all references updated |

### ✅ Completed - Test Files

| File | Changes |
|------|---------|
| `tests/schedule-tab.spec.js` | storageKey |
| `tests/test-mobile-nav.spec.js` | storageKey |
| `tests/test-external-trunk.spec.js` | storageKey |
| `tests/test-agent-layout-mobile.spec.js` | storageKey |
| `tests/test-agent-layout.cjs` | storageKey |
| `tests/test-agent-layout.spec.js` | storageKey |
| `tests/outbound-agent-call.spec.js` | storageKey |

### ✅ Completed - Config Files

| File | Changes |
|------|---------|
| `CLAUDE.md` | Production URL, storageKey |

### ✅ Completed - Documentation (docs/ folder)

| File | Changes |
|------|---------|
| `docs/logo/dark.svg` | Removed bird image, text only |
| `docs/logo/light.svg` | Removed bird image, text only |
| `docs/introduction.mdx` | "AI-powered communications platform" |
| `docs/openapi.json` | Fixed API params to match actual endpoints |
| 21 `.mdx` files | "Solo Mobile" → "Magpipe", URLs updated |

### ✅ Completed - API Documentation Fixes

Fixed mismatches between documented and actual API parameters:

| Endpoint | Fixed |
|----------|-------|
| `/send-sms` → `/send-user-sms` | Path + params (serviceNumber, contactPhone, message) |
| `/initiate-bridged-call` | to/from → phone_number/caller_id |
| `/search-phone-numbers` | area_code → query |
| `/webhook-chat-message` | snake_case → camelCase |
| `/provision-phone-number` | phone_number → phoneNumber |
| `/terminate-call` | call_id → call_sid |
| `/get-signed-recording-url` | call_id → recordingUrl |

## Domain Change Summary
- Old: `solomobile.ai`, `docs.solomobile.ai`
- New: `magpipe.ai`, `docs.magpipe.ai`

## Storage Key Change (⚠️ Breaking)
- Old: `solo-mobile-auth-token`
- New: `magpipe-auth-token`
- **Impact**: All existing users will be logged out after deployment

## Email Addresses
- Old: `support@solomobile.ai`, `legal@solomobile.ai`, `privacy@solomobile.ai`
- New: `support@magpipe.ai`, `legal@magpipe.ai`, `privacy@magpipe.ai`

## Widget Changes
- Old file: `public/widget/solo-chat.js`
- New file: `public/widget/magpipe-chat.js`
- Old global: `SoloChat`
- New global: `MagpipeChat`

---

## Session: 2026-02-02 (Evening)

### Completed
1. ✅ Docs logo - removed bird image, MAGPIPE text only
2. ✅ Docs rebrand - all "Solo Mobile" → "Magpipe" (21 files)
3. ✅ API docs - fixed all endpoint parameter mismatches
4. ✅ Tested all APIs - verified they work with correct params
5. ✅ Committed all pending rebrand changes (41 files)
6. ✅ Domain migration plan documented (`DOMAIN-MIGRATION.md`)

### Next Session: Custom Domain Migration
New domain structure:
- `api.magpipe.ai` - Supabase API/functions
- `app.magpipe.ai` - Web app

**Erik's tasks:**
1. Supabase Dashboard → Add custom domain
2. DNS → Add CNAME records
3. Vercel → Add app.magpipe.ai domain
4. OAuth consoles → Update redirect URIs

**Claude's tasks:**
1. Update all code with new URLs
2. Update SignalWire webhooks for all numbers
3. Deploy edge functions
4. Update docs

See `DOMAIN-MIGRATION.md` for full checklist.

