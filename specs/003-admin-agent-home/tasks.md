# Tasks: Admin Agent & Home Page Redesign

**Feature**: 003-admin-agent-home
**Input**: Design documents from `/Users/erik/Documents/GitHub/Snapsonic/pat/specs/003-admin-agent-home/`
**Prerequisites**: plan.md, research.md, data-model.md, contracts/, quickstart.md

---

## Execution Summary

**Total Tasks**: 38
**Estimated Duration**: 3-4 days (with parallel execution)
**Tech Stack**: JavaScript ES6+, TypeScript (Deno), PostgreSQL (pgvector), OpenAI GPT-4

**Key Dependencies**:
- Database schema → All backend tasks
- Backend APIs → Frontend components
- All implementation → Integration tests
- All tests passing → E2E validation

---

## Phase 3.1: Database Setup

- [ ] **T001** [P] Create migration file `supabase/migrations/070_admin_agent_schema.sql` with pgvector extension enable
- [ ] **T002** [P] Create `admin_conversations` table with RLS policies in migration
- [ ] **T003** [P] Create `admin_messages` table with RLS policies in migration
- [ ] **T004** [P] Create `knowledge_sources` table with RLS policies in migration
- [ ] **T005** [P] Create `knowledge_chunks` table with vector(1536) column and RLS policies in migration
- [ ] **T006** [P] Create `access_code_attempts` table with RLS policies in migration
- [ ] **T007** [P] Create `sms_confirmations` table with RLS policies in migration
- [ ] **T008** [P] Create `admin_action_logs` table with RLS policies in migration
- [ ] **T009** [P] Add `phone_admin_access_code`, `phone_admin_locked`, `phone_admin_locked_at` columns to `users` table in migration
- [ ] **T010** Create indexes for all tables (conversation lookups, vector search, access attempts) in migration
- [ ] **T011** Apply migration locally: `export SUPABASE_ACCESS_TOKEN=... && npx supabase db push`
- [ ] **T012** Verify schema in database: query `information_schema.tables` for all 7 new tables

---

## Phase 3.2: Contract Tests (TDD - MUST COMPLETE BEFORE 3.3)

**CRITICAL: These tests MUST be written and MUST FAIL before ANY implementation code is written**

- [ ] **T013** [P] Contract test for POST `/admin-agent-chat` in `tests/contract/admin-agent-chat.test.js`
  - Assert request schema: `{message: string, conversation_id?: uuid}`
  - Assert response schema: `{conversation_id: uuid, response: string, requires_confirmation: boolean, pending_action?: object}`
  - Assert 401 on missing auth token
  - Assert 400 on empty message
  - **MUST FAIL** initially (no implementation yet)

- [ ] **T014** [P] Contract test for POST `/knowledge-source-add` in `tests/contract/knowledge-source-add.test.js`
  - Assert request schema: `{url: string, sync_period?: enum}`
  - Assert response schema: `{id: uuid, url: string, title: string, status: enum, chunk_count: number}`
  - Assert 400 on invalid URL format
  - Assert 422 on inaccessible URL
  - **MUST FAIL** initially

- [ ] **T015** [P] Contract test for GET `/knowledge-source-list` in `tests/contract/knowledge-source-list.test.js`
  - Assert response schema: `{sources: array<KnowledgeSource>}`
  - Assert 401 on missing auth
  - **MUST FAIL** initially

- [ ] **T016** [P] Contract test for DELETE `/knowledge-source-delete` in `tests/contract/knowledge-source-delete.test.js`
  - Assert request schema: `{id: uuid}`
  - Assert response schema: `{success: boolean, deleted_chunks: number}`
  - Assert 404 on non-existent source
  - **MUST FAIL** initially

- [ ] **T017** [P] Contract test for POST `/access-code-update` in `tests/contract/access-code-update.test.js`
  - Assert request schemas for both actions: `request` and `verify`
  - Assert response schemas vary by action
  - Assert 403 on invalid confirmation code
  - **MUST FAIL** initially

---

## Phase 3.3: Backend Implementation (Edge Functions)

**Prerequisites**: All contract tests (T013-T017) must be written and failing

- [ ] **T018** Implement `supabase/functions/admin-agent-chat/index.ts`
  - Parse JWT to get user_id
  - Create or load conversation from `admin_conversations`
  - Build OpenAI messages array from `admin_messages` table
  - Define function schemas: `update_system_prompt`, `add_knowledge_source`, `preview_changes`
  - Call OpenAI GPT-4 with streaming
  - Handle function calls: execute or queue for confirmation
  - Save user message and assistant response to `admin_messages`
  - Return response with `requires_confirmation` flag
  - Log action to `admin_action_logs` if changes applied
  - Contract test T013 should now PASS

