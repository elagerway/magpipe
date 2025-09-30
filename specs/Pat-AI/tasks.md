# Tasks: Pat AI Call & SMS Agent PWA

**Input**: Design documents from `/Users/erik/Documents/GitHub/Snapsonic/pat/specs/Pat-AI/`
**Prerequisites**: plan.md (✓), research.md (✓), data-model.md (✓), contracts/ (✓), quickstart.md (✓)

## Execution Flow (main)
```
1. Load plan.md from feature directory
   → Extract: tech stack, libraries, structure
2. Load optional design documents:
   → data-model.md: Extract entities → model tasks
   → contracts/: Each file → contract test task
   → research.md: Extract decisions → setup tasks
3. Generate tasks by category:
   → Setup: project init, dependencies, linting
   → Tests: contract tests, integration tests
   → Core: models, services, UI components
   → Integration: DB, webhooks, external services
   → Polish: unit tests, performance, docs
4. Apply task rules:
   → Different files = mark [P] for parallel
   → Same file = sequential (no [P])
   → Tests before implementation (TDD)
5. Number tasks sequentially (T001, T002...)
6. Generate dependency graph
7. Create parallel execution examples
8. Validate task completeness
9. Return: SUCCESS (tasks ready for execution)
```

## Format: `[ID] [P?] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- Include exact file paths in descriptions

## Path Conventions
- PWA structure: `public/` for static assets, `src/` for code, `tests/` for tests
- Supabase backend: `supabase/migrations/`, `supabase/functions/`
- Tests: `tests/contract/`, `tests/integration/`, `tests/unit/`

---

## Phase 3.1: Project Setup & Configuration

- [x] **T001** [P] Initialize project structure with public/, src/, tests/, supabase/ directories
- [x] **T002** [P] Create package.json with scripts for dev, build, test, and deploy
- [x] **T003** [P] Install core dependencies: @supabase/supabase-js, vitest, playwright
- [x] **T004** [P] Configure ESLint for JavaScript ES6+ with recommended rules in .eslintrc.json
- [x] **T005** [P] Configure Prettier for code formatting in .prettierrc
- [x] **T006** [P] Create .gitignore for node_modules, .env, dist/, coverage/
- [x] **T007** [P] Initialize Supabase project and create .env.example with required variables

## Phase 3.2: Database Schema (Supabase Migrations)

- [x] **T008** Create supabase/migrations/001_users_table.sql: users table with phone_verified, phone_number, twilio_number fields + RLS policies
- [x] **T009** Create supabase/migrations/002_contacts_table.sql: contacts table with user_id FK, phone_number unique constraint, is_whitelisted + indexes on (user_id, phone_number) + RLS policies
- [x] **T010** Create supabase/migrations/003_agent_configs_table.sql: agent_configs table with user_id FK (unique), voice, greeting_template, vetting_criteria (jsonb), transfer_preferences (jsonb) + RLS policies
- [x] **T011** Create supabase/migrations/004_call_records_table.sql: call_records table with user_id FK, contact_id FK (nullable), caller_number, disposition enum, recording_url, transcript + indexes on (user_id, started_at DESC) + RLS policies
- [x] **T012** Create supabase/migrations/005_sms_messages_table.sql: sms_messages table with user_id FK, contact_id FK (nullable), sender_number, recipient_number, direction, content, status + indexes on (user_id, sent_at DESC), (contact_id, sent_at DESC) + RLS policies
- [x] **T013** Create supabase/migrations/006_conversation_contexts_table.sql: Enable pgvector extension, create conversation_contexts table with contact_id FK (unique), summary, key_topics, preferences (jsonb), embedding vector(1536), interaction_count + vector index (IVFFlat or HNSW) + RLS policies
- [x] **T014** Create supabase/migrations/007_updated_at_triggers.sql: Add updated_at triggers for all tables that auto-update timestamp on row modification

## Phase 3.3: Contract Tests (TDD - MUST FAIL FIRST) ⚠️

**CRITICAL: Write these tests FIRST. Run them. Verify they FAIL. Then proceed to implementation.**

