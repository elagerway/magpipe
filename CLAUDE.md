# pat Development Guidelines

Auto-generated from all feature plans. Last updated: 2025-09-29

## Active Technologies
- JavaScript ES6+, HTML5, CSS3 (vanilla, minimal framework usage per user requirement) + Supabase JS Client (auth, database, realtime), Service Worker API (PWA), Web Audio API (voice), WebRTC (real-time voice communication), Signalwire (custom telephony integration for calls/SMS - to be researched), Retellai.com (AI agent) (Pat-AI)
- JavaScript ES6+ (frontend), TypeScript (Supabase Edge Functions), Python 3.11 (LiveKit agent - if phone admin integration needed) (003-admin-agent-home)
- PostgreSQL (Supabase) with pgvector extension for embeddings (003-admin-agent-home)

## Project Structure
```
src/
tests/
```

## Commands
npm test [ONLY COMMANDS FOR ACTIVE TECHNOLOGIES][ONLY COMMANDS FOR ACTIVE TECHNOLOGIES] npm run lint

## Code Style
JavaScript ES6+, HTML5, CSS3 (vanilla, minimal framework usage per user requirement): Follow standard conventions

## Recent Changes
- 003-admin-agent-home: Added JavaScript ES6+ (frontend), TypeScript (Supabase Edge Functions), Python 3.11 (LiveKit agent - if phone admin integration needed)
- Pat-AI: Added JavaScript ES6+, HTML5, CSS3 (vanilla, minimal framework usage per user requirement) + Supabase JS Client (auth, database, realtime), Service Worker API (PWA), Web Audio API (voice), WebRTC (real-time voice communication), Signalwire (custom telephony integration for calls/SMS - to be researched), Retellai.com (AI agent)