- [ ] **T019** Implement `supabase/functions/knowledge-source-add/index.ts`
  - Validate URL format (http/https only)
  - Check user's knowledge source count (<50 limit)
  - Fetch URL with timeout (10 seconds)
  - Parse HTML with Cheerio
  - Extract content with Readability
  - Chunk text into 500-token segments
  - Generate embeddings via OpenAI `text-embedding-3-small`
  - Insert `knowledge_sources` record with status='completed'
  - Insert all chunks into `knowledge_chunks` table
  - Return source metadata with chunk count
  - Log action to `admin_action_logs`
  - Contract test T014 should now PASS

- [ ] **T020** Implement `supabase/functions/knowledge-source-list/index.ts`
  - Parse JWT to get user_id
  - Query `knowledge_sources` table filtered by user_id
  - Order by created_at DESC
  - Return array of sources with all metadata
  - Contract test T015 should now PASS

- [ ] **T021** Implement `supabase/functions/knowledge-source-delete/index.ts`
  - Parse JWT to get user_id
  - Verify source exists and belongs to user
  - Get chunk count before deletion
  - Delete source (cascades to chunks via FK)
  - Log action to `admin_action_logs`
  - Return success with deleted_chunks count
  - Contract test T016 should now PASS

- [ ] **T022** Implement `supabase/functions/access-code-update/index.ts` (request action)
  - Parse JWT to get user_id and phone number
  - Hash new access code with bcrypt (cost factor 12)
  - Generate 6-digit random confirmation code
  - Store in `sms_confirmations` table with 5-minute expiry
  - Send SMS via Postmark API
  - Return confirmation_id and expires_at
  - Part of T017 contract test should now PASS

- [ ] **T023** Implement `supabase/functions/access-code-update/index.ts` (verify action)
  - Load confirmation from `sms_confirmations` by user_id
  - Check not expired (created_at < 5 min ago)
  - Check attempts < 3
  - Compare provided code with stored code
  - If match: update `users.phone_admin_access_code` with hashed new code
  - If match: set `phone_admin_locked` = FALSE (unlock if was locked)
  - If match: mark confirmation as verified
  - If mismatch: increment attempts
  - Log action to `admin_action_logs`
  - Return success or error with attempts_remaining
  - T017 contract test should now fully PASS

- [ ] **T024** Implement `supabase/functions/knowledge-source-sync/index.ts` (background job)
  - Query `knowledge_sources` where `next_sync_at < NOW()` and `sync_status = 'completed'`
  - For each source: set status='syncing'
  - Re-fetch URL and process (same logic as T019)
  - Delete old chunks, insert new chunks
  - Update `last_synced_at`, `next_sync_at` (based on sync_period), status='completed'
  - Handle errors: set status='failed', populate error_message
  - NOTE: This will be triggered via cron or manual invocation

---

## Phase 3.4: Phone Admin Integration (LiveKit Agent)

**Prerequisites**: T009 complete (users table has access code columns)

- [ ] **T025** Add phone admin authentication to `agents/livekit-voice-agent/agent.py`
  - In entrypoint, check if caller_id matches a user's phone number
  - If match: ask "Is this [user.full_name]?" via `session.say()`
  - Get voice response, check for affirmative ("yes", "yeah", "correct")
  - If confirmed: ask "Please say your access code" via `session.say()`
  - Get voice response, transcribe to digits (handle "one two three" → "123")
  - Query `users` table for hashed access code, verify with bcrypt
  - If correct: set `session.context['is_admin'] = True`, `session.context['user_id'] = user.id`
  - If incorrect: increment attempts in `access_code_attempts` table
  - If 3 failed attempts: set `users.phone_admin_locked = TRUE`, end call
  - If locked: inform user to reset via web app
  - Log all attempts to `access_code_attempts` table
  - Test manually: Call service number from registered phone, verify auth flow

---

## Phase 3.5: Frontend - Service Layer

**Prerequisites**: Backend Edge Functions (T018-T023) deployed and accessible

