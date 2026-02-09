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

## Portal Widget Feature
The Magpipe portal includes an embedded chat widget for user support. This is loaded from `/widget/magpipe-chat.js` in `src/main.js`.

**Behavior:**
- Hidden on public pages (login, signup, pricing, etc.)
- Shown on authenticated portal pages
- Can be configured per-user via `portalWidgetConfig`
- Users can configure which pages hide the widget via `hiddenPortalPages`

**Files:**
- `src/main.js` - Loads widget script, handles visibility
- `public/widget/magpipe-chat.js` - Widget code

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

---

## Session: 2026-02-03

### Completed
1. ✅ Removed remaining "Pat AI" references from phone number friendly names
2. ✅ Updated outbound prompt to use dynamic agent_name and org_name
3. ✅ Fixed portal widget script path (solo-chat.js → magpipe-chat.js)
4. ✅ Deployed webhook-chat-message to fix "Solo Mobile" in widget
5. ✅ Added Transfer Numbers Modal to agent detail page
   - Opens when transfer toggle is enabled
   - Full CRUD for transfer numbers
   - Mobile-friendly modal design
6. ✅ **Fixed transfer toggle persistence bug**
   - **Root cause**: `custom_instructions` column didn't exist in agent_configs table
   - **Fix**: Added column as `JSONB DEFAULT '{}'::jsonb`
   - **Migration**: `supabase/migrations/20260203_add_custom_instructions_column.sql`

### Files Modified
- `src/models/AgentConfig.js` - getDefaultOutboundPrompt now uses dynamic names
- `src/pages/agent-detail.js` - Added transfer modal feature
- `src/main.js` - Fixed widget script path
- `supabase/functions/provision-phone-number/index.ts` - "Magpipe" friendly name
- `supabase/functions/add-service-number/index.ts` - "Magpipe" friendly name
- `supabase/functions/admin-manage-numbers/index.ts` - "Magpipe" friendly name
- `supabase/functions/send-password-reset/index.ts` - "Magpipe" references

### Next Session
- Custom domain migration (api.magpipe.ai, app.magpipe.ai)

---

## Session: 2026-02-03 (Evening)

### Completed
1. ✅ **Refactored Settings page to tabbed layout**
   - Tabs: Profile, Billing, Branding, Notifications, Account
   - Matches agent-detail page tab pattern
   - URL updates with `?tab=<name>` for deep-linking
   - Each tab has its own render and event listener methods

2. ✅ **Added favicon white background option**
   - Toggle in Branding tab (only shows when favicon is set)
   - Composites favicon on white background with rounded corners (6px radius)
   - Preview updates to show effect
   - New DB column: `users.favicon_white_bg` (boolean)
   - Migration: `supabase/migrations/20260203_add_favicon_white_bg.sql`

3. ✅ **Global favicon application**
   - Custom favicon now applied on every page load via BottomNav
   - Fetches `favicon_url` and `favicon_white_bg` with user profile data

4. ✅ **Agent detail page tab URLs**
   - Added `?tab=<name>` URL parameter when switching tabs
   - Enables deep-linking to specific agent tabs

### Files Modified
- `src/pages/settings.js` - Complete refactor to tabbed layout (~2600 lines)
- `src/components/BottomNav.js` - Added favicon fetching and application
- `src/pages/agent-detail.js` - Added tab URL parameter
- `supabase/migrations/20260203_add_favicon_white_bg.sql` - New column

### Commit
`147482b` - Add tabbed settings page and favicon white background option

---

## Session: 2026-02-03 (Late Night)

### Completed
1. ✅ **Implemented OmniAdminChat Feature**
   - Chat tab on `/admin` page for voice conversations with any agent
   - Admin/support can select any agent from dropdown
   - Voice mode with OpenAI Realtime API
   - Waveform visualization during voice calls
   - Full transcript display in voice overlay

