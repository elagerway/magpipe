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

---

## Session: 2026-02-09 (Continued)

### Completed - Analytics Page & Org-Wide Data

#### 1. ✅ Added Organization-Wide Analytics
Updated `org-analytics` edge function to show all activity for ALL users in the organization, not just the current user.

**Changes:**
- Fetch user's `current_organization_id`
- Get all user IDs in that organization
- Query call_records, sms_messages, credit_transactions for ALL org users
- Aggregate credits balance across all team members

#### 2. ✅ Fixed Call Records Not Appearing
**Root cause:** Type mismatch in Supabase join - `agent_id` (text) cannot join with `agent_configs.id` (UUID)

**Fix:**
- Removed broken inline join (`agent_configs(name)`)
- Fetch call records without the join first
- Get unique agent IDs from records
- Fetch agent names in separate query
- Map agent names to records manually

### Files Modified
- `supabase/functions/org-analytics/index.ts`
  - Changed all functions from `userId: string` to `userIds: string[]`
  - Changed all queries from `.eq('user_id', userId)` to `.in('user_id', userIds)`
  - Added organization lookup and team member fetching
  - Fixed `getCallRecords()` to fetch agent names separately

### Edge Functions Deployed
- `org-analytics` - Now shows org-wide data with working call records table

#### 3. ✅ Fixed Billing Not Working for Inbound Calls (Since Feb 6)

**Problem:** Calls after Feb 6 weren't being billed - cost showed as $0.00 in analytics.

**Investigation findings:**
- Last billed call: Feb 6 at 18:46
- `sip-recording-callback` WAS being called (sets `duration_seconds` and `status: 'completed'`)
- But it didn't trigger billing
- `webhook-call-status` HAS billing code but isn't called for inbound LiveKit calls
- Root cause: `<Dial>` TwiML in `webhook-inbound-call` has no `statusCallback` URL