### Supabase Auth Contract Tests
- [x] **T015** [P] Contract test: tests/contract/supabase-auth-signup.test.js - Test POST /auth/v1/signup with email, password, name; assert 200 response with user object; assert confirmation email sent
- [x] **T016** [P] Contract test: tests/contract/supabase-auth-login.test.js - Test POST /auth/v1/token with email, password; assert 200 with access_token, refresh_token, user; test 401 for invalid credentials
- [x] **T017** [P] Contract test: tests/contract/supabase-auth-verify.test.js - Test POST /auth/v1/verify with type=signup, token (6 digits), email; assert 200 success; test 400 for invalid token

### Supabase Data API Contract Tests
- [x] **T018** [P] Contract test: tests/contract/supabase-contacts-create.test.js - Test POST /rest/v1/contacts with name, phone_number; assert 201 with contact object; test 409 for duplicate phone
- [x] **T019** [P] Contract test: tests/contract/supabase-contacts-list.test.js - Test GET /rest/v1/contacts with order, limit, offset params; assert 200 with array of contacts; verify pagination
- [ ] **T020** [P] Contract test: tests/contract/supabase-call-records.test.js - Test POST /rest/v1/call_records with required fields; test GET with filtering by contact_id; assert correct schema
- [ ] **T021** [P] Contract test: tests/contract/supabase-sms-messages.test.js - Test POST /rest/v1/sms_messages; test GET with ordering by sent_at DESC; verify RLS isolation
- [ ] **T022** [P] Contract test: tests/contract/supabase-agent-config.test.js - Test POST /rest/v1/agent_configs with vetting_criteria, transfer_preferences JSONs; test PATCH for updates

### Telephony Webhook Contract Tests
- [ ] **T023** [P] Contract test: tests/contract/signalwire-inbound-call.test.js - Test webhook receives CallSid, From, To, CallStatus; assert TwiML response with <Connect><Stream> to Retell.ai
- [ ] **T024** [P] Contract test: tests/contract/signalwire-call-status.test.js - Test webhook receives CallStatus=completed with CallDuration, RecordingUrl; verify call record created
- [ ] **T025** [P] Contract test: tests/contract/signalwire-inbound-sms.test.js - Test webhook receives MessageSid, From, To, Body; assert TwiML <Message> response generated
- [ ] **T026** [P] Contract test: tests/contract/signalwire-verification.test.js - Test /webhooks/signalwire/verify-number sends SMS; test /verify-code validates 6-digit code
- [ ] **T027** [P] Contract test: tests/contract/retell-analysis.test.js - Test webhook receives call_id, transcript array, disposition, call_analysis; verify transcript stored in DB

## Phase 3.4: Data Models (Access Layer)

- [ ] **T028** [P] Create src/data/supabase-client.js: Initialize Supabase client with env variables, export singleton instance, handle auth state changes
- [ ] **T029** [P] Create src/data/user-model.js: CRUD functions for users table - getUser(id), updateUser(id, data), updatePhoneNumber(id, phone), setPhoneVerified(id, verified)
- [ ] **T030** [P] Create src/data/contact-model.js: CRUD for contacts - createContact(userId, data), listContacts(userId, pagination), updateContact(id, data), deleteContact(id), findByPhoneNumber(userId, phone)
- [ ] **T031** [P] Create src/data/call-record-model.js: CRUD for call_records - createCallRecord(data), getCallRecord(id), listCallRecords(userId, filters, pagination), updateTranscript(id, transcript)
- [ ] **T032** [P] Create src/data/sms-message-model.js: CRUD for sms_messages - createSmsMessage(data), listSmsMessages(userId, filters, pagination), getConversationThread(userId, contactId)
- [ ] **T033** [P] Create src/data/agent-config-model.js: CRUD for agent_configs - createAgentConfig(userId, data), getAgentConfig(userId), updateAgentConfig(userId, data)
- [ ] **T034** [P] Create src/data/conversation-context.js: Functions for conversation_contexts - createContext(contactId, summary), updateContext(contactId, data), generateEmbedding(text) using OpenAI, searchSimilarContexts(userId, query, limit) using pgvector

