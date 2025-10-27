# pat Development Guidelines

Auto-generated from all feature plans. Last updated: 2025-09-29

## Active Technologies
- JavaScript ES6+, HTML5, CSS3 (vanilla, minimal framework usage per user requirement) + Supabase JS Client (auth, database, realtime), Service Worker API (PWA), Web Audio API (voice), WebRTC (real-time voice communication), Signalwire (custom telephony integration for calls/SMS - to be researched), Retellai.com (AI agent) (Pat-AI)

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
- Pat-AI: Added JavaScript ES6+, HTML5, CSS3 (vanilla, minimal framework usage per user requirement) + Supabase JS Client (auth, database, realtime), Service Worker API (PWA), Web Audio API (voice), WebRTC (real-time voice communication), Signalwire (custom telephony integration for calls/SMS - to be researched), Retellai.com (AI agent)

<!-- MANUAL ADDITIONS START -->
## Critical Working Principles
- **NEVER make assertions without verification**: Before stating something as fact (especially about what exists where, what's configured, etc.), VERIFY it first with actual data
- **When user corrects you, believe them immediately**: Do not argue or re-explain - they know their system better than you do
- **Check before asserting**: Use scripts/queries to verify state before making claims about database contents, SignalWire configuration, file locations, etc.
- **If uncertain, ask or investigate**: It's better to say "let me check" than to assert something incorrect
- **NEVER ask user to check logs - check them yourself**: Use direct API calls, CLI commands, or database queries to fetch logs instead of asking the user to copy/paste them. The user should not be a data retrieval service.
- **NEVER push to GitHub without local testing first**: ALWAYS test changes locally or get explicit user approval before running `git push`. Do not assume code is ready just because it compiles or looks correct. Real-world testing is mandatory before deployment.

## User Interface Guidelines
- **Never expose vendor names in user-facing messages**: Do not mention third-party service names like "Retell", "SignalWire", "OpenAI", etc. in error messages, success messages, or any UI text visible to end users
- Use product-centric language: "Pat AI assistant", "your number", "activate", "deactivate"
- Keep technical implementation details in backend logs only

## Database Management
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
<!-- MANUAL ADDITIONS END -->