<!-- MANUAL ADDITIONS START -->
## Critical Working Principles
- **NEVER make assertions without verification**: Before stating something as fact (especially about what exists where, what's configured, etc.), VERIFY it first with actual data
- **When user corrects you, believe them immediately**: Do not argue or re-explain - they know their system better than you do
- **Check before asserting**: Use scripts/queries to verify state before making claims about database contents, SignalWire configuration, file locations, etc.
- **If uncertain, ask or investigate**: It's better to say "let me check" than to assert something incorrect
- **NEVER ask user to check logs - check them yourself**: Use direct API calls, CLI commands, or database queries to fetch logs instead of asking the user to copy/paste them. The user should not be a data retrieval service.
- **NEVER commit or push to GitHub without EXPRESS USER PERMISSION**: NEVER run `git commit` or `git push` without the user's explicit approval. ALWAYS test changes locally FIRST, then present results to the user and WAIT for permission before committing. This is NON-NEGOTIABLE.

## Test Credentials - USE THESE, NOT USER'S CREDENTIALS
- **CRITICAL: NEVER use erik@snapsonic.com or any user's real credentials for testing**
- **Always use the dedicated test account**:
  - Email: `claude-test@snapsonic.test`
  - Password: `TestPass123!`
- **Why this matters**: Using real user credentials in tests is wasteful (burns tokens with unnecessary auth flows) and risky (could affect production data)
- **For Playwright/browser tests**: Always use the test account above
- **For API tests**: Use `TEST_USER_TOKEN` from `.env` when available

## Git Commit Message Guidelines
- **Do NOT include "Co-Authored-By: Claude" footer**: User prefers clean commit messages without AI attribution
- **Do NOT include emoji robot or Claude Code link**: Keep commit messages professional and concise
- **Format**:
  ```
  Brief summary (50 chars max)

  Detailed description of changes
  - What changed
  - Why it changed
  - How to test it

  File paths changed: path/to/file.ext:line_numbers
  ```

## User Interface Guidelines
- **Never expose vendor names in user-facing messages**: Do not mention third-party service names like "Retell", "SignalWire", "OpenAI", etc. in error messages, success messages, or any UI text visible to end users
- Use product-centric language: "Pat AI assistant", "your number", "activate", "deactivate"
- Keep technical implementation details in backend logs only

## Outbound SIP Call Configuration
- **CRITICAL: Caller ID must be from UI dropdown selection**: The caller ID for outbound SIP calls MUST use the number the user selects from the UI dropdown, NOT a hardcoded number
- **Never hardcode caller ID**: Do not hardcode any phone number as the caller ID in the SIP call handler
- **Source of caller ID**: The caller ID should come from the `From` parameter passed to the call handler, which originates from the user's selection in the UI
- **SIP Call Handler Flow**:
  1. User selects a caller ID number from dropdown in UI
  2. UI passes this number to the SIP client
  3. SIP client includes it in the call initiation
  4. SignalWire sends it as the `From` parameter to the call handler webhook
  5. Call handler uses this `From` value as the `callerId` in the cXML `<Dial>` tag

## Supabase CLI Limitations
- **CRITICAL: Supabase CLI doesn't support `logs` command**: The `npx supabase functions logs` command is NOT available in this version of Supabase CLI
- **DO NOT use**: `npx supabase functions logs <function-name>` - it will fail with "unknown command" error
- **Instead use**: Direct database queries, browser console, or other logging methods to verify Edge Function execution
- **Log viewing alternatives**:
  - Check Supabase Dashboard → Edge Functions → Logs tab
  - Add console.log statements and check browser console
  - Query database to verify data was updated
  - Use curl to test Edge Functions directly

## Database Management

### Environment Variables - CRITICAL
- **SUPABASE_SERVICE_ROLE_KEY MUST be in .env for programmatic access**
- **ALWAYS check .env for SUPABASE_SERVICE_ROLE_KEY BEFORE:**
  - Calling Edge Functions directly via curl (you will get 401 Unauthorized without it)
  - Querying database programmatically with service privileges
  - Testing features that bypass Row Level Security (RLS)
- **If SUPABASE_SERVICE_ROLE_KEY is missing from .env:**
  - ❌ DO NOT try to call Edge Functions - you will fail with 401
  - ❌ DO NOT try to query database with service role - you will fail
  - ✅ Ask user to add it to .env: `SUPABASE_SERVICE_ROLE_KEY=eyJhb...`
  - ✅ Or use alternative testing (browser UI, have user test manually)
- **Service role key format**: Starts with `eyJ`, much longer than anon key
- **Where to find it**: Supabase Dashboard → Settings → API → `service_role` secret

### Database Reset Policy
- **CRITICAL: NEVER RESET THE DATABASE WITHOUT EXPLICIT USER REQUEST**: DO NOT run `npx supabase db reset` under ANY circumstances unless the user explicitly asks you to reset the database
- **Database reset deletes ALL data**: Running `db reset` wipes all data including user accounts, agent configurations, contacts, messages, and all other data - this is DESTRUCTIVE and IRREVERSIBLE
- **For schema changes**: Use `export SUPABASE_ACCESS_TOKEN=sbp_17bff30d68c60e941858872853988d63169b2649 && npx supabase db push` to apply new migrations without clearing data
- **For Edge Function changes**: Edge Functions don't require database operations - they auto-deploy or use `npx supabase functions deploy <function-name>`
- **For code-only changes**: Most changes to TypeScript/JavaScript in Edge Functions or frontend code don't require any database commands at all
- Never ask the user to run database commands - execute them directly (but NEVER db reset unless explicitly requested)

## Session Memory & Documentation

### Session Notes (SESSION-NOTES.md)
- **CRITICAL: Update SESSION-NOTES.md at the start and end of each work session**: This file serves as persistent memory across Claude sessions
- **Always read SESSION-NOTES.md at session start**: Check "Current Session" section to understand active work and context
- **Update current session section when:**
  - Starting work on a new problem/feature
  - Making significant progress or discoveries
  - Encountering blockers or issues
  - Switching between different tasks
  - User loses connection (power outage, network issue, etc.)
- **Session notes format**:
  - **Active Work:** One-line description of current task
  - **Problem:** What issue is being solved
  - **Context:** Background information and relevant details
  - **Known Issues:** List of identified problems
  - **Next Steps:** Numbered action items
  - **Recent Related Commits:** Git SHAs and descriptions
  - **Uncommitted Changes:** What's in working tree
- **Add to Session History section:** When completing a major feature or switching focus areas
- **Keep Technical Context updated:** Document architecture decisions, configuration details, key file locations
- **Update Debugging Resources:** Add new scripts, tools, or procedures discovered during work

### Audit Documentation (audits.md)
- **Always update audits.md when creating commits**: Every time you create a git commit, add a new audit entry at the top of `audits.md`
- **Audit entry format**:
  - Section header: `## Audit: [Date] (Part N if multiple on same day)`
  - Build hash: The commit SHA (e.g., `fdd6210`)
  - Commit message: The git commit message
  - Date: YYYY-MM-DD format
  - Auditor: Claude (AI Assistant)
  - Summary: Brief 1-2 sentence overview with ✅ status
  - New Features: Detailed breakdown of what was added/changed
  - Dependencies Updated: List any new dependencies or version changes
- **What to document**:
  - New features and functionality
  - Database schema changes (tables, columns, migrations)
  - New Edge Functions or API endpoints
  - UI/UX improvements
  - Bug fixes (if significant)
  - Breaking changes
  - Security updates
- **Keep it comprehensive**: Include file paths, function names, and specific implementation details
- **Use checkmarks**: Mark completed items with ✓

### Code Comments for Context
- **Add contextual comments for non-obvious decisions**: Use `// CONTEXT:` or `# CONTEXT:` to explain why something was done a certain way
- **Document workarounds**: Use `// WORKAROUND:` to explain temporary solutions
- **Mark important sections**: Use `// IMPORTANT:` for critical code that shouldn't be modified without understanding impact
- **Reference issues**: Use `// FIX:` or `// TODO:` with issue numbers or descriptions

## Feature Implementation & Testing

### CRITICAL: Test Recursively BEFORE Committing to Git (NON-NEGOTIABLE)

**The Rule**: NEVER commit code to git without testing it first AND getting user's express permission. Period. No exceptions.

**Required Testing Workflow**:
1. **Implement change** (fix bug, add feature, refactor code)
2. **Write/update tests** for the specific change
3. **Run all related tests** to verify nothing broke:
   - Unit tests for changed functions
   - Integration tests for changed APIs/endpoints
   - End-to-end tests for changed user flows
   - Regression tests for features that depend on changed code
4. **Manually test in browser/environment** if applicable
5. **Verify no errors in console/logs**
6. **Present results to user and WAIT for explicit permission to commit**
7. **ONLY AFTER PERMISSION**: `git add` → `git commit` → `git push`

**NEVER COMMIT WITHOUT PERMISSION**: Do not run `git commit` or `git push` without the user explicitly saying "commit this" or "push this" or "looks good, commit it". Testing locally does NOT automatically mean you can commit - you MUST wait for permission.

**What "Test Recursively" Means**:
- Test the thing you changed (obvious)
- Test everything that USES the thing you changed (downstream impact)
- Test everything the thing you changed DEPENDS ON (upstream validation)
- Example: If you modify a database function used by 3 Edge Functions, test all 3 Edge Functions

**Why This is NON-NEGOTIABLE**:
1. **Prevents production breakage**: Broken code never reaches users
2. **Saves massive time**: Finding bugs pre-commit takes 5 minutes; post-deploy takes hours
3. **Maintains codebase trust**: Every commit is known-working
4. **Enables safe rollback**: If you must revert, you know the previous commit worked
5. **Documents actual behavior**: Tests show what the code really does, not what you think it does

**What Happened (Example)**:
- Changed queue-number-deletion calculation logic
- Created test script that called the API
- Test script DELETED PRODUCTION NUMBERS from service_numbers table
- Pushed to git before realizing the damage
- Had to revert commit, restore all numbers from deletion queue, redeploy

**How to Test Without Breaking Things**:
1. **Use test data, not production data**: Create test user accounts, use fake phone numbers
2. **Read-only tests first**: Query database, call GET endpoints, inspect state
3. **Write tests in sandbox**: Use staging environment or local Supabase instance
4. **Dry-run mode**: Add flags to scripts that log actions without executing them
5. **Manual approval**: If must test in production, get explicit user approval first

**Enforcement**:
- Any commit that breaks existing functionality will be immediately reverted
- Developer must explain what testing was skipped and why
- Repeated violations indicate process failure requiring intervention

### CRITICAL: Breaking Change Prevention
- **ALWAYS verify changes won't break existing functionality**: Before implementing any new feature, database change, or function modification, you MUST search for all code that might be affected
- **Breaking Change Analysis Workflow** (MANDATORY for ALL changes):
  1. **Identify what's changing**: Database columns, function signatures, API endpoints, data formats, etc.
  2. **Search for all references**: Use `grep -r "pattern" path/` to find every place the changed element is used
  3. **Analyze impact**: For each reference found, determine if the change will break it
  4. **Fix or update**: Either:
     - Add backward compatibility (keep old + add new)
     - Update all references to use new implementation
     - Add fallback logic to handle both old and new
  5. **Document**: List all potentially affected code in commit message or separate doc
  6. **Test**: Verify nothing breaks before committing

- **Example: Database Column Changes**
  - Renaming/removing column? Search: `grep -r "column_name" .`
  - Adding new column? Search for places that might need to populate it
  - Check: Models, Edge Functions, frontend code, tests, migrations

- **Example: Function Signature Changes**
  - Changing parameters? Search: `grep -r "functionName(" .`
  - Check: All call sites, imports, exports

- **Example: API Endpoint Changes**
  - Changing endpoint path/method? Search: `grep -r "endpoint/path" .`
  - Check: Frontend fetch calls, webhooks, external integrations

- **Always perform recursive testing when implementing new features**: Before completing any feature implementation, use grep/search tools to find all references to related functionality
- **Ensure backward compatibility**: When modifying existing functionality, verify all dependent code is updated to conform with new features/functions
- **Check for breaking changes**: Search for references to modified database fields, function signatures, API endpoints, and UI elements
- **Update all related components**: When changing one part of the system (e.g., moving a field from one table to another), update all functions, UI components, and Edge Functions that reference it
- **Remove variable references when removing UI fields**: When removing an input field from the UI, search for ALL references to that field's ID including:
  - `getElementById('field-id')` calls
  - Variable assignments that check `field.id === 'field-id'`
  - Event listeners that reference the field
  - Form submission handlers that read the field's value
- **Test in browser after JavaScript changes**: After modifying JavaScript files, always refresh and check browser console for errors before declaring feature complete
- **Example workflow**:
  1. Implement new feature (e.g., per-transfer-number passcodes)
  2. Use grep to find all references to old implementation (e.g., `grep -r "transfer_secret" supabase/functions/`)
  3. Update all found references to use new implementation
  4. Search for UI references and update them
  5. Search for JavaScript variable references (e.g., `grep "transfer-secret" src/`)
  6. Test in browser and check console for errors
  7. Verify no broken references remain before declaring feature complete

## Media Files
- **Always open media files immediately**: When the user provides a file path for .png, .jpg, .gif, .mov, .aeic, or any other media file, use the Read tool to view it without asking for permission first
- Media files (screenshots, images, videos) are part of the normal workflow and should be processed automatically
- Never ask for permission to view media files - just open them

## Voice AI Stack Architecture
- **Multi-stack support**: Pat supports multiple Voice AI providers (Retell, LiveKit) that can be swapped by admin
- **Provider-specific features**: Each provider has different capabilities and limitations
- **Stack selection**: Active stack is controlled via database configuration, NOT hardcoded

### CRITICAL: LiveKit SIP Trunk Does NOT Work for Direct Outbound
- **NEVER use LiveKit SIP trunk for direct outbound calls**: The LiveKit SIP trunk (`ST_3DmaaWbHL9QT`) does NOT work and has NEVER worked
- **DO NOT call `livekit-outbound-call` Edge Function**: This approach has been tried multiple times and always fails with "object cannot be found"
- **Direct outbound calls use browser SIP ONLY**: Outbound calls go through browser WebRTC SIP directly to SignalWire, NOT through LiveKit trunk

### Outbound Call Recording Via Bridged Conference
- **Recording IS possible via bridged conference approach**: Both legs (browser SIP + PSTN destination) are bridged into a SignalWire conference which can be recorded
- **Bridged approach architecture**:
  1. SignalWire calls the browser's SIP endpoint (browser auto-answers)
  2. SignalWire bridges that leg to the PSTN destination number
  3. Both legs are in a SignalWire conference that supports recording
- **This is the ONLY working approach for outbound call recording**: Do not attempt LiveKit trunk or other methods

### Voice AI Providers

#### Retell (Current Default)
- **Preset voices only**: Supports 29 ElevenLabs preset voices + OpenAI voices
- **NO custom/cloned voices**: ElevenLabs custom voices cannot be added programmatically (Retell API limitation)
- **Voice cloning UI**: MUST be hidden when Retell is active provider
- **Agent management**: Never question agent existence if calls are working
- **Verification**: Use `curl --request GET --url https://api.retellai.com/get-agent/{agent_id} -H 'Authorization: Bearer {RETELL_API_KEY}'`
- **Trust the database**: If `agent_configs.retell_agent_id` contains an ID, use it

#### LiveKit (Custom Voice Support)
- **All voices supported**: Preset ElevenLabs voices + custom/cloned voices programmatically
- **Voice cloning UI**: MUST be visible and functional when LiveKit is active provider
- **Full control**: Direct integration with ElevenLabs API for complete voice management
- **Custom pipeline**: STT (Deepgram) → LLM (OpenAI) → TTS (ElevenLabs)
- **Credentials**: Use LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET from environment

### LiveKit Agent Dispatch - FAILED APPROACHES (DO NOT RETRY)

**Problem**: LiveKit agent not joining outbound call rooms automatically

**❌ APPROACH 1: Explicit Dispatch via AgentDispatchClient (Commits: 6493101)**
- **What we tried**: Used `AgentDispatchClient.createDispatch(roomName, agentName)` in Edge Function to explicitly send agent to room
- **Result**: FAILED - Dispatch sent successfully but agent never received it
- **Why it failed**: Agent worker on Render not properly registered with LiveKit Cloud to receive dispatch messages. Despite having `prewarm_fnc` configured, no dispatch messages reach the agent.
- **Evidence**: Call state logs show `agent_dispatched` from Edge Function, but never `agent_entrypoint_called` or `agent_connected` from agent
- **DO NOT retry explicit dispatch** - this requires agent worker registration with LiveKit Cloud that we cannot configure

**❌ APPROACH 2: Auto-join with request_fnc (Commits: 9d72c5d, cbcc14e)**
- **What we tried**: Added `request_fnc` to agent WorkerOptions to automatically accept all job requests when rooms are created
- **Result**: FAILED - Agent never receives job requests
- **Why it failed**: `request_fnc` requires LiveKit Cloud to send job requests to the agent worker. Job requests are only sent based on agent dispatch rules configured in LiveKit Cloud dashboard (not via SDK). Without dispatch rules configured for our room patterns, no job requests are generated.
- **Evidence**: No "JOB REQUEST RECEIVED" logs from agent despite multiple test calls
- **DO NOT retry request_fnc** - requires LiveKit Cloud agent dispatch rules which we cannot configure programmatically

**❌ APPROACH 3: Room prefix matching (Commit: f25c8b3)**
- **What we tried**: Changed outbound room prefix from `outbound-` to `call-outbound-` to match existing SIP dispatch rule pattern (`call-`)
- **Result**: FAILED - Room prefix alone doesn't trigger agent dispatch
- **Why it failed**: Confused SIP dispatch rules (which route SIP calls to rooms) with agent dispatch rules (which send agents to rooms). These are SEPARATE systems. The SIP dispatch rule with `roomPrefix: 'call-'` only affects where incoming SIP calls create rooms - it does NOT automatically send agents to those rooms.
- **Evidence**: Inbound calls work, suggesting agent dispatch rules ARE configured somewhere for inbound patterns, but changing outbound room prefix didn't help
- **DO NOT retry room prefix changes alone** - this doesn't create agent dispatch rules

**✅ WHAT ACTUALLY WORKS FOR INBOUND**:
- Inbound calls successfully trigger agent auto-join
- This means agent dispatch rules ARE configured somewhere in LiveKit Cloud
- These rules are NOT visible/manageable via SDK
- They must be configured in LiveKit Cloud dashboard UI

**🎯 REQUIRED SOLUTION**:
Agent dispatch rules MUST be configured in LiveKit Cloud dashboard (cloud.livekit.io):
1. Navigate to project → Agent Dispatch settings
2. Create rule: Room pattern `call-*` → Agent `SW Telephony Agent`
3. This will make agent auto-join for both inbound (`call-{number}`) and outbound (`call-outbound-{userId}-{timestamp}`) rooms

**CRITICAL LEARNING**: LiveKit agent dispatch is controlled by LiveKit Cloud dashboard configuration, NOT by code. You cannot programmatically configure agent dispatch rules via the SDK. Stop trying code-based solutions - this requires dashboard configuration.

## Debugging Infrastructure (NON-NEGOTIABLE)

### Database Call State Tracking
ALL complex multi-step processes (calls, workflows, integrations) MUST log every state transition to the database. This eliminates "check the console logs" debugging and provides instant visibility into what's happening.

**Implementation Pattern**:
```sql
CREATE TABLE call_state_logs (
  id UUID PRIMARY KEY,
  call_id UUID REFERENCES call_records(id),
  room_name TEXT,              -- For correlation
  state TEXT NOT NULL,         -- State enum
  component TEXT NOT NULL,     -- 'edge_function', 'agent', 'sip', 'browser'
  details JSONB,               -- Context about this state
  error_message TEXT,          -- If state is 'error'
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Required State Transitions**:
1. **Process Initiated** - Log when request received with input parameters
2. **Component Activation** - Log when each major service/function starts
3. **Integration Points** - Log before/after external API calls, database operations
4. **Component Completion** - Log success/failure with output data
5. **Error Conditions** - Log ALL errors with full context (not just message)
6. **Process Completion** - Log final state and outcome

**LiveKit Outbound Call Example**:
```typescript
// Edge Function logs:
await logCallState(supabase, null, roomName, 'initiated', 'edge_function', {
  phone_number, caller_id, user_id
})
await logCallState(supabase, null, roomName, 'room_created', 'edge_function', {
  room_name, max_participants
})
await logCallState(supabase, callId, roomName, 'sip_participant_created', 'edge_function', {
  participant_id, sip_call_id, trunk_id
})
await logCallState(supabase, callId, roomName, 'agent_dispatched', 'edge_function', {
  agent_name, dispatch_metadata
})

// Agent logs:
log_call_state(room_name, 'agent_entrypoint_called', 'agent', {
  room_name, timestamp
})
log_call_state(room_name, 'agent_connected', 'agent', {
  room_name, auto_subscribe: 'AUDIO_ONLY'
})
```

**Debugging Workflow**:
1. Make test call from browser
2. Query database: `SELECT * FROM call_state_logs WHERE room_name = 'outbound-xxx' ORDER BY created_at`
3. See exact sequence of states - know immediately where it failed
4. No need to check console logs, Render logs, LiveKit dashboard separately

**Why This is Required**:
- ❌ **Without state logging**: "Can you check the Render logs? What about LiveKit dashboard? Did the Edge Function succeed? I don't know what happened."
- ✅ **With state logging**: Query database, see `initiated → room_created → sip_participant_created → agent_dispatched` but no `agent_entrypoint_called` = agent dispatch broken

**Implementation Requirements**:
- State logging MUST wrap in try/catch (never throw)
- State logging MUST be fast (async, no blocking)
- Helper functions for easy logging (see livekit-outbound-call/index.ts:14-36 and agent.py:64-77)
- RLS policies for security (service role full access, users see own data only)

### Stack Switching Rules
- **Admin-controlled**: Only admin can switch active Voice AI stack
- **Per-user configuration**: Each user's active stack is stored in database
- **UI adaptation**: Voice cloning features show/hide based on active provider
- **No mixing**: A user is on ONE stack at a time (Retell OR LiveKit, not both)
- **Migration**: When switching stacks, agent configuration must be recreated on new provider

## Retell Custom Tool Naming Convention
- **All Retell custom tool names must be unique per user**: Tool names must follow the pattern `{user_id}_{function_name}`
- **Maximum length**: Tool names must be 63 characters or less (Retell limitation)
- **User ID format**: Use the user's UUID from the database with dashes removed (e.g., `abc123def4567890abcdef12345678`) - UUIDs without dashes are 32 characters
- **Function name**: Descriptive name of the tool's purpose (e.g., `transfer`, `transfer_immed`, `voicemail`, `callback`)
- **Keep function names short**: Since UUID is 32 chars + underscore = 33 chars, function names should be 30 characters or less
- **Example**: If user_id is `abc123-def4-5678-90ab-cdef12345678`, the tool names would be:
  - `abc123def4567890abcdef12345678_transfer` (45 chars)
  - `abc123def4567890abcdef12345678_transfer_immed` (51 chars)
- **Apply to all custom tools**: This naming convention applies to all Retell custom tools including transfer tools, voicemail tools, callback tools, etc.
- **Function references**: When referencing these tools in prompts or LLM configuration, use the full unique name
- **Tool cleanup**: When removing tools, filter by user_id prefix to remove all tools belonging to a specific user

## Phone Number Management
- **Database is source of truth for ownership**: The `service_numbers` table determines which user owns which phone number. NEVER add numbers to a user just because they exist in SignalWire.
- **SignalWire is source of truth for metadata**: For numbers that ARE in the database, SignalWire provides accurate purchase dates, SIDs, and capabilities
- **Workflow for syncing number metadata**:
  1. Query database to get user's phone numbers: `SELECT phone_number FROM service_numbers WHERE user_id = ?`
  2. For each number in database, query SignalWire to get `date_created`, `sid`, `capabilities`
  3. Update database with SignalWire metadata for that specific number
  4. NEVER add numbers from SignalWire that aren't already in the database for that user
- **How to query SignalWire for a specific number**:
  ```bash
  # Get all SignalWire numbers, then filter for the specific one you need
  curl -X GET "https://${SIGNALWIRE_SPACE_URL}/api/laml/2010-04-01/Accounts/${SIGNALWIRE_PROJECT_ID}/IncomingPhoneNumbers.json" \
    -u "${SIGNALWIRE_PROJECT_ID}:${SIGNALWIRE_API_TOKEN}"
  ```
- **SignalWire provides**: Real SID, actual purchase date (`date_created`), friendly name, capabilities, current configuration
- **CRITICAL**: Just because a number exists in SignalWire doesn't mean a specific user purchased it. Other users may have purchased those numbers, or they may be untracked legacy numbers.

## SignalWire API Access
- **CRITICAL: Always source .env before calling SignalWire APIs**: The environment variables must be loaded into the shell session for authentication to work
- **Authentication**: SignalWire APIs use HTTP Basic Auth with `PROJECT_ID:API_TOKEN` credentials from .env
- **API Endpoints Structure**:
  - **LAML API** (Voice/SMS): `https://${SIGNALWIRE_SPACE_URL}/api/laml/2010-04-01/Accounts/${SIGNALWIRE_PROJECT_ID}/...`
  - **Relay API** (SIP Endpoints): `https://${SIGNALWIRE_SPACE_URL}/api/relay/rest/endpoints/sip`
- **Required Environment Variables**:
  ```bash
  SIGNALWIRE_PROJECT_ID=your-signalwire-project-id
  SIGNALWIRE_API_TOKEN=your-signalwire-api-token
  SIGNALWIRE_SPACE_URL=erik.signalwire.com
  ```

### SIP Endpoint Management
- **List SIP Endpoints**:
  ```bash
  source .env && curl -s -u "$SIGNALWIRE_PROJECT_ID:$SIGNALWIRE_API_TOKEN" \
    "https://erik.signalwire.com/api/relay/rest/endpoints/sip"
  ```
- **Update SIP Endpoint (e.g., caller ID, call handler)**:
  ```bash
  source .env && curl -s -X PUT -u "$SIGNALWIRE_PROJECT_ID:$SIGNALWIRE_API_TOKEN" \
    -H 'Content-Type: application/json' \
    -d '{"caller_id":"Erik L"}' \
    "https://erik.signalwire.com/api/relay/rest/endpoints/sip/${ENDPOINT_ID}"
  ```
- **Configure Call Handler for Recording**:
  ```bash
  source .env && curl -s -X PUT -u "$SIGNALWIRE_PROJECT_ID:$SIGNALWIRE_API_TOKEN" \
    -H 'Content-Type: application/json' \
    -d '{"call_request_url":"https://mtxbiyilvgwhbdptysex.supabase.co/functions/v1/sip-call-handler"}' \
    "https://erik.signalwire.com/api/relay/rest/endpoints/sip/${ENDPOINT_ID}"
  ```
- **SIP Endpoint Fields**:
  - `id`: Unique identifier for the endpoint
  - `username`: SIP username for authentication (e.g., `test_sip_endpoint`)
  - `caller_id`: Display name for outbound calls
  - `call_request_url`: Webhook URL that returns CXML for call handling (used for recording)
  - `call_request_method`: HTTP method for call handler (default: POST)

### Current SIP Endpoints (erik@snapsonic.com)
- **Endpoint ID**: `0ed5ed8b-fd6a-4964-8c36-6547609260f4`
- **Username**: `pat_778736359f5a4eee`
- **Call Handler**: `https://mtxbiyilvgwhbdptysex.supabase.co/functions/v1/sip-call-handler`
- **Recording Callback**: `https://mtxbiyilvgwhbdptysex.supabase.co/functions/v1/sip-recording-callback` (configured in CXML)
- **Purpose**: Automatically records all outbound SIP calls via CXML
  - `caller_id`: Display name shown on outbound calls (CNAM)
  - `send_as`: Default phone number for outbound calls
  - `encryption`: SIP encryption level (`optional`, `required`)
  - `codecs`: Supported audio codecs (OPUS, G722, PCMU, PCMA, etc.)

### Phone Number API (LAML)
- **List Phone Numbers**:
  ```bash
  source .env && curl -s -X GET \
    "https://${SIGNALWIRE_SPACE_URL}/api/laml/2010-04-01/Accounts/${SIGNALWIRE_PROJECT_ID}/IncomingPhoneNumbers.json" \
    -u "${SIGNALWIRE_PROJECT_ID}:${SIGNALWIRE_API_TOKEN}"
  ```
- **Get Recent Calls**:
  ```bash
  source .env && curl -s -X GET \
    "https://${SIGNALWIRE_SPACE_URL}/api/laml/2010-04-01/Accounts/${SIGNALWIRE_PROJECT_ID}/Calls.json?PageSize=10" \
    -u "${SIGNALWIRE_PROJECT_ID}:${SIGNALWIRE_API_TOKEN}"
  ```

### API Authentication Troubleshooting
- **Problem**: `curl` shows `Authorization: Basic Og==` (empty credentials)
- **Cause**: Environment variables not loaded into shell session
- **Solution**: Always run `source .env &&` before curl commands
- **Verification**: Check env vars are set: `echo "Length: ${#SIGNALWIRE_PROJECT_ID}"` should show `36`
- **Never**: Hardcode credentials in scripts - always use environment variables

## SignalWire WebSocket SIP Configuration for Browser Calling

### CRITICAL: Required Settings for PSTN Outbound Calls

**For browser-based SIP calling to PSTN to work, the SIP endpoint requires:**

1. **PSTN Passthrough: ENABLED** (Dashboard only - cannot set via API)
   - Location: SignalWire Dashboard → SIP → Endpoints → [endpoint] → Settings → PSTN Passthrough
   - **Without this**: Calls fail with "502 Bad Gateway - DESTINATION_OUT_OF_ORDER"
   - This allows the SIP endpoint to route calls directly to PSTN

2. **Call Handler: LAML Webhooks** (can set via API)
   ```bash
   curl -X PUT -u "$SIGNALWIRE_PROJECT_ID:$SIGNALWIRE_API_TOKEN" \
     -H 'Content-Type: application/json' \
     -d '{"call_handler":"laml_webhooks"}' \
     "https://erik.signalwire.com/api/relay/rest/endpoints/sip/${ENDPOINT_ID}"
   ```
   - Must be `laml_webhooks`, NOT `relay_context`
   - `call_request_url` should be empty `""` for direct calling

3. **WebSocket SIP Configuration** (JsSIP)
   - **SIP URI**: `sip:test_sip_endpoint@erik-0f619b8e956e.sip.signalwire.com`
   - **WebSocket URL**: `wss://erik-0f619b8e956e.sip.signalwire.com` (NO PORT - uses 443)
   - **Registrar**: `erik-0f619b8e956e.sip.signalwire.com`
   - **Password**: Set via API when creating endpoint

### Database Storage
Store in `users` and `service_numbers` tables:
```
sip_username: test_sip_endpoint
sip_password: [endpoint password]
sip_realm: erik-0f619b8e956e.sip.signalwire.com
sip_ws_server: wss://erik-0f619b8e956e.sip.signalwire.com
```

### Reference
- Official Guide: https://developer.signalwire.com/platform/basics/guides/webrtc-with-sip-over-websockets/

## Playwright Testing Framework

### Authentication for Playwright Tests
Since the user authenticates via Google OAuth, password-based login doesn't work in tests. Use magic link OTP approach:

```javascript
// 1. Generate magic link OTP via admin API
const response = await fetch('https://mtxbiyilvgwhbdptysex.supabase.co/auth/v1/admin/generate_link', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    'apikey': SUPABASE_SERVICE_ROLE_KEY,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ type: 'magiclink', email: 'erik@snapsonic.com' })
});
const data = await response.json();
const otp = data.email_otp;

// 2. Verify OTP to get session
const verifyResponse = await fetch('https://mtxbiyilvgwhbdptysex.supabase.co/auth/v1/verify', {
  method: 'POST',
  headers: {
    'apikey': SUPABASE_ANON_KEY,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ type: 'email', token: otp, email: 'erik@snapsonic.com' })
});
const session = await verifyResponse.json();

// 3. Inject session into browser localStorage
await page.goto('http://localhost:3000');
await page.evaluate((sessionData) => {
  const storageKey = 'sb-mtxbiyilvgwhbdptysex-auth-token';
  localStorage.setItem(storageKey, JSON.stringify({
    access_token: sessionData.access_token,
    refresh_token: sessionData.refresh_token,
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: 'bearer',
    user: sessionData.user
  }));
}, session);

// 4. Navigate to protected page
await page.goto('http://localhost:3000/inbox');
```

### Test Scripts Available
- **`./test-bridged-call.sh [phone] [caller_id]`**: Initiates bridged outbound call via API
  - Uses `TEST_USER_TOKEN` from `.env`
  - Defaults: phone=+16045628647, caller_id=+16042566768

### Environment Variables for Testing
Add to `.env`:
```bash
TEST_USER_TOKEN=<jwt_access_token>  # Generated via magic link OTP
TEST_USER_ID=77873635-9f5a-4eee-90f3-d145aed0c2c4
```

### Regenerating Test Token
Tokens expire after 1 hour. Regenerate with:
```bash
# Generate magic link
curl -s -X POST "https://mtxbiyilvgwhbdptysex.supabase.co/auth/v1/admin/generate_link" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"type": "magiclink", "email": "erik@snapsonic.com"}' | jq -r '.email_otp'

# Verify OTP (replace OTP_CODE with the output above)
curl -s -X POST "https://mtxbiyilvgwhbdptysex.supabase.co/auth/v1/verify" \
  -H "apikey: $VITE_SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"type": "email", "token": "OTP_CODE", "email": "erik@snapsonic.com"}' | jq -r '.access_token'
```

### Running Playwright Tests
```bash
# Run specific test
npx playwright test tests/test-outbound-direction.spec.js --headed

# Run all tests
npx playwright test

# Debug mode
npx playwright test --debug
```

### Common Playwright Issues and Solutions

1. **Call button not found on inbox page**
   - The call button (#call-btn) is on the Phone page, not Inbox
   - Solution: Navigate to Phone via bottom nav: `await page.click('text=Phone')`

2. **Microphone permission modal blocks interaction**
   - App shows "Allow Microphone" modal on Phone page
   - Solution: Click the allow button before proceeding:
   ```javascript
   const allowMicBtn = page.locator('text=Allow Microphone');
   if (await allowMicBtn.isVisible()) {
     await allowMicBtn.click();
   }
   ```

3. **Bottom nav intercepts clicks on call button**
   - Error: `<nav class="bottom-nav">…</nav> intercepts pointer events`
   - Solution: Use force click on ALL buttons that may be behind the nav:
   ```javascript
   await callBtn.click({ force: true });
   await hangupBtn.click({ force: true });
   ```

4. **SIP registration takes time**
   - Wait 15+ seconds for SIP to register before making calls
   - Check logs for "SIP registered successfully"

5. **Session injection format**
   - Supabase expects specific localStorage format:
   ```javascript
   localStorage.setItem('sb-mtxbiyilvgwhbdptysex-auth-token', JSON.stringify({
     access_token, refresh_token, expires_in: 3600,
     expires_at: Math.floor(Date.now() / 1000) + 3600,
     token_type: 'bearer', user
   }));
   ```

6. **Console logs not captured**
   - Add console listener BEFORE navigating: `page.on('console', msg => ...)`

### Test File Locations
- `tests/test-outbound-direction.spec.js` - Tests outbound call direction detection
- `tests/test-outbound-call-with-record.spec.js` - Tests call record creation
- `./test-bridged-call.sh` - Shell script for API-based call testing

<!-- MANUAL ADDITIONS END -->
- psql or sql is not installed or accessible, use a Python approach with direct PostgreSQL connection instead
- Add this to memory, next time you need to get the details about a number (purchase date, etc) , look it up on Signalwire
- PLACE TEST CALLS YOURSELF, STOP ASKING ME TO PLACE CALLS BEFORE YOU HAVE DONE SO YOURSELF
- do not assume that numbers in the db are not provisioned in signalwire, do a lookup in signalwire if there is any confusion if the number is provisioned or not