## Phase 3.5: Integration Tests (TDD - BEFORE FEATURE IMPLEMENTATION) ⚠️

**CRITICAL: Write these tests BEFORE implementing the features they test.**

- [ ] **T035** Integration test: tests/integration/registration-flow.test.js - Full flow: navigate to signup, enter email/password/name, submit, assert confirmation email sent, verify redirect
- [ ] **T036** Integration test: tests/integration/email-verification.test.js - Enter 6-digit code, submit, assert success message, verify redirect to phone verification
- [ ] **T037** [P] Integration test: tests/integration/phone-verification.test.js - Enter phone number, request SMS, enter code, verify success, assert SignalWire number assigned
- [ ] **T038** [P] Integration test: tests/integration/agent-configuration.test.js - Test text and voice configuration modes, save settings, verify stored in agent_configs table
- [ ] **T039** [P] Integration test: tests/integration/contact-import.test.js - Test Contact Picker API (if supported), test manual entry, verify contacts saved with correct user_id
- [ ] **T040** Integration test: tests/integration/inbound-call-whitelisted.test.js - Simulate SignalWire webhook with whitelisted caller, verify Retell.ai called with context, test call record created
- [ ] **T041** Integration test: tests/integration/inbound-call-unknown.test.js - Simulate webhook with unknown caller, verify screening logic triggered, test disposition=screened_out
- [ ] **T042** [P] Integration test: tests/integration/inbound-sms-whitelisted.test.js - Simulate SMS webhook from whitelisted contact, verify AI response uses conversation context, test SMS record created
- [ ] **T043** [P] Integration test: tests/integration/inbound-sms-unknown.test.js - Simulate SMS from unknown, verify vetting logic applied, test appropriate response generated
- [ ] **T044** [P] Integration test: tests/integration/offline-mode.test.js - Load app while online, disconnect, verify history accessible, verify sync on reconnect

## Phase 3.6: Feature Implementation

### Authentication & Onboarding (Sequential - shared routing logic)
- [ ] **T045** Create public/index.html: Landing page with "Get Started" button, links to signup/login, semantic HTML5 structure, responsive meta tags
- [ ] **T046** Create src/ui/router.js: Client-side router using History API, route definitions for /, /signup, /login, /verify-email, /verify-phone, /configure, /dashboard, /contacts, /history
- [ ] **T047** Create src/auth/register.js: Registration form (email/password/name), form validation, call Supabase signUp, display success/error messages, redirect to /verify-email
- [ ] **T048** Create src/auth/sso-handlers.js: OAuth buttons for Google, Github, Facebook, LinkedIn using Supabase signInWithOAuth, handle callback, redirect logic
- [ ] **T049** Create src/auth/login.js: Login form, call Supabase signInWithPassword, handle errors (invalid credentials, unverified email), redirect to dashboard or phone verification

### Phone Verification (Mix of parallel and sequential)
- [ ] **T050** Create supabase/functions/verify-phone-send.ts: Edge function that accepts phone_number, generates 6-digit code, stores in DB with 10min expiration, sends SMS via SignalWire API
- [ ] **T051** Create supabase/functions/verify-phone-check.ts: Edge function that accepts phone_number + code, validates against stored code, updates user.phone_verified=true, assigns SignalWire number
- [ ] **T052** Create src/phone/verification.js: Phone input (E.164 format), "Send Code" button calls verify-phone-send, code input field, "Verify" button calls verify-phone-check, display assigned number, redirect to /configure
- [ ] **T053** [P] Create src/phone/contacts.js: Contact import UI - detect Contact Picker API support, fallback to manual entry form, batch create contacts via contact-model, display success/error messages

### Agent Configuration (Parallel - independent interfaces)
- [ ] **T054** [P] Create src/agent/config.js: Agent settings form - voice dropdown (kate, etc.), greeting template textarea, vetting criteria checkboxes/inputs, transfer preferences, response style radio buttons, save to agent_configs table
- [ ] **T055** [P] Create src/agent/text-interface.js: Text-based configuration - textarea for natural language input, submit to GPT-4 for parsing, extract vetting/transfer preferences, pre-fill config form
- [ ] **T056** [P] Create src/agent/voice-interface.js: Voice configuration using WebRTC - microphone access, stream audio to speech-to-text, display transcription, parse with GPT-4, fill config form

