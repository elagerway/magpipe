# Magpipe

- **Production URL**: https://magpipe.ai
- **Supabase API URL**: https://api.magpipe.ai
- **App name**: Magpipe
- **Contact email**: help@magpipe.ai

# Development Guidelines

## Technologies
- **Frontend**: JavaScript ES6+, HTML5, CSS3 (vanilla, minimal frameworks), Vite
- **Backend**: TypeScript (Supabase Edge Functions), Python 3.11 (LiveKit agent)
- **Database**: PostgreSQL (Supabase) with pgvector extension
- **APIs**: Supabase JS Client, SignalWire (telephony/SMS), LiveKit (voice AI), Postmark (transactional email)
- **Other**: Service Worker (PWA), Web Audio API, WebRTC

## Email & Auth
- **Email provider**: Postmark (for ALL emails - auth, contact forms, notifications)
- **Auth flow**: Email/password signup with auto-confirm, then phone verification via SMS OTP
- **Phone verification required** before users can access the app

## Project Structure
```
src/           # Frontend code
tests/         # Playwright tests
supabase/      # Edge Functions and migrations
agents/        # LiveKit voice agent (Python)
```

## Commands
```bash
npm test          # Run tests
npm run lint      # Lint code
npm run dev       # Local dev server (port 3000)
```

**Dev server runs on port 3000, NOT 5173**

## UI Guidelines
- **Never expose vendor names** (SignalWire, OpenAI, ElevenLabs) in user-facing messages
- **Never use native browser alerts/confirms** (`alert()`, `confirm()`, `prompt()`):
  - Use custom modals that match the app design (see `src/components/ConfirmModal.js`)

### Modal Style Guide

All modals use the `contact-modal-*` CSS pattern. Reference implementation: `src/components/BottomNav.js`.

**HTML Structure**:
```html
<div class="contact-modal-overlay" id="my-modal-overlay" style="display: none;"
     onclick="document.getElementById('my-modal-overlay').style.display='none'">
  <div class="contact-modal" onclick="event.stopPropagation()">
    <div class="contact-modal-header">
      <h3>Modal Title</h3>
      <button class="close-modal-btn" onclick="...">&times;</button>
    </div>
    <form id="my-form">
      <div class="contact-modal-body">
        <!-- Form fields -->
      </div>
      <div class="contact-modal-footer">
        <button type="button" class="btn btn-secondary">Cancel</button>
        <button type="submit" class="btn btn-primary">Save</button>
      </div>
    </form>
  </div>
</div>
```

**Key rules**:
- Three sections: fixed header, scrollable body, fixed footer
- Save/Submit button never scrolls off screen
- Show/hide via `style.display` (`'flex'` / `'none'`)
- Do NOT use `.modal` / `.modal-content` classes (deprecated)

## Database Management

### Migrations
- Migration files go in `supabase/migrations/` with timestamp prefix
- Apply with `npx supabase db push` or run SQL manually via Supabase MCP
- All new tables need RLS policies
- **CRITICAL**: When enabling RLS on a table, ALWAYS create policies in the same migration. `ENABLE ROW LEVEL SECURITY` without policies = all queries return empty (silent failure).
- **Supabase project ref**: `mtxbiyilvgwhbdptysex`

### MCP Servers
Six MCP servers are configured for this project (in `~/.claude.json`):
Supabase, Playwright, Vercel, Magpipe (`packages/mcp-server`), Stripe, Postmark

## Deployment
- **Vercel auto-deploy is NOT configured** — deploy manually: `npx vercel --prod`
- **Edge functions**: deploy via Supabase MCP or `npx supabase functions deploy <name>`
- **Edge function secrets** are write-only — values cannot be read back

## Stripe Billing
- **Webhook endpoint**: `https://api.magpipe.ai/functions/v1/stripe-webhook` (no-verify-jwt)
- **Card details**: `users.card_brand` and `users.card_last4` — set by webhook on `setup_intent.succeeded`
- **Non-card methods**: Stripe Link stores `card_brand='link'`, uses `/images/stripe-link.png` logo
- **Billing page order**: Bonus checklist → Auto-recharge → Payment card + Manage → Balance

## Supabase Edge Functions

### Import Style
- **Use `npm:` imports**, not `https://esm.sh/` (esm.sh causes deployment timeouts)
- Example: `import { createClient } from 'npm:@supabase/supabase-js@2'`

### Webhook Authentication
External webhooks (SignalWire, etc.) don't send auth headers. Deploy with:
```bash
npx supabase functions deploy <name> --no-verify-jwt
```

### Configuration
- Import `APP_NAME`, `APP_URL`, `SUPPORT_EMAIL` from `../_shared/config.ts`
- Frontend config: import from `src/lib/config.js`

## Voice AI Architecture

### Call Flow
Incoming call → SignalWire → LiveKit SIP trunk → LiveKit room → Python voice agent

### Agent Dispatch
Agent dispatch rules are configured in **LiveKit Cloud dashboard**, NOT via code.

## Testing

```bash
npm test              # Unit tests (Vitest)
npm run test:e2e      # E2E tests (Playwright)
```

Set `TEST_EMAIL` and `TEST_PASSWORD` environment variables for E2E tests.
