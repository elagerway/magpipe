# Session Notes

**Last Updated:** 2026-01-25
**Active Branch:** Pat-AI

---

## Current Session (2026-01-25)

### ✅ COMPLETED: MCP Integration Architecture (Phases 1-4)

**Goal:** Build an MCP-inspired tool server that centralizes all AI agent tools (built-in + third-party integrations) with a unified interface.

**Architecture:**
```
┌─────────────────┐     ┌─────────────────┐
│  AdminChat UI   │     │   Settings UI   │
│ (Text + Voice)  │     │ (Integrations)  │
└────────┬────────┘     └────────┬────────┘
         │                       │
         ▼                       ▼
┌─────────────────────────────────────────┐
│           MCP Server (Edge Fn)          │
│  - mcp-tools (returns available tools)  │
│  - mcp-execute (executes tools)         │
│  - Tool Registry + Token Management     │
└─────────────────────────────────────────┘
         │                       │
         ▼                       ▼
┌─────────────────┐     ┌─────────────────┐
│  Built-in Tools │     │ External APIs   │
│  (14 tools)     │     │ (Slack, etc.)   │
└─────────────────┘     └─────────────────┘
```

---

### Phase 1: Foundation ✅

**Database Schema Created:**
- `integration_providers` - Catalog of available integrations
- `user_integrations` - User's connected integrations with OAuth tokens
- `integration_tool_logs` - Audit log of all tool executions

**Migration:** `supabase/migrations/20260125000000_mcp_integration_schema.sql`

**Edge Functions Created:**
- `supabase/functions/mcp-tools/index.ts` - Returns available tools in OpenAI format
- `supabase/functions/mcp-execute/index.ts` - Executes tools with preview/confirm flow

**Frontend Service:**
- `src/services/mcpClient.js` - Client for MCP server interaction

**Modified:**
- `src/services/realtimeAdminService.js` - Now fetches tools dynamically from MCP server

**Built-in Tools (14):**
1. update_system_prompt
2. add_knowledge_source
3. preview_changes
4. call_contact
5. send_sms
6. list_contacts
7. add_contact
8. schedule_sms
9. search_business
10. confirm_pending_action
11. cancel_pending_action
12. list_available_integrations
13. start_integration_connection
14. check_integration_status

---

### Phase 2: Settings UI ✅

**Components Created:**
- `src/components/IntegrationCard.js` - Individual integration card with connect/disconnect
- `src/components/IntegrationSettings.js` - "Connected Apps" section

**Edge Functions Created:**
- `supabase/functions/integration-oauth-start/index.ts` - Generic OAuth initiation
- `supabase/functions/integration-oauth-callback/index.ts` - Generic OAuth callback

**Modified:**
- `src/pages/settings.js` - Added "Connected Apps" section

---

### Phase 3: Agent-Initiated Connections ✅

**New Tools Added:**
- `list_available_integrations` - Shows what can be connected
- `start_integration_connection` - Returns OAuth URL for user to click
- `check_integration_status` - Verifies connection status

**Test Results:**
```json
// list_available_integrations
{
  "success": true,
  "message": "You don't have any integrations connected yet.\n\nAvailable to connect: Cal.com, Slack.",
  "result": { "connected": [], "available": ["cal_com", "slack"] }
}

// start_integration_connection (Cal.com)
{
  "success": true,
  "message": "To connect Cal.com, please tap the link below...",
  "result": { "oauth_url": "https://app.cal.com/auth/oauth2/authorize?..." }
}
```

---

### Phase 4: Slack Integration ✅