### Call Handling Webhooks (Sequential - shared Retell.ai integration)
- [ ] **T057** Create supabase/functions/webhook-inbound-call.ts: Receive SignalWire webhook, lookup user by To number, lookup contact by From number, retrieve agent_config, generate TwiML <Connect><Stream> to Retell.ai with metadata (user_id, contact_id, config), create initial call_record
- [ ] **T058** Create supabase/functions/webhook-call-status.ts: Receive call status updates, update call_record with duration and final disposition, if RecordingUrl provided, download from SignalWire and upload to Supabase Storage
- [ ] **T059** Create supabase/functions/webhook-retell-analysis.ts: Receive transcript and analysis from Retell.ai, update call_record with full transcript, update conversation_contexts with summary and generate embedding

### Call Handling UI (Parallel - different views)
- [ ] **T060** [P] Create src/call-handling/inbound-call.js: Subscribe to call_records realtime updates, display toast notification for new calls, show caller name (if contact) or number, disposition status
- [ ] **T061** [P] Create src/call-handling/screening.js: UI to view screening notes for unknown callers, option to add to contacts, mark as spam, block number
- [ ] **T062** [P] Create src/call-handling/transfer.js: Display transfer status, show when call is connecting to user, end call button

### SMS Handling Webhooks & UI (Mix)
- [ ] **T063** Create supabase/functions/webhook-inbound-sms.ts: Receive SignalWire SMS webhook, lookup user/contact, retrieve conversation context via searchSimilarContexts, generate AI response via GPT-4 with context, send reply SMS via SignalWire, create sms_message records, update conversation_context
- [ ] **T064** [P] Create src/sms/inbound-sms.js: Subscribe to sms_messages realtime, display toast for new SMS, link to conversation view
- [ ] **T065** [P] Create src/sms/response.js: Manual reply interface - textarea, send button, call SignalWire to send SMS, create outbound sms_message record
- [ ] **T066** [P] Create src/sms/conversation-view.js: Threaded message view grouped by contact, display inbound/outbound with timestamps, auto-scroll to latest, load more pagination

### History & Playback (Parallel - independent views)
- [ ] **T067** [P] Create src/history/call-history.js: List view with table/cards showing date, contact, duration, disposition, search input, filters (date range, disposition), pagination (50 per page), click to detail view
- [ ] **T068** [P] Create src/history/sms-history.js: List view of SMS conversations grouped by contact, show last message preview, unread count, click to conversation-view
- [ ] **T069** [P] Create src/history/playback.js: Call detail page - display call info, audio player with controls (play/pause, seek, playback speed), transcript display with timestamps, highlight transcript as audio plays, download recording button
- [ ] **T070** [P] Create src/history/search.js: Global search across calls and SMS, search by contact name, phone number, transcript keywords, date filters, results list with links
- [ ] **T071** [P] Create src/history/export.js: Export functionality - select date range, choose format (JSON, CSV), download call/SMS data with transcripts

### UI Foundation & Components (Parallel - reusable elements)
- [ ] **T072** [P] Create src/ui/components.js: Web components library - <pat-button>, <pat-input>, <pat-toast>, <pat-modal>, <pat-loading-spinner>, <pat-icon>, styled with CSS, accessible (ARIA labels)
- [ ] **T073** [P] Create src/ui/state.js: Global state management - user session, auth state, current route, toast queue, use localStorage for persistence, pub/sub pattern for reactivity
- [ ] **T074** [P] Create public/manifest.json: PWA manifest with name, short_name, description, icons (192x192, 512x512), start_url, display=standalone, theme_color, background_color
- [ ] **T075** [P] Create public/service-worker.js: Service worker for offline support - cache static assets (HTML, CSS, JS), cache API responses for history, implement cache-first strategy for assets, network-first for API, background sync for offline actions

