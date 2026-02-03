# Domain Migration Plan

## New Domain Structure
| Service | Current | New |
|---------|---------|-----|
| Web App | magpipe.ai | app.magpipe.ai |
| Supabase API | mtxbiyilvgwhbdptysex.supabase.co | api.magpipe.ai |

---

## Phase 1: DNS & Domain Setup (Manual - Erik)

### 1.1 Supabase Custom Domain
1. Go to [Supabase Dashboard](https://supabase.com/dashboard/project/mtxbiyilvgwhbdptysex/settings/custom-domains)
2. Add custom domain: `api.magpipe.ai`
3. Copy the CNAME target provided by Supabase

### 1.2 DNS Records (at your registrar)
Add the following DNS records:

```
# Supabase API
api.magpipe.ai    CNAME    <supabase-provided-target>

# Web App (Vercel)
app.magpipe.ai    CNAME    cname.vercel-dns.com

# Redirect root to app (optional)
magpipe.ai        A        76.76.21.21 (Vercel)
```

### 1.3 Vercel Domain Setup
1. Go to [Vercel Project Settings](https://vercel.com/snapsonic/solomobile/settings/domains)
2. Add domain: `app.magpipe.ai`
3. Set as primary domain
4. Configure redirect: `magpipe.ai` → `app.magpipe.ai`

---

## Phase 2: OAuth Provider Updates (Manual - Erik)

### 2.1 Google OAuth
1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Edit OAuth 2.0 Client ID
3. Update Authorized redirect URIs:
   - Remove: `https://mtxbiyilvgwhbdptysex.supabase.co/auth/v1/callback`
   - Add: `https://api.magpipe.ai/auth/v1/callback`

### 2.2 Cal.com OAuth
1. Go to Cal.com Developer Settings
2. Update redirect URI:
   - Remove: `https://mtxbiyilvgwhbdptysex.supabase.co/functions/v1/cal-com-oauth-callback`
   - Add: `https://api.magpipe.ai/functions/v1/cal-com-oauth-callback`

### 2.3 HubSpot OAuth (if configured)
1. Go to HubSpot Developer Portal
2. Update redirect URI:
   - Remove: `https://mtxbiyilvgwhbdptysex.supabase.co/functions/v1/integration-oauth-callback`
   - Add: `https://api.magpipe.ai/functions/v1/integration-oauth-callback`

### 2.4 Supabase Auth Settings
1. Go to [Supabase Auth Settings](https://supabase.com/dashboard/project/mtxbiyilvgwhbdptysex/auth/url-configuration)
2. Update Site URL: `https://app.magpipe.ai`
3. Update Redirect URLs:
   - `https://app.magpipe.ai/**`
   - `http://localhost:3000/**` (for dev)

---

## Phase 3: Code Changes (Automated - Claude)

### 3.1 Environment Variables
| File | Variable | New Value |
|------|----------|-----------|
| `.env` | `VITE_SUPABASE_URL` | `https://api.magpipe.ai` |
| `.env` | `SUPABASE_URL` | `https://api.magpipe.ai` |
| Vercel | `VITE_SUPABASE_URL` | `https://api.magpipe.ai` |

### 3.2 Frontend Files
| File | Change |
|------|--------|
| `src/pages/inbox.js` | Update hardcoded Supabase URL |
| `public/widget/magpipe-chat.js` | Update API endpoint |
| `src/voice-preview-generator.js` | Update hardcoded URL |

### 3.3 Edge Functions
| File | Change |
|------|--------|
| `supabase/functions/bridge-outbound-call/index.ts` | Update hardcoded URL |
| `supabase/functions/livekit-swml-handler/index.ts` | Update hardcoded URL |
| `supabase/functions/send-password-reset/index.ts` | Update hardcoded URL |
| `supabase/functions/transfer-cxml/index.ts` | Update hardcoded URL |

### 3.4 Documentation
| File | Change |
|------|--------|
| `docs/openapi.json` | Update server URL to `https://api.magpipe.ai/functions/v1` |
| `docs/mint.json` | Update any API references |
| Various `.mdx` files | Update example URLs |

### 3.5 Tests & Scripts
- Update all test files with hardcoded URLs
- Update utility scripts in `scripts/` folder

---

## Phase 4: SignalWire Webhook Updates (Automated - Claude)

Claude will automatically update all SignalWire phone numbers with new webhook URLs:

| Webhook | Old URL | New URL |
|---------|---------|---------|
| Voice URL | `https://mtxbiyilvgwhbdptysex.supabase.co/functions/v1/webhook-inbound-call` | `https://api.magpipe.ai/functions/v1/webhook-inbound-call` |
| Voice Status | `https://mtxbiyilvgwhbdptysex.supabase.co/functions/v1/webhook-call-status` | `https://api.magpipe.ai/functions/v1/webhook-call-status` |
| SMS URL | `https://mtxbiyilvgwhbdptysex.supabase.co/functions/v1/webhook-inbound-sms` | `https://api.magpipe.ai/functions/v1/webhook-inbound-sms` |
| SMS Status | `https://mtxbiyilvgwhbdptysex.supabase.co/functions/v1/webhook-sms-status` | `https://api.magpipe.ai/functions/v1/webhook-sms-status` |

---

## Phase 5: Deployment & Verification

### 5.1 Deploy Edge Functions
```bash
npx supabase functions deploy --all
```

### 5.2 Deploy Frontend
```bash
git push  # Triggers Vercel auto-deploy
```

### 5.3 Verification Checklist
- [ ] `https://api.magpipe.ai/functions/v1/search-phone-numbers` responds
- [ ] `https://app.magpipe.ai` loads web app
- [ ] Login with email/password works
- [ ] Google OAuth login works
- [ ] Inbound call to test number works
- [ ] Outbound call works
- [ ] SMS send/receive works
- [ ] Chat widget works
- [ ] Cal.com OAuth connection works

---

## Rollback Plan

If issues occur:
1. Revert DNS changes (point back to original domains)
2. Revert code changes: `git revert HEAD~N`
3. OAuth providers: Add back old redirect URIs (don't remove new ones yet)

---

## Timeline Estimate

| Phase | Duration |
|-------|----------|
| DNS propagation | 5-30 minutes |
| SSL certificate | 5-15 minutes |
| Code changes | 10 minutes |
| SignalWire updates | 5 minutes |
| Testing | 15 minutes |
| **Total** | ~1 hour |

---

## Notes

- Keep old Supabase URL working during transition (Supabase supports both)
- OAuth providers: Add new URIs before removing old ones
- Test in incognito to avoid cached auth issues