**Slack Tools Implemented:**
- `slack_send_message` - Posts messages to channels (resolves #channel-name to ID)
- `slack_list_channels` - Lists public/private channels

**Features:**
- Channel name to ID resolution (e.g., #general → C123ABC)
- Token refresh when within 5 minutes of expiry
- Error handling for common Slack API errors (channel_not_found, not_in_channel)

**Database Configuration:**
```json
// integration_providers.tools_schema for slack
[
  {"name": "slack_send_message", "parameters": {...}},
  {"name": "slack_list_channels", "parameters": {...}}
]
```

**Test Results (without Slack credentials configured):**
```json
// slack_send_message without connection
{
  "success": false,
  "message": "slack is not connected. Would you like me to help you connect it? Just say \"connect slack\"."
}

// start_integration_connection for Slack (no credentials)
{
  "success": false,
  "message": "Slack integration not configured"
}
```

---

### ⚠️ Pending: Slack OAuth Credentials

**To complete Slack integration, configure:**
```bash
npx supabase secrets set \
  SLACK_CLIENT_ID=your_client_id \
  SLACK_CLIENT_SECRET=your_client_secret \
  --project-ref mtxbiyilvgwhbdptysex
```

**Slack App Setup:**
1. Create app at https://api.slack.com/apps
2. OAuth scopes: `chat:write`, `channels:read`
3. Redirect URL: `https://mtxbiyilvgwhbdptysex.supabase.co/functions/v1/integration-oauth-callback`

---

### Phase 5: Expand Integrations (Not Started)

Future integrations to add:
- Microsoft Teams
- HubSpot CRM
- Gmail/Outlook

---

### Files Created/Modified

| File | Status |
|------|--------|
| `supabase/migrations/20260125000000_mcp_integration_schema.sql` | Created |
| `supabase/functions/mcp-tools/index.ts` | Created |
| `supabase/functions/mcp-execute/index.ts` | Created |
| `supabase/functions/integration-oauth-start/index.ts` | Created |
| `supabase/functions/integration-oauth-callback/index.ts` | Created |
| `src/services/mcpClient.js` | Created |
| `src/components/IntegrationCard.js` | Created |
| `src/components/IntegrationSettings.js` | Created |
| `src/services/realtimeAdminService.js` | Modified |
| `src/pages/settings.js` | Modified |

**Plan File:** `/Users/erik/.claude/plans/nifty-watching-church.md`

---

### ⚠️ Uncommitted Files (MCP Implementation)

**New Files (untracked):**
```
src/components/IntegrationCard.js
src/components/IntegrationSettings.js
src/services/mcpClient.js
supabase/functions/mcp-tools/index.ts
supabase/functions/mcp-execute/index.ts
supabase/functions/integration-oauth-start/index.ts
supabase/functions/integration-oauth-callback/index.ts
supabase/migrations/20260125000000_mcp_integration_schema.sql
```

**Modified Files:**
```
src/services/realtimeAdminService.js  (imports mcpClient, fetches tools dynamically)
src/pages/settings.js                  (added IntegrationSettings component)
```

**Edge Functions Deployed:**
- ✅ mcp-tools (deployed with JWT)
- ✅ mcp-execute (deployed with JWT)
- ✅ integration-oauth-start (deployed with JWT)
- ✅ integration-oauth-callback (deployed without JWT - webhook)

**Database Migration Applied:**
- ✅ 20260125000000_mcp_integration_schema.sql (via Supabase Management API)

---

## Previous Session (2026-01-19)

### ✅ COMPLETED: Outbound Call Recording via Bridged Conference

**Problem:**
- Outbound calls needed recording capability
- Previous SIP Call Handler approach was too complex

**Solution:**
SignalWire bridged conference approach - SignalWire calls LiveKit SIP, agent joins, then bridges to PSTN destination with recording enabled.

**Test Results (verified 2026-01-19):**
- ✅ Call completed successfully (45 seconds duration)
- ✅ Status callback updates working (`completed`)
- ✅ Disposition tracking (`outbound_completed`)
- ✅ Direction correctly set to `outbound`
- ✅ Recording URL captured via LiveKit egress
- ✅ Recording accessible (HTTP 200)
- ✅ Vendor call ID tracked

**Test Call:**
- Call Record ID: `243a8b57-9e28-4c57-ab7c-b511172d38eb`
- Call SID: `281a8ca5-ea3c-458b-9238-e173ccbe7e89`
- Recording: `https://pat-livekit-recordings.s3.amazonaws.com/recordings/call-*16042566768_zzRnGpBGRmo3.mp4`

**Edge Functions Deployed:**
- `initiate-bridged-call` - Creates call record, initiates SignalWire call to LiveKit SIP
- `outbound-call-swml` (no JWT) - Returns CXML that bridges to PSTN with recording
- `outbound-call-status` (no JWT) - Updates call status from SignalWire callbacks

**Architecture:**
```
UI Click → initiate-bridged-call → SignalWire REST API
                                       ↓
                              [Dial LiveKit SIP URI]
                                       ↓
                              Agent joins room
                                       ↓
                              outbound-call-swml returns CXML
                                       ↓
                              [Bridge to PSTN destination]
                                       ↓
                              Recording via LiveKit egress
```

**Status:** ✅ Feature complete and verified

---

### ⚠️ INCIDENT: Render Auto-Deploy Disabled (2026-01-22)

**Discovery:**
While testing outbound call direction detection, discovered Render auto-deploy was disabled. Last deployment was December 30, 2025 - nearly a month of code changes were not deployed.

**Impact:**
- Agent code changes (including direction detection logging) were not reaching production
- Any fixes or improvements to agent.py since Dec 30 were not live

**Root Cause:** Unknown. Auto-deploy had been enabled for months. No known action disabled it.

**Resolution:** User re-enabled auto-deploy manually in Render dashboard.

**Prevention:** Added to CLAUDE.md:
- Never modify Render settings without permission
- Verify deployment after pushing to Pat-AI branch
- Alert user if auto-deploy is found disabled

---

## Previous Session (2025-11-05)

### ✅ COMPLETED: Fixed Critical Bug - Inbound Calls Not Answering

**Problem:**
Inbound calls stopped working - LiveKit agent was crashing immediately on entrypoint, preventing it from joining rooms and answering calls.

**Root Cause Analysis:**

**What Broke:**
- Error: `UnboundLocalError: cannot access local variable 'datetime' where it is not associated with a value`
- Location: `agents/livekit-voice-agent/agent.py:315`
- Impact: Agent crashed before joining ANY room (inbound or outbound)

**Timeline of Breaking Changes:**

1. **Oct 25 (Commit 43debebe):** Added `import datetime` LOCALLY inside entrypoint function (line ~347)
   - Used for: `time_window = datetime.datetime.now() - datetime.timedelta(minutes=5)`
   - This was OK because datetime was only used AFTER the local import

2. **Oct 27 (Commit 45896bf):** Added MORE uses of `datetime.datetime.now()` at TOP of entrypoint (line 288)
   - Used for: Enhanced logging with timestamps
   - ERROR: This code ran BEFORE the local `import datetime` on line 347
   - Python sees local `import datetime` later in function, treats `datetime` as local variable
   - Accessing it before the import = UnboundLocalError

3. **Oct 27 (Commit 64d3c72):** Added database call state logging
   - More `datetime.datetime.now()` calls at top of function
   - Same error - using datetime before local import

4. **Oct 28 (Commit 9d72c5d):** Switched from prewarm to request_fnc
   - Removed prewarm function that also used `datetime.datetime.now()`
   - But entrypoint still broken

**The Fix (Commit 1cb757e):**
- Added `import datetime` to top-level imports (line 8)
- Now datetime is available throughout entire module
- Removed need for local import

**Why This Wasn't Caught:**

1. ❌ **No testing before commit** - Violated NON-NEGOTIABLE test-before-commit rule
2. ❌ **No agent healthcheck** - Agent crashes weren't visible until call attempted
3. ❌ **No automated tests** - No pytest/unittest to catch Python errors
4. ❌ **Incremental breakage** - Each commit added datetime usage without noticing missing import

**Lessons Learned:**

1. **NEVER use local imports mid-function** - Always import at module top
2. **Test agent after EVERY commit** - Place test call to verify it works
3. **Add Python linting** - Use pylint/flake8/mypy to catch undefined names
4. **Add agent healthcheck endpoint** - Verify agent is running and healthy
5. **Follow breaking change prevention workflow** - Search for variable usage before adding new references

**Recent Related Commits:**
- 1cb757e - Fix critical bug preventing inbound calls from being answered (THE FIX)
- 45896bf - Add comprehensive logging (INTRODUCED BUG)
- 64d3c72 - Add database call state tracking (MADE BUG WORSE)
- 43debebe - Implement multi-vendor call ID tracking (LOCAL IMPORT PATTERN)

**Status:** ✅ Fixed and deployed to Render

---

## Previous Session (2025-11-04)

### ✅ COMPLETED: Outbound Call Recording via Inbound Bridge

**Active Work:** Implemented outbound call recording using CXML-based bridging approach

**Problem:**
- Previous approach (SIP Call Handlers with direct SIP) taking too long, overly complex
- Need simpler solution to record outbound calls with full control
- User wants faster implementation of this "rather trivial feature"

**New Approach: Simulated Outbound via Inbound Bridge**
User clicks "Call" → UI shows "Connecting...", "Ringing..." → Behind the scenes we:
1. Trigger **inbound call** from SignalWire to WebRTC endpoint (user's browser)
2. User's browser auto-answers the inbound call
3. Once connected, bridge that call to PSTN destination
4. Get SignalWire Call SID and control recording programmatically via API

**Architecture:**
```
UI Click → Edge Function → SignalWire CXML
                           ↓
                    [Dial WebRTC endpoint] → User's browser answers
                           ↓
                    [Bridge to PSTN] → Destination phone
                           ↓
                    Return Call SID → Start recording via API
```

**Benefits:**
- Full control over call flow via CXML
- Access to SignalWire Call SID for recording control
- Can use SignalWire's Call Control API for recording/transcription
- No dependency on SIP Call Handlers
- Simpler than previous approach

**Implementation Completed:** ✅
1. ✅ Updated `initiate-bridged-call` Edge Function - Calls SignalWire REST API to initiate call
2. ✅ Updated `outbound-call-swml` Edge Function - Returns CXML that bridges browser SIP + PSTN
3. ✅ Created `outbound-call-status` Edge Function - Receives StatusCallback updates from SignalWire
4. ✅ Updated `inbox.js` - Changed UI to call `initiate-bridged-call` instead of old approach
5. ✅ Deployed all three Edge Functions with appropriate JWT settings

**Call Flow:**
1. User clicks "Call" in UI → shows "Connecting..."
2. `initiate-bridged-call` calls SignalWire REST API with:
   - To: PSTN destination number
   - From: User's caller ID
   - Url: `outbound-call-swml` endpoint for CXML
   - StatusCallback: `outbound-call-status` endpoint for progress
3. SignalWire executes CXML from `outbound-call-swml`:
   - First leg: `<Sip>` dials user's browser (SIP endpoint)
   - Second leg: `<Number>` dials PSTN destination
   - Recording: Enabled via `record="record-from-answer"` in CXML
4. User's browser receives inbound SIP call and auto-answers
5. Both legs bridged via SignalWire
6. Recording saved to `call_records.recording_url` via `sip-recording-callback`

**Edge Functions:**
- `initiate-bridged-call` (JWT required) - User initiates call
- `outbound-call-swml` (no JWT) - Returns CXML for call bridging
- `outbound-call-status` (no JWT) - Updates call status in database
- `sip-recording-callback` (no JWT) - Saves recording URL (already exists)

**Testing Results:** ✅
1. ✅ Test call successful! Call placed to +16045628647
2. ✅ Key finding: SignalWire requires `+` signs to be URL-encoded as `%2B` in form data
3. 🔄 Need to verify: Current test called cell directly, need to test browser→PSTN bridge

**Critical Fix Needed:**
- URLSearchParams in JavaScript doesn't properly encode `+` in form data
- Must manually encode phone numbers: `From=%2B1234567890` not `From=+1234567890`
- Edge Function needs update to handle this encoding

**Next Steps:**
1. Fix Edge Function to properly encode phone numbers
2. Test actual flow: SignalWire → Browser SIP → CXML bridges to PSTN
3. Verify recording appears in database

**Rejected Approaches (DO NOT USE):**
- ❌ SIP Call Handlers with direct SIP (previous approach) - too complex, taking too long
- ❌ SIP INFO messages with "Record: on/off" headers - doesn't work for direct SIP
- ❌ Client-side MediaRecorder API - rejected approach
- ❌ SIP Domain Applications - deprecated in SignalWire
- ❌ Manual dashboard configuration - must be programmatic

---

## Previous Session (2025-10-31)

### ✅ COMPLETED: Outbound Calls via SIP on SignalWire

**Active Work:** Implemented complete SIP-based outbound calling with call record tracking

**Problem:**
- Current outbound calling uses LiveKit Edge Function → LiveKit Room → PSTN
- User wants simpler SIP-first approach: Browser (JsSIP) → SignalWire (SIP) → PSTN
- Need call records in inbox for outbound calls

**Context:**
- JsSIP library already installed (v3.10.1) and implemented in `src/lib/sipClient.js`
- SIP client has all necessary methods: initialize(), makeCall(), hangup()
- SIP credentials added to service_numbers table
- SIP endpoints provisioned in SignalWire

**Completed:** ✅
1. ✅ Updated `inbox.js:1499-1594` - Changed initiateCall() to use SIP instead of LiveKit
2. ✅ Updated `inbox.js:1447-1459` - Changed hangup handler to use sipClient.hangup()
3. ✅ Created migration `20251031120000_add_sip_credentials.sql` - Adds sip_username, sip_password, sip_domain, sip_ws_server columns
4. ✅ Committed changes as `694f872` - "Switch outbound calling from LiveKit to SignalWire SIP"
5. ✅ Applied SIP credentials migration via SQL Editor
6. ✅ Provisioned SIP endpoint in SignalWire and updated database
7. ✅ **Call Record Tracking** - Added complete outbound call tracking:
   - Created migration `20251031180000_add_outbound_call_dispositions.sql`
   - Added outbound dispositions: outbound_completed, outbound_no_answer, outbound_busy, outbound_failed
   - Implemented call record creation on call initiation
   - Implemented call record updates on call end with duration and status
   - Added E.164 phone number normalization
   - Added UI support for outbound call status icons
   - Fixed call record field mapping (contact_phone, service_number, duration_seconds)
8. ✅ Fixed CNAM display - Updated SignalWire SIP endpoint caller_id to show "Erik L"
9. ✅ Committed call tracking as `17362ba` - "Add outbound call tracking to inbox"

**Testing:** ✅
- SIP registration working
- Outbound calls connecting successfully
- CNAM showing correct name (\"Erik L\")
- Call records appearing in inbox
- Duration tracking accurate
- Status icons displaying correctly
- Phone numbers formatted consistently

**Recent Related Commits:**
- `17362ba` - Add outbound call tracking to inbox ✅ **CURRENT**
- `694f872` - Switch outbound calling from LiveKit to SignalWire SIP
- `12df3c7` - Add outbound calling design specification and SIP credentials migration

**AI Agent Bridging Research:**
Explored adding LiveKit AI agent to outbound calls but discovered technical limitations:
- JsSIP makes direct SIP-to-SIP calls that don't appear in SignalWire's REST API
- Cannot modify active SIP calls via SignalWire's Call Control API
- SIP Call-ID from JsSIP ≠ SignalWire Call SID
- **Decision:** Defer AI agent integration to separate feature - requires different calling flow (e.g., browser calls SignalWire proxy number that executes SWML to bridge PSTN + LiveKit)

**Next Steps:**
1. Keep current SIP calling implementation for direct PSTN calls
2. Consider separate feature for AI-assisted outbound calls using different architecture

---

## Previous Session (2025-10-25)

### ✅ RESOLVED: LiveKit Egress Recording URL Not Populating in UI

**Problem:**
- Calls connecting successfully on LiveKit stack
- Recording egress starting successfully (egress_id saved to database)
- Recording URLs not appearing in UI after calls end
- No errors in Render logs

**Root Causes Identified:**
1. **Webhook deployed with JWT verification** - Supabase Edge Functions require `--no-verify-jwt` flag to accept external webhooks
2. **LiveKit authentication mechanism** - LiveKit uses project-based authentication for webhooks, not JWT tokens

**Resolution Steps:** ✅
1. **Created LiveKit Egress Webhook** - `supabase/functions/webhook-livekit-egress/index.ts`
   - Receives `egress_ended` events from LiveKit
   - Extracts recording URL from `egress_info.file_results[0].download_url`
   - Updates `call_records.recording_url` using `egress_id` as lookup key

2. **Fixed Resource Leak** - `agents/livekit-voice-agent/agent.py:614-619`
   - Added `await livekit_api.aclose()` to properly close aiohttp ClientSession
   - Prevents "Unclosed client session" asyncio warnings

3. **Deployed Webhook Without JWT Verification**
   - Command: `npx supabase functions deploy webhook-livekit-egress --no-verify-jwt`
   - Allows LiveKit to call webhook without Supabase authentication
   - Tested successfully: `{"ok":true,"updated":1}`

**Verification:**
- Webhook URL: `https://mtxbiyilvgwhbdptysex.supabase.co/functions/v1/webhook-livekit-egress`
- Already configured in LiveKit Dashboard (user confirmed)
- Test payload successfully updated call_record with egress_id `EG_KiHuHY3crrSx`

**Recent Related Commits:**
- `9fd435d` - Implement LiveKit egress webhook for deferred recording URL fetch
- `f81a67f` - Fix resource leak by closing LiveKit API client after calls

**Next Steps:**
1. Make test call to verify end-to-end recording flow
2. Check UI for recording URL after call ends

---

## Previous Session (2025-10-24)

### ✅ RESOLVED: Service Unavailable Error - LiveKit SIP Integration

**Problem:**
- Calls to +16042101966 failing with "Service Unavailable" error from SignalWire
- Number was active in database, configured in SignalWire, but calls wouldn't connect
- Initially working on LiveKit stack 2 hours prior, then suddenly stopped working

**Root Causes Identified:**
1. **LiveKit SIP Dispatch Rule Missing** - Accidentally deleted during troubleshooting
2. **Empty inboundNumbers Array** - LiveKit dispatch rule had `inboundNumbers: []` instead of `['+1']`
3. **Invalid Voice IDs** - Database had friendly names like `"11labs-Kate"` instead of real ElevenLabs voice IDs like `"21m00Tcm4TlvDq8ikWAM"`
4. **ElevenLabs TTS Connection Failure** - Agent connected but TTS crashed with "connection closed" error

**Critical Mistake:**
- Deleted working LiveKit dispatch rule (SDR_oMTrnZT3bZVE) while attempting to update it
- Node SDK wouldn't accept updates or recreations with partial parameters
- Had to manually recreate via LiveKit dashboard

**Resolution Steps:** ✅
1. **Recreated LiveKit SIP Dispatch Rule** (via LiveKit dashboard)
   - Rule ID: SDR_yFiprRssooJC
   - Trunk: ST_eDVUAafvDeF6 (SignalWire Inbound)
   - Name: Sw-calls
   - Rule Type: dispatchRuleIndividual
   - Room Prefix: call-
   - Agent: SW Telephony Agent

2. **Added Phone Number to SIP Trunk**
   - Manually added +16042101966 to trunk's inbound numbers in LiveKit dashboard
   - This associates the number with the dispatch rule

3. **Fixed Voice ID Mapping** (Critical Fix)
   - **File**: `src/pages/agent-config.js` (lines 95-116)
   - Changed dropdown values from friendly names to real ElevenLabs voice IDs:
     - `"11labs-Kate"` → `"21m00Tcm4TlvDq8ikWAM"` (Rachel)
     - `"11labs-Sarah"` → `"EXAVITQu4vr4xnSDxMaL"`
     - And 18 other voices
   - **File**: `src/pages/verify-phone.js` (line 440)
   - Changed default voice_id from `"11labs-Kate"` to `"21m00Tcm4TlvDq8ikWAM"`
   - **File**: `src/pages/agent-config.js` (line 1198)
   - Changed default voice_id in agent creation

4. **Updated User's Voice ID in Database**
   - Manually changed `voice_id` from `"11labs-Kate"` to `"21m00Tcm4TlvDq8ikWAM"` in agent_configs table
   - This fixed the immediate TTS connection failure

**Technical Details:**
- **LiveKit Agent Code**: `agents/livekit-voice-agent/agent.py` (line 330)
  - Function `get_voice_config()` strips `"11labs-"` prefix from voice_id
  - `"11labs-Kate"` becomes `"Kate"` which is NOT a valid ElevenLabs voice ID
  - Real ElevenLabs voice IDs are 20-character alphanumeric strings
- **Preview Function**: `supabase/functions/preview-voice/index.ts` (line 81)
  - Already handles both formats: `.replace('11labs-', '')` is no-op for real IDs
  - Works correctly with new voice ID format

**Files Modified:**
- `src/pages/agent-config.js` - Voice dropdown options (lines 95-116, 1198)
- `src/pages/verify-phone.js` - Default voice_id (line 440)
- `scripts/update-livekit-dispatch.js` - Updated dispatch rule ID to SDR_yFiprRssooJC

**Testing:**
- ✅ Call to +16042101966 connects successfully
- ✅ Audio bidirectional (can hear agent, agent can hear caller)
- ✅ Voice preview works with new voice IDs
- ✅ LiveKit agent running on Render (deploy ec7792c)

**Lessons Learned:**
- **NEVER delete infrastructure (dispatch rules, trunks, etc.) without 100% certainty of recreation**
- **Always verify voice IDs match what the TTS provider expects**
- **LiveKit SDK requires full object for updates, not partial - use dashboard for changes**
- **Test actual calls after configuration changes, not just deployment status**

**Next Steps:**
1. Test phone number deletion workflow (service_numbers → numbers_to_delete)
2. Test cancel deletion workflow (numbers_to_delete → service_numbers inactive)

---

## Previous Session (2025-10-04)

### ✅ Phone Number Capability Badges & SignalWire SMS Issues

**Problem:**
- Phone numbers showing as SMS-capable during search but not after purchase
- No visibility into Voice/SMS capabilities in the UI
- SignalWire using uppercase capability keys (SMS, MMS) but our code expecting lowercase

**Work Completed:** ✅
1. **Capability Badges** (ec7792c)
   - Added Voice/SMS capability badges to select-number page
   - Added capability badges to manage-numbers page
   - Created "Fix Capabilities" button to sync actual capabilities from SignalWire

2. **Capability Normalization**
   - Updated provision-phone-number to normalize capabilities (uppercase → lowercase)
   - Updated search-phone-numbers to normalize capabilities in response
   - Created fix-number-capabilities Edge Function to repair existing numbers

3. **Enhanced Canadian Number Search**
   - Search all 43 Canadian area codes instead of just 9
   - Filter for SMS-capable numbers before returning results
   - Added country-based search (canada/usa keywords)

4. **Verification SMS Routing**
   - Updated verify-phone-send to route by country (Canada vs US)
   - Canada: +16043377899
   - US: +16282954020

**SignalWire Issue Discovered:** ⚠️
- SignalWire's AvailablePhoneNumbers API shows SMS capability but purchased numbers don't have it enabled
- Affects ALL newly purchased numbers (both Canadian and US)
- Older numbers in account have SMS working fine
- User needs to contact SignalWire support

**Recent Commits:**
- `ec7792c` - Add phone number capability badges and SMS filtering ✅ **PUSHED**
- `29d3d24` - Update Canadian verification SMS sender
- `2c57786` - Add LiveKit support to voice preview generator

**Next Steps:**
1. Contact SignalWire support about SMS capability mismatch
2. Use existing SMS-capable numbers (+16282954020, +12367006869, etc.)
3. Monitor for SignalWire fixes

**NEW ISSUE (2025-10-04 02:00 AM):** ⚠️
- +15878560911 shows as ACTIVE in UI but NOT in database
- Calls to this number fail with "Service Unavailable"
- Database insert failing silently when activating number
- Need to debug provision-phone-number function or check RLS policies
- +16282954811 works fine (different user, already in database)
- Issue: erik@snapsonic.com numbers not persisting to service_numbers table

---

## Previous Session (2025-10-03)

### ✅ RESOLVED: LiveKit Agent PSTN Call Issues on Render

**Problem:**
- Calls from PSTN → SignalWire → LiveKit Agent failing with multiple errors
- Agent crashing on startup

**Root Causes (Fixed):**
- Wrong VAD import: `rtc.VAD.load()` → should be `silero.VAD.load()`
- Missing silero dependency in requirements.txt
- Wrong TTS parameter names (voice → voice_id, model_id → model)
- Missing explicit API key (plugin expects ELEVEN_API_KEY, we use ELEVENLABS_API_KEY)

**Fixes Applied:** ✅
1. **VAD Import Fix** (5184a87)
   - Added `silero` to imports from livekit.plugins
   - Changed `vad=rtc.VAD.load()` to `vad=silero.VAD.load()`

2. **Missing Dependency** (59e728e)
   - Added `livekit-plugins-silero>=0.6.0` to requirements.txt

3. **ElevenLabs TTS Parameters** (4257ee2)
   - Fixed parameter names: `voice` → `voice_id`, `model` → `model_id`
   - Removed deprecated parameters (stability, similarity_boost, optimize_streaming_latency)
   - **Deployment Status:** ~~LIVE~~ ❌ (Still had wrong param)

4. **ElevenLabs TTS Model Parameter** (d132d94)
   - Fixed parameter name: `model_id` → `model` (correct per LiveKit docs)
   - **Deployment Status:** ~~LIVE~~ ❌ (Missing API key)

5. **ElevenLabs API Key** (8d1e22f)
   - Plugin expects ELEVEN_API_KEY but we use ELEVENLABS_API_KEY
   - Pass explicitly via api_key parameter
   - **Deployment Status:** LIVE ✅ (06:06:39 UTC)

**Next Steps:**
1. ✅ ~~Fix deployment errors~~ - DONE (5 fixes deployed)
2. ✅ ~~Wait for Render deployment to complete (commit 8d1e22f)~~ - LIVE
3. ✅ ~~Test PSTN call to verify agent connects and responds properly~~ - **SUCCESS!** 🎉
4. ✅ ~~Enable voice cloning UI for LiveKit~~ - DONE (commit 35173fa)
5. Monitor for VAD issues (cutting off users, not detecting end of speech, etc.)
6. Optional: Tune VAD parameters if needed

**Recent Related Commits:**
- `8d1e22f` - Pass ELEVENLABS_API_KEY explicitly to TTS ✅ **LIVE**
- `d132d94` - Fix ElevenLabs TTS parameter - use model instead of model_id ✅
- `4257ee2` - Fix ElevenLabs TTS parameter names (voice_id) - model_id still wrong ❌
- `59e728e` - Add livekit-plugins-silero to requirements ✅
- `5184a87` - Fix VAD import - use silero.VAD instead of rtc.VAD ✅
- `211da61` - Update session notes and audits with VAD import fix
- `14dd33f` - Update audits.md with session memory system entry
- `ea00ca4` - Add persistent session memory system

**Uncommitted Changes:**
- Multiple LiveKit debugging scripts added
- agent.py modifications
- Edge function updates for voice stack switching

---

## Session History

### 2025-10-02: Transfer Number Management & Voice Cloning
- Implemented transfer number management with validation
- Added voice cloning feature for LiveKit stack
- Created multiple LiveKit debugging/management scripts

### 2025-10-01: Agent Configuration & Code Audit
- Added advanced agent settings with auto-save
- Complete codebase audit performed
- All systems operational

---

## Technical Context

### LiveKit Agent Architecture
- **Location:** `agents/livekit-voice-agent/agent.py`
- **Pipeline:** Silero VAD → Deepgram STT → OpenAI LLM → ElevenLabs TTS
- **Deployment:** Render.com as background service
- **Health Check:** HTTP server on port 10000
- **Entry Point:** `entrypoint(ctx)` function called for each LiveKit room

### VAD Configuration (Current)
```python
vad=silero.VAD.load()  # Line 352
```

**Available Silero VAD Parameters (not yet configured):**
- `min_speech_duration` - minimum speech length to detect
- `min_silence_duration` - how long silence before end-of-speech
- `activation_threshold` - sensitivity to speech
- `prefix_padding_duration` - include audio before speech starts
- `max_speech_duration` - maximum continuous speech length

### Voice AI Stack
- **Current Active Stack:** LiveKit (custom voice support)
- **Alternative Stack:** Retell (preset voices only)
- **Stack switching:** Admin-controlled via database

---

## Debugging Resources

### LiveKit Scripts (Created)
- `scripts/check-livekit-trunk.js` - Check trunk configuration
- `scripts/debug-livekit-call.js` - Debug active calls
- `scripts/update-livekit-trunk.js` - Update trunk settings
- `scripts/get-livekit-call.js` - Get call details
- `scripts/recreate-livekit-trunk-tls.js` - Recreate TLS trunk
- `agents/livekit-voice-agent/monitor-render.sh` - Monitor Render logs

### Key Environment Variables
- `LIVEKIT_URL` - LiveKit server URL
- `LIVEKIT_API_KEY` - API credentials
- `LIVEKIT_API_SECRET` - API secret
- `ELEVENLABS_API_KEY` - TTS provider
- `OPENAI_API_KEY` - LLM provider
- `DEEPGRAM_API_KEY` - STT provider

---

## Important Reminders

- **Never reset database without explicit request** (see CLAUDE.md)
- **Always update audits.md with commits** (see CLAUDE.md)
- **Test in browser after JavaScript changes** (see CLAUDE.md)
- **Update this file at end of each session** with current state