- [ ] **T026** [P] Create `src/services/adminAgentService.js`
  - `sendMessage(message, conversationId)` → calls `/admin-agent-chat`
  - `confirmAction(conversationId, actionId)` → applies pending action
  - Handle streaming responses from OpenAI
  - Return parsed response with conversation_id, response text, requires_confirmation
  - Handle errors: 401 → redirect to login, 400/500 → show error message

- [ ] **T027** [P] Create `src/services/knowledgeService.js`
  - `addSource(url, syncPeriod)` → calls `/knowledge-source-add`
  - `listSources()` → calls `/knowledge-source-list`
  - `deleteSource(id)` → calls `/knowledge-source-delete`
  - Handle errors with user-friendly messages (no vendor names)
  - Return parsed data

- [ ] **T028** [P] Create `src/lib/voiceRecognition.js`
  - Detect browser support: `window.SpeechRecognition || window.webkitSpeechRecognition`
  - Export `isSupported()` function
  - Export `VoiceRecognition` class with methods:
    - `start()` - begins listening
    - `stop()` - stops listening
    - `onResult(callback)` - fires when transcription complete
    - `onError(callback)` - fires on error
  - Configure: `continuous=false`, `interimResults=false`, `lang='en-US'`
  - Auto-stop after 3 seconds of silence

---

## Phase 3.6: Frontend - Components

**Prerequisites**: Service layer (T026-T028) complete

- [ ] **T029** [P] Create `src/components/VoiceToggle.js`
  - Import `voiceRecognition.js`
  - Show microphone button if `isSupported()`
  - Button states: inactive (gray) → listening (pulsing red) → processing (spinner)
  - Click to start: call `recognition.start()`
  - Click again to stop: call `recognition.stop()`
  - On result: fire `onTranscript(text)` callback prop
  - On error: show toast notification
  - Mobile-responsive: large touch target (44x44pt minimum)

- [ ] **T030** [P] Create `src/components/AdminChatInterface.js`
  - Import `adminAgentService.js` and `VoiceToggle.js`
  - State: messages array, inputValue, isLoading, conversationId
  - Render message history (user messages left, assistant messages right)
  - Input field at bottom with send button
  - Include VoiceToggle component (pass onTranscript callback)
  - On send: call `adminAgentService.sendMessage()`, append to messages
  - Handle streaming: update last message as chunks arrive
  - If `requires_confirmation`: show "Confirm" / "Cancel" buttons
  - On confirm: call `confirmAction()`, show success/error
  - Auto-scroll to bottom on new messages
  - Mobile-responsive: full-width on small screens

- [ ] **T031** [P] Create `src/components/KnowledgeSourceManager.js`
  - Import `knowledgeService.js`
  - State: sources array, isLoading, showAddModal, selectedSource
  - On mount: call `knowledgeService.listSources()`
  - Render list of sources with: URL, title, sync_status, chunk_count, last_synced_at
  - Expandable details: show sync_period dropdown, next_sync_at, delete button
  - "Add Knowledge Source" button → show modal with URL input and sync_period dropdown
  - On add: call `knowledgeService.addSource()`, refresh list
  - On delete: show confirmation modal, call `deleteSource()`, refresh list
  - Show loading spinners during async operations
  - Mobile-responsive: stack cards vertically on small screens

- [ ] **T032** [P] Create `src/components/AccessCodeSettings.js`
  - State: accessCodeSet (boolean), showCode (boolean), isChanging (boolean), confirmationId, attemptingVerify (boolean)
  - On mount: check if `users.phone_admin_access_code IS NOT NULL` (via user profile query)
  - If set: show "Access Code: ••••" with "Click to view" button
  - On "Click to view": reveal code for 10 seconds, then hide
  - "Change Access Code" button → show input for new code (4-20 chars)
  - On submit: call `accessCodeService.requestChange(newCode)`
  - Show "Check your phone for confirmation code" message
  - Input field for 6-digit code appears
  - On verify: call `accessCodeService.verifyChange(confirmationCode)`
  - Handle errors: show attempts_remaining, lock message if 3 failed
  - Mobile-responsive: center content, large input fields

---

## Phase 3.7: Frontend - Pages & Routing

**Prerequisites**: Components (T029-T032) complete

- [ ] **T033** Create `src/pages/home.js`
  - Import `AdminChatInterface.js`
  - Full-screen layout: chat interface takes 100% height minus header/nav
  - Check authentication: redirect to /login if not logged in
  - On mount: create greeting message from assistant
  - Include bottom navigation (existing component)
  - Mobile-first: optimized for portrait phone screens