### Files Created
- `src/components/OmniChatInterface.js` - Main chat component (~600 lines)
- `src/services/realtimeOmniService.js` - OpenAI Realtime API service (~320 lines)
- `supabase/functions/realtime-omni-token/index.ts` - Token generation with agent config
- `supabase/functions/admin-list-agents/index.ts` - Fetch all agents for dropdown

### Files Modified
- `src/pages/admin.js` - Added tab infrastructure (Users, Chat tabs)

### Edge Functions Deployed
- `realtime-omni-token` - Generates OpenAI Realtime token with agent's system prompt and voice
- `admin-list-agents` - Lists all agents with owner info for admin dropdown

### Architecture
```
Admin Page (admin.js)
├── Users Tab (existing user management)
└── Chat Tab (new)
    └── OmniChatInterface.js
        ├── Agent dropdown selector
        ├── Message bubbles
        ├── Voice mode toggle
        └── Voice overlay (fullscreen)
            ├── Waveform canvas
            └── Transcript area

RealtimeOmniService
├── Connects to realtime-omni-token Edge Function
├── Fetches processed agent config (system_prompt with variables replaced)
├── WebSocket connection to OpenAI Realtime API
└── Audio capture/playback via AudioWorklet
```

### Testing Notes
- Voice mode requires microphone permission
- Agent dropdown loads all agents from all users (admin/support can see all)
- Switching agents mid-conversation prompts confirmation
- Voice overlay has close button and displays real-time transcript

---

## Session: 2026-02-05

### Completed
1. ✅ **Implemented Custom Functions Feature**
   - Allows users to define custom webhooks their AI agent can call during conversations
   - Similar to Retell AI's custom functions feature

### Database
- Migration: `supabase/migrations/20260206000000_custom_functions.sql`
- New table: `custom_functions`
  - Columns: id, agent_id, user_id, name, description, http_method, endpoint_url, headers, query_params, body_schema, response_variables, timeout_ms, max_retries, is_active
  - RLS policies for user access control
  - Service role full access for LiveKit agent

### Files Created
- `src/models/CustomFunction.js` - CRUD operations for custom functions

### Files Modified
- `src/models/index.js` - Added CustomFunction export
- `src/pages/agent-detail.js` - Added Custom Functions UI section in Functions tab
  - Function list with method badges and status
  - Add/Edit modal with fields for: name, description, HTTP method, URL, headers, parameters, response variables
  - Toggle active/inactive, edit, delete actions
- `agents/livekit-voice-agent/agent.py` - Added custom function factory and integration
  - `get_custom_functions()` - Fetches active functions from database
  - `create_custom_function_tool()` - Creates LiveKit function_tool from config
  - `extract_json_path()` - Simple JSON path extraction for responses
  - Agent now loads and registers custom functions at session start

### Architecture
```
User configures function (UI)
         ↓
custom_functions table (DB)
         ↓
Agent session starts (agent.py)
         ↓
get_custom_functions() fetches active functions
         ↓
create_custom_function_tool() creates @function_tool for each
         ↓
Agent created with custom_tools list
         ↓
During conversation, LLM calls function
         ↓
HTTP request made to webhook endpoint
         ↓
Response extracted and returned to conversation
```

### Security
- Optional webhook signing with HMAC-SHA256
- Headers: `X-Magpipe-Timestamp`, `X-Magpipe-Signature`
- Environment variable: `CUSTOM_FUNCTION_WEBHOOK_SECRET`

### Testing
To test:
1. Create a custom function via UI (agent detail → Functions tab)
2. Configure with test webhook (e.g., webhook.site)
3. Start a voice call with the agent
4. Ask the agent to trigger the function
5. Verify webhook receives request with correct method/headers/body

---

## Session: 2026-02-05 (Continued)

### Completed - Documentation Updates

#### 1. ✅ Custom Functions Documentation
- `docs/features/custom-functions.mdx` - Comprehensive feature documentation
- `docs/api-reference/endpoints/create-custom-function.mdx`
- `docs/api-reference/endpoints/get-custom-function.mdx`
- `docs/api-reference/endpoints/update-custom-function.mdx`
- `docs/api-reference/endpoints/list-custom-functions.mdx`
- `docs/api-reference/endpoints/delete-custom-function.mdx`
- Updated `docs/mint.json` - Added navigation entries
- Updated `docs/openapi.json` - Added CustomFunction schema and API paths

