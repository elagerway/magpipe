# Pat Development Guidelines

## Technologies
- **Frontend**: JavaScript ES6+, HTML5, CSS3 (vanilla, minimal frameworks), Vite
- **Backend**: TypeScript (Supabase Edge Functions), Python 3.11 (LiveKit agent)
- **Database**: PostgreSQL (Supabase) with pgvector extension
- **APIs**: Supabase JS Client, SignalWire (telephony/SMS), LiveKit (voice AI)
- **Other**: Service Worker (PWA), Web Audio API, WebRTC

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

**IMPORTANT: Dev server runs on port 3000, NOT 5173**

## Critical Working Principles
- **NEVER make assertions without verification**: Verify with actual data before stating facts
- **When user corrects you, believe them immediately**: Don't argue - they know their system
- **NEVER ask user to check logs**: Use API calls, CLI commands, or database queries yourself
- **ALWAYS verify changes work AND don't break other elements**: Use Playwright tests or manual verification to confirm changes work and don't break related functionality
- **If uncertain, ask or investigate**: Better to check than assert something incorrect

## Destructive Git Operations (NEVER DO WITHOUT ASKING)
- **NEVER run `git stash`** without explicit user permission
- **NEVER run `git clean`** - this permanently deletes untracked files
- **NEVER run `git checkout --force`** - this discards uncommitted changes
- **NEVER run `git reset --hard`** - this destroys work
- **Ask before ANY git operation** that could lose uncommitted or untracked work

## Feature Preservation (NON-NEGOTIABLE)
When adding new features, you MUST ensure existing features are NOT removed or modified:

### Before Modifying Arrays/Lists/Collections:
1. **Read and document ALL existing items** before making changes
2. **Add new items, NEVER replace** - use append/insert, not assignment that overwrites
3. **After editing, verify existing items still present** - count items before and after

### Mandatory Pre-Edit Checklist:
```
Before: List existing items → Document them
During: ADD new items, don't replace existing
After:  Verify ALL original items still present
```

### Example - Adding Nav Item (WRONG vs RIGHT):
```javascript
// WRONG - Replaces existing item:
navItems[5] = { path: '/new', label: 'New' };

// RIGHT - Add new item while preserving existing:
// 1. First verify what exists at position 5
// 2. Add new item at NEW position or insert
navItems.push({ path: '/new', label: 'New' });
```