- [ ] **T034** Update `src/pages/settings.js`
  - Import `KnowledgeSourceManager.js` and `AccessCodeSettings.js`
  - Add new sections:
    - "Knowledge Base" section with KnowledgeSourceManager component
    - "Phone Admin Access" section with AccessCodeSettings component
  - Maintain existing settings sections (agent config, service numbers, etc.)
  - Mobile-responsive: stack sections vertically

- [ ] **T035** Update `src/router.js`
  - Change default route from `/inbox` to `/home` (or make `/` → `/home`)
  - Add route: `/home` → `pages/home.js`
  - Ensure all routes require authentication (except `/login`, `/signup`)
  - Update bottom nav active state to highlight home when on `/home`

---

## Phase 3.8: Integration Tests

**Prerequisites**: All implementation (T018-T035) complete, system deployed locally

- [ ] **T036** [P] Integration test: Text-based prompt configuration in `tests/integration/admin-homepage.test.js`
  - Corresponds to Quickstart Scenario 1
  - Login as test user
  - Navigate to `/home`
  - Send message: "Make my agent more friendly and casual"
  - Assert: agent responds with preview of changes
  - Send message: "Yes, apply the changes"
  - Assert: agent confirms success
  - Query database: verify `agent_configs.system_prompt` updated
  - Query database: verify `admin_action_logs` has record with action_type='update_system_prompt'

- [ ] **T037** [P] Integration test: Knowledge source addition in `tests/integration/knowledge-base-flow.test.js`
  - Corresponds to Quickstart Scenario 2
  - Login as test user
  - Send message to admin agent: "Add knowledge from https://example.com/faq"
  - Assert: agent responds with "I'll fetch that page..."
  - Wait for processing (poll until status='completed')
  - Assert: agent responds with "Added knowledge from [Title] (X chunks)"
  - Query database: verify `knowledge_sources` has new record
  - Query database: verify `knowledge_chunks` has chunks with embeddings
  - Test vector search: generate embedding, query for similar chunks, assert results

- [ ] **T038** [P] Integration test: Access code setup with SMS in `tests/integration/access-code-sms.test.js`
  - Corresponds to Quickstart Scenario 5
  - Login as test user
  - Navigate to `/settings`
  - Click "Change Access Code"
  - Enter new code: "1234"
  - Submit
  - Mock Postmark SMS API: capture confirmation code sent
  - Enter confirmation code
  - Assert: success message shown
  - Query database: verify `users.phone_admin_access_code` is hashed (bcrypt)
  - Verify old code doesn't work (hash doesn't match)
  - Verify new code does work (hash matches)

---

## Phase 3.9: E2E Tests (Playwright)

**Prerequisites**: Integration tests (T036-T038) passing

- [ ] **T039** [P] E2E test: Admin chat interface in `tests/e2e/admin-chat-interface.spec.js`
  - Full browser test (Chrome/Safari)
  - Login flow
  - Navigate to home page
  - Verify chat interface renders
  - Type message and send
  - Verify message appears in chat
  - Verify agent responds within 2 seconds
  - Test voice toggle (if supported browser):
    - Click mic button
    - Grant permission (if first time)
    - Verify listening state
    - Mock speech input (if possible) or skip
  - Mobile viewport test: verify responsive layout

- [ ] **T040** [P] E2E test: Settings KB management in `tests/e2e/settings-knowledge-access.spec.js`
  - Login flow
  - Navigate to settings
  - Scroll to "Knowledge Base" section
  - Click "Add Knowledge Source"
  - Enter URL and select sync period
  - Submit
  - Wait for "completed" status
  - Verify source appears in list
  - Click delete button
  - Confirm deletion
  - Verify source removed from list
  - Mobile viewport test: verify responsive layout

---

## Dependencies

**Database → Backend → Frontend → Integration → E2E**

1. **Phase 3.1** (T001-T012): Database setup BLOCKS everything
2. **Phase 3.2** (T013-T017): Contract tests in parallel, MUST complete before 3.3
3. **Phase 3.3** (T018-T024): Backend implementation (sequential per function, parallel across functions)
4. **Phase 3.4** (T025): Phone admin (depends on T009 users table update)
5. **Phase 3.5** (T026-T028): Service layer (parallel, depends on backend deployed)
6. **Phase 3.6** (T029-T032): Components (parallel, depends on services)
7. **Phase 3.7** (T033-T035): Pages/routing (sequential, depends on components)
8. **Phase 3.8** (T036-T038): Integration tests (parallel, depends on full implementation)
9. **Phase 3.9** (T039-T040): E2E tests (parallel, depends on integration tests passing)