#### 2. ✅ Agent Memory Documentation
- `docs/features/agent-memory.mdx` - Comprehensive feature documentation
- `docs/api-reference/endpoints/list-memories.mdx`
- `docs/api-reference/endpoints/get-memory.mdx`
- `docs/api-reference/endpoints/update-memory.mdx`
- `docs/api-reference/endpoints/delete-memory.mdx`
- Updated `docs/mint.json` - Added navigation entries and Memory API group
- Updated `docs/openapi.json` - Added Memory schema, API paths, and tag

#### 3. ✅ Credits & Billing Documentation
- `docs/features/billing.mdx` - Comprehensive billing documentation
  - How credits work (voice calls, SMS costs)
  - Pricing breakdown by component (voice, AI model, telephony)
  - Welcome bonus ($20)
  - Auto-recharge feature
  - FAQ section
- `docs/api-reference/endpoints/get-balance.mdx` - Get credit balance API
- `docs/api-reference/endpoints/purchase-credits.mdx` - Purchase credits API
- Updated `docs/mint.json` - Added billing feature and Billing API group
- Updated `docs/openapi.json` - Added Billing endpoints and tag

#### 4. ✅ Scheduled Actions Documentation
- `docs/features/scheduled-actions.mdx` - Comprehensive feature documentation
  - How scheduling works (pg_cron every 5 min)
  - Scheduling via agent chat (natural language)
  - Scheduling via API
  - Status lifecycle (pending → processing → completed/failed)
  - Retry logic (3 attempts, 5-min delay)
  - Use cases (appointment reminders, follow-ups)
- `docs/api-reference/endpoints/create-scheduled-action.mdx`
- `docs/api-reference/endpoints/list-scheduled-actions.mdx`
- `docs/api-reference/endpoints/cancel-scheduled-action.mdx`
- Updated `docs/mint.json` - Added feature and API group
- Updated `docs/openapi.json` - Added ScheduledAction schema, endpoints, and tag

#### 5. ✅ Bulk Calling Documentation
- `docs/features/bulk-calling.mdx` - Feature documentation
  - How it works (sequential calling)
  - Contact selection UI
  - Agent configuration tips
  - Best practices and compliance notes
  - API integration example using existing create-call endpoint
  - FAQ section
- Updated `docs/mint.json` - Added feature to navigation

#### 6. ✅ Integrations & MCP Documentation
- `docs/features/integrations.mdx` - Comprehensive integration documentation
  - OAuth Integrations (HubSpot, Slack, Cal.com)
  - MCP Server Catalog (40+ pre-configured servers)
  - Custom MCP Servers (user-added)
  - Tool naming conventions
  - Built-in tools list
  - Security features
  - API access examples
  - FAQ section
- Updated `docs/mint.json` - Added feature to navigation

#### 7. ✅ Knowledge Base Advanced Documentation
- Updated `docs/features/knowledge-base.mdx`:
  - Three ways to add knowledge (URL, paste, upload)
  - Crawl modes (single, sitemap, recursive)
  - Advanced options (max pages, crawl depth, robots.txt)
  - Paste content section
  - File upload section (PDF, TXT, MD)
  - Crawl progress tracking
  - View parsed URLs feature
  - JavaScript-rendered pages fallback strategies
  - Updated limits table
- Updated `docs/api-reference/endpoints/add-knowledge-source.mdx`:
  - Added crawl_mode parameter
  - Added max_pages parameter
  - Added crawl_depth parameter
  - Added respect_robots_txt parameter
- Created `docs/api-reference/endpoints/add-knowledge-manual.mdx`:
  - Manual content upload API
  - File upload support
- Updated `docs/mint.json` - Added manual endpoint to KB group
- Updated `docs/openapi.json`:
  - Added advanced parameters to add-knowledge-source
  - Added knowledge-source-manual endpoint