**Fix applied:**
Added billing call to `sip-recording-callback` since it's already being called successfully when recordings complete:
- Added `deductCallCredits()` function
- Calls `deduct-credits` edge function with user_id, duration, voice_id, ai_model
- Safety checks:
  - Only bills for `label === 'main'` recordings (avoids double billing for transfer legs)
  - Only bills if `durationSeconds > 0` and `user_id` exists
  - Checks if credits were already deducted (prevents double billing)
  - Fire-and-forget (doesn't block response)

**Deployed:** `sip-recording-callback`

**Result:** Future inbound calls will be billed properly when recording completes.

---

## Session: 2026-02-09 (Late)

### Completed - TTS Character Tracking for Accurate Vendor Costs

**Problem:** KPI dashboard was calculating ElevenLabs TTS vendor cost as `full_call_minutes × $0.22/min`, but ElevenLabs only charges for actual agent speech (~30-50% of a call). This inflated vendor costs ~2x.

**Fix:**
1. **agent.py** - Count TTS characters from `transcript_messages` (agent speech only), pass to billing
2. **deduct-credits** - Accept `ttsCharacters`, compute `ttsMinutes` (chars/900), store in metadata
3. **admin-analytics** - Use `ttsMinutes` for TTS vendor cost instead of full call minutes; other costs (STT, telephony, LiveKit, LLM) still use full call minutes

**Fallback:** Old records without `ttsMinutes` fall back to full duration — improvement gradual as new calls come in.

### Files Modified
- `agents/livekit-voice-agent/agent.py`
- `supabase/functions/deduct-credits/index.ts`
- `supabase/functions/admin-analytics/index.ts`

### Deployed
- Edge functions: `deduct-credits`, `admin-analytics`
- Agent: pushed to master (Render auto-deploy)

### Commit
`d148194` - Track actual TTS characters for accurate vendor cost in KPI

---

## Session: 2026-02-10

### Completed - Agent Memory Fix (End-to-End)

**Problem:** Memory and Semantic Memory features were implemented in code but didn't work in practice for inbound calls.

**Root causes found and fixed:**

1. **Memory save failed at call end** - SIP participant already disconnected when code tried to re-extract caller phone. Fixed by introducing `remote_party_phone` variable captured early while participant is still connected.

2. **`locals().get('actual_caller_phone')` fragile pattern** - Replaced with `remote_party_phone` reference.

3. **Room deleted before memory could save** - `end_call` tool called `delete_room()` immediately, killing async `on_call_end` task. Fixed with `pre_disconnect_callback` that runs `on_call_end()` synchronously BEFORE room deletion.

4. **Frontend couldn't see memory records** - `user_id` was NULL on `conversation_contexts` records, blocked by RLS policy. Fixed by adding `user_id` to insert.

5. **Missing direction context** - Added `direction` column to DB, direction badge in UI (Inbound/Outbound).

6. **Memory prompt too passive** - LLM had memory but was too cautious to use it. Tuned prompt to be more useful while respecting security (always confirm caller identity).

7. **SMS sending from voice-only number** - SMS tool now looks up SMS-capable number from `service_numbers` table.

8. **SMS false success logging** - Now checks `error_code` in API response, not just HTTP status.

9. **Broken memory detail modal** - Rewrote from `.modal-overlay` to standard `.modal`/`.modal-backdrop`/`.modal-content` pattern.

10. **UI renamed** - "Caller Memory" → "Agent Memory" (future text message memory support).

### Files Modified
- `agents/livekit-voice-agent/agent.py` - Memory save/inject fixes, SMS fixes, pre-disconnect callback
- `src/pages/agent-detail.js` - Direction badge, copiable UUID, modal fix, "Agent Memory" rename
- `src/services/memoryService.js` - Added direction, service_number, contact_phone fields

### Key Design Decisions
- **No auto contact name update** - Multiple people may call from same number (company lines)
- **Agent asks for name** - Security layer, not a bug
- **Memory prompt balanced** - Gives context but instructs agent to confirm identity first

---

## Session: 2026-02-21

### Completed - Custom Functions Fix (Voice Calls)

**Problem:** Custom functions (webhook tools agents call during conversations) worked in chat but failed during live voice calls. The endpoint was never hit despite the LLM deciding to call the function.

**Investigation revealed chat doesn't use custom_functions table at all** — `webhook-chat-message` has zero references to it. The "chat works" test was the LLM answering from knowledge base, not the function.

### Bugs Found & Fixed (3 commits)

#### Bug 1 — Wrong tool name registration (commit ca68bcb)
- `@function_tool(description=...)` captured `func.__name__` as "custom_function" at decoration time
- Setting `__name__` after decoration didn't change `FunctionToolInfo.name`
- Multiple custom functions would crash with `ValueError("duplicate function name: custom_function")`
- **Fix:** Use `raw_schema` approach which explicitly sets name from `raw_schema["name"]`

#### Bug 2 — JSON-in-JSON parameters (commit ca68bcb)
- Single `parameters: Annotated[str, "JSON string"]` required LLM to encode JSON within JSON
- Often failed Pydantic validation silently
- **Fix:** `raw_schema` with individual typed properties from `body_schema`

#### Bug 3 — SDK fallback + version pinning (commit 9f1536c)
- Added three-tier fallback chain: `raw_schema` → `name=` FunctionTool → `__name__` override
- Pinned `livekit-agents>=1.4.0` (was `>=0.8.0`) to ensure `raw_schema` support on Render
- Added SDK version + code version logging to `call_state_logs`

#### Bug 4 — Headers field name mismatch (commit 613e654)
- DB stores `{"key": "x-magpipe-secret", "value": "..."}` but code checked `h.get('name')`
- Auth headers never sent → 401 from customer endpoints
- **Fix:** `header_name = h.get('name') or h.get('key')`

#### Bug 5 — Response variable extraction failed (commit 613e654)
- Config had no `json_path` field, so `extract_json_path(result, '')` always returned None
- Agent said "Function completed successfully" but never read the data
- **Fix:** Fall back to `result.get(var_name)` when `json_path` is missing

#### Bug 6 — No HTTP error checking (commit 613e654)
- 401 Unauthorized reported as "Function completed successfully"
- **Fix:** Check `resp.status >= 400` before processing response

### Files Modified
- `agents/livekit-voice-agent/agent.py` — Complete rewrite of `create_custom_function_tool()`
- `agents/livekit-voice-agent/requirements.txt` — Pinned `livekit-agents>=1.4.0`

### Commits
- `ca68bcb` — Fix custom function tool registration (raw_schema approach)
- `9f1536c` — Add fallback chain + pin SDK version
- `613e654` — Fix headers, response extraction, HTTP error handling

### Verification
- Tested on SeniorHome agent with `lookup_community` custom function
- Agent successfully retrieved data from webhook and read it to caller

---

## Session: 2026-02-24

### Completed - Batch Calls Feature (Full Implementation)

Built a complete Batch Calls feature for scheduling and managing outbound call campaigns.

#### Frontend
- `src/pages/batch-calls.js` — New page with two-panel layout (form + recipients), History/Create tabs, CSV upload with parsing, scheduling, concurrency controls, call window configuration
- `src/components/BottomNav.js` — Added "Batch Calls" nav item (desktop-only) to both primary and fallback arrays
- `src/router.js` — Added `/batch-calls` route

#### Backend
- `supabase/functions/batch-calls/index.ts` — CRUD edge function (create, list, get, update, start, cancel)
- `supabase/functions/process-batch-calls/index.ts` — Worker that processes batches in chunks, respects call windows/concurrency, self-re-invokes for continuation

#### Database
- `supabase/migrations/20260224_batch_calls.sql` — `batch_calls` and `batch_call_recipients` tables with RLS policies and indexes
- Migration run via Supabase Management API

#### Documentation
- `docs/features/batch-calling.mdx` — Feature documentation
- `docs/api-reference/endpoints/create-batch.mdx` — API reference
- `docs/api-reference/endpoints/list-batches.mdx`
- `docs/api-reference/endpoints/get-batch.mdx`
- `docs/api-reference/endpoints/cancel-batch.mdx`
- `docs/mint.json` — Updated navigation (replaced bulk-calling with batch-calling, added API group)

#### UX Improvements
- Real-time Supabase subscriptions + polling fallback for live batch progress
- `resetForm()` method for clean multi-batch creation flow
- "+ New Batch" button in History view
- History as default view (not Create form)
- Fixed layout overflow where tabs were clipped off-screen (changed from `max-width: 1200px` to `flex: 1; min-width: 0`)

#### Edge Functions Deployed
- `batch-calls` (with `--no-verify-jwt`)
- `process-batch-calls` (with `--no-verify-jwt`)

### Files Modified
- `ARCHITECTURE.md` — Added batch calls route, edge functions, DB tables
- `CLAUDE.md` — Added batch calling section

### Completed - webhook-chat-message Fixes & Enhancements

Multiple fixes and features added to the chat widget backend:

#### 1. API Key Auth (commit f728808)
- Added `resolveUser()` support so `mgp_` API keys work alongside widget key auth
- Updated `magpipe-chat.js` with current Supabase anon key

#### 2. .catch() Bug Fix (commit 5c81b1d)
- `supabase.from(...).insert(...).catch()` threw "not a function" on follow-up messages
- Supabase PostgrestBuilder doesn't support `.catch()` — replaced with try/catch

#### 3. Custom Functions in Chat (commit 64502f9)
- webhook-chat-message had NO custom function support — only MCP tools, HubSpot, and support tickets
- Added: load custom functions from `custom_functions` table, register as OpenAI tools with `cf_` prefix, execute via HTTP
- Changed hardcoded `model: 'gpt-4o-mini'` and `max_tokens: 300` to use `agentConfig.chat_model` and `agentConfig.max_tokens`

#### 4. Session Persistence & agentId Support (commit 1b0fca6)
- Added `sessionId` param — callers pass it from previous response to resume conversation with full history
- Added `agentId` param — auto-resolves to agent's first active widget (no need to know widget key)
- Session lookup: sessionId first → visitorId fallback → create new
- `visitorId` no longer required if `sessionId` is provided

#### 5. MCP `chat_with_agent` Tool Rerouted
- Changed from `omni-chat` (admin-only, no custom functions, no sessions) to `webhook-chat-message`
- Now gets full agent experience: agent system prompt, custom functions, session persistence
- Added `visitor_name` and `visitor_email` params
- Stable `visitorId` (`mcp-{agent_id}`) for implicit session persistence
- Built dist and copied to npx cache (`/Users/erik/.npm/_npx/04dc65b01aa097a7/`)
- npm publish blocked by expired classic token (npm security update revoked classic tokens)

### Completed - SeniorHome Chat Agent Configuration

- `max_tokens`: 150 → 1024 → **2048** (needed for community listings + email offer in one response)
- DB constraint widened: `agent_configs_max_tokens_check` from 50-500 to **50-4096**
- Migration: `supabase/migrations/20260225_widen_max_tokens_constraint.sql`
- Created `send_info_email` custom function (DB ID: `427a2539-7211-47f0-a97c-798ea397f951`)
  - Endpoint: `https://www.seniorhome.ca/api/agent-tools/send-info-email`
  - Params: email (required), name, location, care_needs (optional)

### Documentation Updates
- `docs/openapi.json` — Added `agentId`, `sessionId` to webhook-chat-message request/response schema; fixed `session_id` → `sessionId` in response

### Edge Functions Deployed
- `webhook-chat-message` (with `--no-verify-jwt`) — multiple deploys
- `batch-calls`, `process-batch-calls` (with `--no-verify-jwt`)

### Session 3 (2026-02-24) — MCP Server Publish + semantic_memory_config

**npm publish fixes:**
- Got new npm granular access token (classic tokens revoked by npm security update)
- Published `magpipe-mcp-server@0.1.2` (chat_with_agent → webhook-chat-message routing)
- Published `magpipe-mcp-server@0.1.3` (added semantic_memory_config to update_agent)

**semantic_memory_config exposed via API:**
- Added `semantic_memory_config` to `update-agent` edge function allowedFields
- Added `semantic_memory_config` param to MCP `update_agent` tool (max_results, similarity_threshold, include_other_callers)
- Updated openapi.json Agent schema with semantic_memory_config
- Deployed `update-agent` edge function

**Full flow tested via mgp_ API key:**
- Turn 1: chat_with_agent → community listings with links
- Turn 2: sessionId persistence → send_info_email fired → signup link returned
- update_agent semantic_memory_config → writes and persists correctly

### Pending
- `send_info_email` endpoint on SeniorHome side — untested end-to-end (depends on their API being live)

---

## Session: 2026-02-24 (Session 5) — Batch Calls Bug Fixes, Recording, Agent Greeting

### Completed — Batch Calls Improvements

#### 1. Badge labels updated
- Initiating, Ringing, Connected, Hungup (+ raw status for terminal states)
- Updated `recipientStatusLabel()` and `recipientBadgeStyle()` in batch-calls.js

#### 2. Real-time status from SignalWire callbacks (not polling)
- `outbound-call-status` now uses mapped `dbStatus` for batch_call_recipients
- Completion checks include all active statuses: pending, calling, initiated, ringing, in_progress
- Added `batch_call_recipients` to Supabase Realtime publication

#### 3. Re-run fix
- Root cause: `updated_at` column doesn't exist on `batch_call_recipients` — caused silent Supabase error
- Simplified reset from `.in('status', [...])` to `.neq('status', 'pending')`
- Added error checking and logging

#### 4. Parallel leg initiation
- Agent SIP + PSTN legs now fire with `Promise.all` (was sequential)
- Reduced inter-recipient delay from 2000ms to 500ms

#### 5. Recording delivery
- Moved `record` from `<Conference>` to `<Dial>` (matches working outbound-call-swml pattern)
- Pass `call_record_id` through: process-batch-calls → CXML URL → batch-call-cxml → recordingStatusCallback
- Added XML escaping (`&` → `&amp;`) for CXML attribute URLs

#### 6. Agent greeting fix
- Agent now speaks configured greeting immediately via `session.say()` on outbound calls
- Removes multi-second delay caused by LLM round-trip (`generate_reply`)

### Files Modified
- `src/pages/batch-calls.js` — Badge labels, realtime status
- `supabase/functions/batch-calls/index.ts` — Re-run fix (removed updated_at, await triggerProcessing)
- `supabase/functions/process-batch-calls/index.ts` — Parallel legs, recording call_record_id, 500ms delay
- `supabase/functions/batch-call-cxml/index.ts` — Recording on Dial, XML escaping, call_record_id passthrough
- `supabase/functions/outbound-call-status/index.ts` — Consistent status mapping for batch recipients
- `agents/livekit-voice-agent/agent.py` — Outbound greeting via session.say()
- `ARCHITECTURE.md` — Added batch-call-cxml edge function

### Edge Functions Deployed
- `batch-calls`, `process-batch-calls`, `batch-call-cxml`, `outbound-call-status` (all with `--no-verify-jwt`)

---

## Session: 2026-02-24 (Session 4) — Worktree Cleanup, Outbound Call Fixes, Deploy Safety

### Worktree Cleanup
- **Merged `claude/pedantic-newton`** into master — had 10 unmerged commits including batch calls, chat widget auth, custom function CRUD, semantic memory config
- **Deleted `claude/goofy-gates`** — stale worktree with no unique commits (behind master)
- **Lesson:** Worktree branches can get stranded and not merged. Always check `git worktree list` and `git log master..<branch>` for unmerged work.

### Removed Legacy /bulk-calling
- Deleted `src/pages/bulk-calling.js`
- Removed route from `src/router.js`
- Removed "Bulk Calling" link and event listener from `src/pages/phone/dialpad.js`
- Removed legacy note from `CLAUDE.md`
- `/batch-calls` is the replacement (already live and working)

### Fixed Outbound Callback Calls Dropping
- **Root cause:** `callback-call-handler` edge function was deployed with `verify_jwt: true`
- SignalWire sends webhook with no JWT → Supabase rejected with 401 → call dropped after connecting
- **Fix:** Redeployed with `--no-verify-jwt`

### Fixed Balance Check Blocking Calls
- Changed threshold in `_shared/balance-check.ts` from `balance > 0` to `balance > -50`
- Both `initiate-callback-call` and `initiate-bridged-call` redeployed
- Added frontend low balance warning modal in `call-handler.js` — shows when dialing with negative balance, dismissible, call still proceeds

### Fixed signalwire-status-webhook Deploy Error
- Stray `import` statement at line 307 (inside function body) caused bundling failure
- Moved import to top of file where it belongs

### Created Deploy Safety Script (`scripts/deploy-functions.sh`)
- Maintains authoritative list of functions requiring `--no-verify-jwt`
- `./scripts/deploy-functions.sh <name>` — deploys with correct JWT flag
- `./scripts/deploy-functions.sh --check` — audits all deployed functions vs expected settings
- `./scripts/deploy-functions.sh --dry-run` — shows what would be deployed
- `./scripts/deploy-functions.sh` — deploys ALL functions with correct settings

### Fixed 13 Edge Functions with Wrong JWT Settings
Functions that were silently broken (JWT ON, should be OFF):
- `signalwire-status-webhook`, `sip-call-handler`, `forward-to-sip`, `transfer-cxml` (call handling)
- `stripe-webhook` (payment webhooks)
- `livekit-swml-handler` (LiveKit voice)
- `send-contact-email`, `send-custom-plan-inquiry` (public contact forms)
- `cal-com-oauth-callback` (calendar OAuth)
- `reconcile-recordings`, `sync-area-codes` (cron jobs)
- `webhook-campaign-status`, `webhook-sms-status` (status callbacks)

### Documentation Updated
- `README.md` — Added batch-calls.js, edge functions, DB tables
- `CLAUDE.md` — Removed /bulk-calling legacy note
- `ARCHITECTURE.md` — Already had batch calls docs from merge
- Open-source repo (`elagerway/magpipe`) synced twice

### Verification (All Passed)
- `/bulk-calling` fully removed, `/batch-calls` route and page intact
- Balance check passes at -$7.65 for both callback and bridged calls
- JWT audit: zero WRONG entries
- `signalwire-status-webhook` responds correctly after import fix
- All 9 nav items preserved
- Dialpad HTML structure and event listeners intact