**Specific Blocks**:
- T011 (apply migration) blocks T013-T017 (contract tests need schema)
- T013-T017 (contract tests) must FAIL before starting T018-T023
- T018-T023 must PASS contract tests before moving to T025
- T026-T028 (services) block T029-T032 (components)
- T029-T032 (components) block T033-T035 (pages)
- T033-T035 (pages) block T036-T038 (integration tests)
- T036-T038 (integration tests) block T039-T040 (E2E tests)

---

## Parallel Execution Examples

**Parallel Group 1: Database Tables (T002-T009)**
All table creation tasks are independent and can run simultaneously:
```bash
# Create all tables in migration file at once
# These are marked [P] because they're different CREATE TABLE statements
```

**Parallel Group 2: Contract Tests (T013-T017)**
```bash
# After T011 complete, run all contract tests together:
npm run test tests/contract/admin-agent-chat.test.js &
npm run test tests/contract/knowledge-source-add.test.js &
npm run test tests/contract/knowledge-source-list.test.js &
npm run test tests/contract/knowledge-source-delete.test.js &
npm run test tests/contract/access-code-update.test.js &
wait
# All should FAIL initially (no implementation yet)
```

**Parallel Group 3: Service Layer (T026-T028)**
```bash
# After backend deployed, create all service files together:
# - src/services/adminAgentService.js
# - src/services/knowledgeService.js
# - src/lib/voiceRecognition.js
# These are independent files
```

**Parallel Group 4: Components (T029-T032)**
```bash
# After services complete, create all components together:
# - src/components/VoiceToggle.js
# - src/components/AdminChatInterface.js
# - src/components/KnowledgeSourceManager.js
# - src/components/AccessCodeSettings.js
# These are independent files
```

**Parallel Group 5: Integration Tests (T036-T038)**
```bash
# After implementation complete, run all integration tests:
npm run test:integration tests/integration/admin-homepage.test.js &
npm run test:integration tests/integration/knowledge-base-flow.test.js &
npm run test:integration tests/integration/access-code-sms.test.js &
wait
```

**Parallel Group 6: E2E Tests (T039-T040)**
```bash
# After integration tests pass, run E2E tests:
npx playwright test tests/e2e/admin-chat-interface.spec.js &
npx playwright test tests/e2e/settings-knowledge-access.spec.js &
wait
```

---

## Validation Checklist

Before marking feature complete, verify:

- [x] All contracts have corresponding tests (T013-T017 → T018-T023)
- [x] All 7 entities from data-model.md have tables (T002-T008)
- [x] All Edge Functions implemented (6 functions: T018-T023)
- [x] All tests come before implementation (Phase 3.2 before 3.3)
- [x] Parallel tasks are truly independent (different files)
- [x] Each task specifies exact file path
- [x] No task modifies same file as another [P] task
- [x] All quickstart scenarios have integration tests (T036-T038 cover Scenarios 1, 2, 5)
- [x] Mobile-responsive verified (T039-T040 E2E tests include mobile viewport)
- [x] Constitution compliance:
  - [x] TDD enforced (tests before implementation)
  - [x] Module-level imports (enforced by pre-commit hook)
  - [x] Breaking change analysis (homepage replacement is intentional)
  - [x] Debugging infrastructure (state logging in admin_action_logs)
  - [x] Performance targets (lowest latency - tested in integration tests)

---

## Notes

- **TDD is NON-NEGOTIABLE**: Contract tests (T013-T017) MUST be written and failing before starting implementation (T018-T023)
- **Test before commit**: Run relevant tests after each task, verify they pass
- **Mobile-first**: All frontend tasks (T029-T035) must work on mobile screens
- **No vendor names**: All user-facing text must use "Pat AI assistant", not "OpenAI", "Retell", etc.
- **Security**: Access codes hashed with bcrypt, SMS codes expire in 5 minutes, rate limiting on auth attempts
- **Performance**: OpenAI streaming for low latency, pgvector indexed for fast vector search
- **Deployment**: After T040 complete, run quickstart.md validation (Scenarios 1-6), then deploy to production

---

**Total Estimated Time**: 3-4 days with parallel execution, 6-7 days sequential

**Ready to execute**: Run `/implement` or execute tasks manually starting with T001