---

## Session: 2026-02-07

### Completed - Outbound Call Fix

1. ✅ **Fixed outbound SIP trunk ID**
   - **Root cause**: Code was using wrong LiveKit outbound SIP trunk ID
   - **Old (wrong)**: `ST_3DmaaWbHL9QT`
   - **New (correct)**: `ST_gjX5nwd4CNYq` (SignalWire Outbound trunk)
   - Used `scripts/list-sip-trunks.js` to discover correct trunk ID

2. ✅ **Fixed multi-agent config query**
   - Changed `.single()` to `.limit(1)` in livekit-outbound-call
   - Prevents "Cannot coerce to single JSON object" error for users with multiple agents

### Files Modified
- `supabase/functions/livekit-outbound-call/index.ts` - Fixed agent lookup + query
- `agents/livekit-voice-agent/agent.py` - Fixed agent_id correction from call_records
- `scripts/test-functions.js` - Added detailed SignalWire call logging

### Key Finding: LiveKit SIP Outbound via SignalWire DOES NOT WORK

Attempted multiple approaches - none worked:
1. **SIP endpoint with registration** - LiveKit trunks don't register, SignalWire expects registration
2. **SIP endpoint with TLS** - Same issue
3. **Domain app with IP auth** - Calls don't reach SignalWire at all
4. **Various trunk addresses** - `erik.signalwire.com`, `erik-xxx.sip.signalwire.com`, `erik-plug.dapp.signalwire.com`

**Root cause**: LiveKit SIP trunks use digest auth per-call without registration. SignalWire SIP infrastructure expects registered SIP clients.

**Solution for warm transfers**: Use SignalWire API to place outbound calls, then connect back to LiveKit via SIP (reverse direction - this works because inbound SIP to LiveKit is functional).

The existing `warm-transfer` edge function already uses this approach with SignalWire TwiML.

### Created SignalWire SIP Endpoint
- Username: `your-signalwire-project-id`
- Full URI: `your-signalwire-project-id@erik-0f619b8e956e.sip.signalwire.com`
- Has `passthrough` call handler for PSTN access

---

## Session: 2026-02-07 (Continued) - Warm Transfer Fix

### Issues Found From User Test
User tested warm transfer: "i called Amy asked to transfer to Erik, without saying a word Amy transferred me to my cel i picked up cel and i heard a ringing tone, and then amy picked up again"

**Root causes:**
1. **Agent didn't announce** - LLM didn't follow the tool instruction to speak before calling
2. **New room created** - SIP URI used `service_number` which triggered dispatch rule to create new room
3. **Amy picked up again** - New room meant new agent session started

### Fixes Applied

1. **Fixed SIP URI routing** - Changed from `service_number` to `room_name` in SIP URIs
   - `warm-transfer/index.ts`: Pass `room_name` to consult and unhold TwiML URLs
   - `warm-transfer-twiml/index.ts`: Use `room_name` in SIP URI (`sip:{room}@livekit.cloud`)
   - This makes transferee/caller join the EXISTING room instead of creating new ones

2. **Enhanced tool description** - Made agent instruction more emphatic:
   ```
   CRITICAL REQUIREMENT: You MUST speak to the caller BEFORE calling this function.
   Say something like 'One moment, let me transfer you to Erik' or 'Please hold
   while I connect you with sales.' The caller will hear hold music immediately
   after this function is called - they won't hear you after that.
   ```

### Deployed
- `warm-transfer` edge function
- `warm-transfer-twiml` edge function
- Agent changes require Render deploy (auto-deploys on push to master)

### Local Agent Testing Infrastructure (Completed)

Set up dedicated local testing to avoid disrupting production Render agent:

**Infrastructure:**
- Test number: `+16042101966`
- LiveKit trunk: `ST_jKuUnR9Lo5zW` (SignalWire Local Test)
- Dispatch rule: `call-local-` prefix → `SW Telephony Agent Local`
- Room names show `call-local-` prefix when routed to local agent