### Verification Steps:
1. Run `git diff` before committing to review ALL changes
2. Verify no unintended deletions (look for red `-` lines that weren't requested)
3. Test that existing functionality still works
4. If modifying a file with multiple features, test ALL features in that file

### Real Incident (2026-01-31):
- Task: Add Knowledge nav item to BottomNav.js
- Error: Settings nav item was REPLACED instead of Knowledge being ADDED
- Result: Settings icon disappeared from mobile nav for days
- Fix: Had to re-add Settings as mobile-only item
- Prevention: Always document existing items before editing, verify after

## Git & Deployment

### Commit Rules
- **NEVER commit without testing first**: Test the change works AND doesn't break other elements
- **Do NOT include Co-Authored-By footer**: Keep commit messages clean
- **Format**: Brief summary, then details of what/why/how

### Vercel (Frontend)
- **Production**: https://solomobile.ai
- **Branch**: `master` (auto-deploys on push)
- **User can test on localhost** (including mobile) - do NOT push without user testing first
- **Wait for user approval before pushing**: Always let user test changes on localhost before committing/pushing

### Render (LiveKit Agent)
- **DO NOT use Pat-AI branch**: Work on `master` only, Pat-AI is outdated
- **Deploy manually**: Push to master, then manually deploy on Render dashboard
- **Verify deployment after pushing**: Check Render started a new deploy

## Test Credentials
- **Email**: `erik@snapsonic.com`
- **Password**: `Snapsonic123` (for localhost Playwright tests)
- **Phone**: `+16044182180` (Erik's cell for outbound tests)
- **API tests**: Use `SUPABASE_SERVICE_ROLE_KEY` from `.env`

### Playwright Login (Preferred Method)
For Playwright tests, use email/password login instead of OTP:
```javascript
await page.goto('http://localhost:3000/login');
await page.fill('input[type="email"]', 'erik@snapsonic.com');
await page.fill('input[type="password"]', 'Snapsonic123');
await page.click('button[type="submit"]');
await page.waitForURL('**/home');
```

## Playwright Testing

### Authentication (Magic Link OTP)
```javascript
// 1. Generate OTP via admin API (in Node.js or shell)
const response = await fetch('https://mtxbiyilvgwhbdptysex.supabase.co/auth/v1/admin/generate_link', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    'apikey': SUPABASE_SERVICE_ROLE_KEY,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ type: 'magiclink', email: 'erik@snapsonic.com' })
});
const otp = (await response.json()).email_otp;

// 2. Verify OTP in browser context
const sessionResult = await page.evaluate(async ({ email, otp }) => {
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
  const supabase = createClient(SUPABASE_URL, ANON_KEY,
    { auth: { storageKey: 'solo-mobile-auth-token' } }  // App's storage key!
  );
  const { data, error } = await supabase.auth.verifyOtp({ email, token: otp, type: 'email' });
  if (data?.session) {
    localStorage.setItem('solo-mobile-auth-token', JSON.stringify(data.session));
  }
  return { success: !!data?.session, error: error?.message };
}, { email: 'erik@snapsonic.com', otp: otpCode });
```

### Common Issues
- **Bottom nav intercepts clicks**: Use `await btn.click({ force: true })`
- **Microphone modal blocks**: Click "Allow Microphone" first
- **SIP registration slow**: Wait 15+ seconds before making calls

## UI Guidelines
- **Never expose vendor names** (Retell, SignalWire, OpenAI) in user-facing messages
- **NEVER use "Pat" or "Pat AI"** - this product name is deprecated. Use generic language like "AI assistant", "your assistant", or "the agent"
- **Be mindful of mobile vs desktop styling differences**:
  - Back buttons: typically only needed on mobile (desktop has persistent sidebar nav)
  - Use `mobile-only` class to show elements only on mobile
  - Use `desktop-only` class to show elements only on desktop
  - Test both viewports when making UI changes

## Database Management

### Environment Variables
- **SUPABASE_SERVICE_ROLE_KEY** must be in `.env` for API calls
- **NEVER reset database** without explicit user request (`npx supabase db reset` is destructive)

### Migrations
- **Run migrations via Supabase Management API**:
  ```bash
  export SUPABASE_ACCESS_TOKEN=sbp_17bff30d68c60e941858872853988d63169b2649
  curl -s -X POST "https://api.supabase.com/v1/projects/mtxbiyilvgwhbdptysex/database/query" \
    -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"query": "YOUR SQL HERE"}'
  ```
- Do NOT use `npx supabase db push` (migration tracking conflicts with old numbered migrations)
- Migration files still go in `supabase/migrations/` for version control
- An `exec_sql(query)` function also exists for programmatic SQL execution via service role

## SignalWire API

### Authentication
```bash
source .env && curl -s -u "$SIGNALWIRE_PROJECT_ID:$SIGNALWIRE_API_TOKEN" \
  "https://erik.signalwire.com/api/relay/rest/endpoints/sip"
```

### Phone Number Management
- **Database is source of truth for ownership** (service_numbers table)
- **SignalWire is source of truth for metadata** (purchase dates, SIDs)
- Don't assume numbers in DB aren't provisioned - verify with SignalWire lookup

### SIP Configuration
- **PSTN Passthrough**: Must be ENABLED in SignalWire Dashboard
- **Call Handler**: Must be `laml_webhooks`
- **Current Endpoint**: `0ed5ed8b-fd6a-4964-8c36-6547609260f4` (pat_778736359f5a4eee)

## Outbound Call Architecture
- **NO browser WebRTC/SIP for outbound calls**: All outbound calls are server-initiated via SignalWire
- **With Agent enabled**: `initiateBridgedCall` → Edge Function creates SignalWire bridged conference, LiveKit agent joins
- **Without Agent**: `initiateCallbackCall` → SignalWire calls user's cell phone first, then bridges to destination
- **JsSIP/sipClient.js**: Legacy code, not used for outbound calls anymore
- **Recording**: All calls recorded via SignalWire conference bridge

## Supabase Edge Functions

### Webhook Authentication
External webhooks (SignalWire, etc.) don't send auth headers. Use:
```typescript
Deno.serve(async (req) => { ... });  // NOT imported serve()
```
Deploy with: `npx supabase functions deploy <name> --no-verify-jwt`

### CLI Limitations
- `npx supabase functions logs` is NOT available - use Dashboard or database queries

## Voice AI Architecture

### Providers
- **LiveKit** (current): Custom voices, full ElevenLabs integration
- **Retell**: Preset voices only, no custom/cloned voices

### Outbound Calls
- **LiveKit SIP trunk does NOT work** for direct outbound
- **Browser SIP only**: Outbound goes through browser WebRTC SIP to SignalWire
- **Recording**: Use bridged conference approach (SignalWire calls browser, bridges to PSTN)

### LiveKit Agent Dispatch
Agent dispatch rules are configured in **LiveKit Cloud dashboard**, NOT via code. Don't retry code-based solutions for agent dispatch.

## Retell Custom Tools
- **Naming**: `{user_id_no_dashes}_{function_name}` (max 63 chars)
- Example: `abc123def4567890abcdef12345678_transfer`

## HubSpot Integration
- **NOT MCP-based**: HubSpot uses direct API calls via `executeNativeTool()`, not MCP servers
- **Tools live in**: `supabase/functions/mcp-execute/index.ts` (handleHubSpotTool, handleHubSpotCreateContact, etc.)
- **Available tools**: `hubspot_create_contact`, `hubspot_search_contacts`, `hubspot_get_contact`, `hubspot_create_note`
- **OAuth tokens**: Stored in `user_integrations` table, auto-refreshed when expired

## Media Files
Always open media files (.png, .jpg, .mov, etc.) immediately without asking permission.

## Debugging
Log all state transitions to `call_state_logs` table for complex processes:
```sql
SELECT * FROM call_state_logs WHERE room_name = 'outbound-xxx' ORDER BY created_at
```