### Utilities (Parallel - independent helper functions)
- [ ] **T076** [P] Create src/utils/validation.js + tests/unit/validation.test.js: Phone number validation (E.164), email validation, password strength check, sanitize inputs - with Vitest unit tests
- [ ] **T077** [P] Create src/utils/formatting.js + tests/unit/formatting.test.js: Format phone numbers for display, format timestamps (relative and absolute), format durations (seconds to MM:SS), truncate long text - with unit tests
- [ ] **T078** [P] Create src/utils/error-handler.js + tests/unit/error-handler.test.js: Centralized error handler, log to console in dev, send to Sentry in prod, user-friendly error messages, retry logic for network errors - with unit tests

### Static Assets (Parallel)
- [ ] **T079** [P] Create public/assets/: App icons in multiple sizes (16x16, 32x32, 192x192, 512x512), favicon.ico, apple-touch-icon.png, generate from single SVG source
- [ ] **T080** [P] Create public/assets/styles.css: Global CSS with CSS variables for theming, typography, spacing scale, mobile-first responsive grid, dark mode support (@media prefers-color-scheme)
- [ ] **T081** [P] Create public/assets/images/: Placeholder images for empty states (no calls, no contacts, no messages), loading illustrations, error state illustrations

## Phase 3.7: Edge Function Deployment & Configuration

- [ ] **T082** Deploy all Supabase Edge Functions: supabase functions deploy --project-ref <ref> for each function (verify-phone-send, verify-phone-check, webhook-inbound-call, webhook-call-status, webhook-retell-analysis, webhook-inbound-sms)
- [ ] **T083** Configure SignalWire webhooks: Set inbound call webhook to /functions/v1/webhook-inbound-call, status callback to /webhook-call-status, SMS webhook to /webhook-inbound-sms
- [ ] **T084** Configure Retell.ai webhooks: Set call analysis webhook to /functions/v1/webhook-retell-analysis, configure agent with SignalWire Stream URL
- [ ] **T085** End-to-end webhook test: Make test call to SignalWire number, verify webhook chain (SignalWire → Supabase → Retell.ai → Supabase), check call_record created, transcript stored

## Phase 3.8: Performance & Polish

- [ ] **T086** [P] Implement Service Worker caching: Define caching strategy for each route, cache API responses with TTL, implement background sync for failed requests, test offline functionality
- [ ] **T087** [P] Add loading states: Skeleton screens for list views, loading spinners for forms, progress indicators for uploads, optimistic UI updates for better perceived performance
- [ ] **T088** [P] Implement error boundaries: Try-catch wrappers for async operations, fallback UI for errors, retry buttons, clear error messages with suggested actions
- [ ] **T089** Run Lighthouse audit: Test performance, accessibility, best practices, SEO scores; aim for >90 in all categories; address issues found
- [ ] **T090** Bundle size optimization: Code splitting by route, lazy load non-critical components, tree-shake unused code, minify and compress, verify <50MB total
- [ ] **T091** [P] Accessibility audit: Test keyboard navigation, screen reader compatibility (test with VoiceOver/NVDA), color contrast ratios (WCAG AA), ARIA labels on interactive elements
- [ ] **T092** [P] Cross-browser testing: Test on Chrome 90+, Safari 14+, Firefox 88+ on desktop; test on iOS Safari, Android Chrome; fix browser-specific issues
- [ ] **T093** [P] Mobile device testing: Test on iOS (iPhone 12+, iPad), Android (Pixel, Samsung), verify touch targets (min 44x44px), test in portrait and landscape, verify PWA install flow

---

## Dependencies

**Sequential Dependencies** (must complete in order):
- T001-T007 (Setup) → T008-T014 (Migrations) → T028 (Supabase Client) → T029-T034 (Data Models)
- T045 (Landing) → T046 (Router) → T047-T049 (Auth)
- T047 (Register) → T052 (Phone Verification)
- T050-T051 (Verify Edge Functions) → T052 (Phone Verification UI)
- T028 (Supabase Client) → T057-T059 (Webhook Edge Functions)
- T015-T027 (Contract Tests) → T035-T044 (Integration Tests) → T045+ (Implementation)