**Scripts created:**
- `scripts/test-local-agent.cjs` - Initiates test call via SignalWire → LiveKit
- `scripts/create-test-trunk.cjs` - Helper to manage LiveKit SIP trunks

**Agent changes:**
- Made agent name configurable via `LIVEKIT_AGENT_NAME` env var
- Local: `SW Telephony Agent Local`
- Render: `SW Telephony Agent` (default)

**To run local agent:**
```bash
cd agents/livekit-voice-agent
export SSL_CERT_FILE=$(python3 -c "import certifi; print(certifi.where())")
export LIVEKIT_AGENT_NAME="SW Telephony Agent Local"
python3 agent.py dev
```

**Then test:**
```bash
node scripts/test-local-agent.cjs
```

### Verification Status
- ✅ TwiML endpoint returns correct SIP URI with `room_name`
- ⏳ Full warm transfer flow needs human testing (requires real call interaction)

---

## Session: 2026-02-08

### Completed - Warm Transfer Multi-Recording Support

Added `call_record_id` parameter throughout warm transfer flow so all recordings from a single transfer (hold, consult, reconnect, etc.) link to the same call record and display as multiple audio players in the UI.

### Files Modified

**warm-transfer/index.ts:**
- Added `id` to call_records select query
- Store `call_record_id` in local variable and TransferState
- Pass `call_record_id` to `holdUrl` and `transfereeUrl`

**warm-transfer-twiml/index.ts:**
- Parse `call_record_id` from query params
- Pass through whisper → gather_response → decline callback chain
- Added recording callbacks with labels:
  - `conference` action → label: `transfer_conference`
  - `caller_declined` action → label: `reconnect_after_decline`
  - `unhold` action → label: `back_to_agent`

**warm-transfer-callback/index.ts:**
- Extract `call_record_id` from transfer state
- Pass to `caller_declined` redirect URL

### Edge Functions Deployed
- `warm-transfer`
- `warm-transfer-twiml`
- `warm-transfer-callback`

### Purpose
All recordings from a warm transfer flow now link to the same call_record_id, allowing multiple audio players to show in the call detail UI (calls.js already supports this via the `recordings` JSONB array).

---

## Session: 2026-02-09

### Completed - UI Improvements

#### 1. ✅ Clickable Phone Numbers with Copy Tooltip
Made all phone number displays in the Inbox page clickable with "Copied" tooltip appearing at mouse position:

**Call Detail View (`renderCallDetailView`):**
- Main header phone (when no contact name)
- Secondary phone number under contact name
- "Called:" service number
- Call ID (existing functionality, updated to use tooltip at mouse position)

**SMS Thread View:**
- Main header phone (when no contact name)
- Secondary phone number under contact name
- "Messaged:" service number

**Implementation:**
- Added `clickable-phone` class with `data-phone` attribute
- Click handler copies raw phone number to clipboard
- Tooltip appears at mouse position (fixed positioning with clientX/clientY)
- Tooltip disappears after 3 seconds

#### 2. ✅ Fixed Consumption Data Not Updating
The sidebar consumption progress bar was showing stale data because `cachedUserData` was never refreshed after initial load.

**Root cause:** When navigating between pages, the nav detected it was already rendered and only updated active state, never refreshing consumption data.

**Fix:**
- Added `refreshConsumptionData()` export function to BottomNav.js
- Modified `renderBottomNav()` to clear cache and refetch user data on each page navigation
- Progress bar now updates properly on navigation

### Files Modified
- `src/pages/inbox.js`
  - Added `clickable-phone` class to phone number spans in call and SMS thread headers
  - Updated `attachRedialButtonListener()` with tooltip at mouse position for call ID
  - Added clickable phone handlers to `attachRedialButtonListener()`
  - Updated `attachMessageInputListeners()` with clickable phone handlers and call button listener for SMS

- `src/components/BottomNav.js`
  - Added `refreshConsumptionData()` export function
  - Updated persistent nav logic to refresh consumption data on each navigation