**Parallel Opportunities** (can run simultaneously):
- All setup tasks T001-T007 can run in parallel
- All contract tests T015-T027 can run in parallel
- All data models T029-T034 can run in parallel (after T028)
- Most integration tests T037-T044 can run in parallel
- UI components T060-T062, T064-T071 can run in parallel (after data models)
- Utilities T076-T081 can run in parallel
- Polish tasks T086-T093 mostly parallel

**Blocking Dependencies**:
- T028 (Supabase Client) blocks all data models and webhooks
- T046 (Router) blocks all page components
- T057-T059 (Webhooks) block T082-T085 (Deployment)
- All tests must be written and failing before implementation code

## Parallel Execution Examples

### Batch 1: Setup (all parallel)
```
# Run these 7 tasks simultaneously:
Task: "Initialize project structure with public/, src/, tests/, supabase/ directories"
Task: "Create package.json with scripts for dev, build, test, and deploy"
Task: "Install core dependencies: @supabase/supabase-js, vitest, playwright"
Task: "Configure ESLint for JavaScript ES6+ with recommended rules"
Task: "Configure Prettier for code formatting"
Task: "Create .gitignore for node_modules, .env, dist/, coverage/"
Task: "Initialize Supabase project and create .env.example"
```

### Batch 2: Contract Tests (11 tasks parallel)
```
# After migrations complete, run all contract tests in parallel:
Task: "Contract test: tests/contract/supabase-auth-signup.test.js"
Task: "Contract test: tests/contract/supabase-auth-login.test.js"
Task: "Contract test: tests/contract/supabase-auth-verify.test.js"
Task: "Contract test: tests/contract/supabase-contacts-create.test.js"
Task: "Contract test: tests/contract/supabase-contacts-list.test.js"
Task: "Contract test: tests/contract/supabase-call-records.test.js"
Task: "Contract test: tests/contract/supabase-sms-messages.test.js"
Task: "Contract test: tests/contract/supabase-agent-config.test.js"
Task: "Contract test: tests/contract/signalwire-inbound-call.test.js"
Task: "Contract test: tests/contract/signalwire-call-status.test.js"
Task: "Contract test: tests/contract/signalwire-inbound-sms.test.js"
```

### Batch 3: Data Models (6 tasks parallel)
```
# After Supabase client is ready:
Task: "Create src/data/user-model.js with CRUD functions"
Task: "Create src/data/contact-model.js with CRUD functions"
Task: "Create src/data/call-record-model.js with CRUD functions"
Task: "Create src/data/sms-message-model.js with CRUD functions"
Task: "Create src/data/agent-config-model.js with CRUD functions"
Task: "Create src/data/conversation-context.js with vector search"
```

### Batch 4: UI Components & Utilities (8 tasks parallel)
```
# After data models complete:
Task: "Create src/ui/components.js with reusable web components"
Task: "Create src/utils/validation.js + unit tests"
Task: "Create src/utils/formatting.js + unit tests"
Task: "Create src/utils/error-handler.js + unit tests"
Task: "Create public/assets/ with app icons"
Task: "Create public/assets/styles.css with responsive grid"
Task: "Create public/manifest.json for PWA"
Task: "Create public/service-worker.js for offline support"
```

## Notes

- **TDD Enforcement**: All tests (T015-T044) MUST be written before implementation (T045+)
- **Verify Tests Fail**: Run test suite after writing contract and integration tests to confirm RED phase
- **[P] Marking**: Tasks marked [P] are in different files with no shared dependencies, safe for parallel execution
- **Commit Strategy**: Commit after each task completion for granular history
- **Manual Testing**: Use quickstart.md scenarios to manually validate each feature after implementation
- **Performance Targets**: <500ms AI response, <3 rings answer time, <2s SMS, <50MB bundle
- **Coverage Goal**: 80%+ overall, 100% for auth and telephony critical paths

---

**Total Tasks**: 93
**Estimated Parallel Opportunities**: 45+ tasks can run in parallel at various stages
**Critical Path Length**: ~25-30 sequential tasks (Setup → Migrations → Client → Auth → Phone → Agent → Calls → Deploy → Polish)