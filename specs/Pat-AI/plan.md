
# Implementation Plan: Pat AI Call & SMS Agent PWA

**Branch**: `Pat-AI` | **Date**: 2025-09-29 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/Users/erik/Documents/GitHub/Snapsonic/pat/specs/Pat-AI/spec.md`

## Execution Flow (/plan command scope)
```
1. Load feature spec from Input path
   → If not found: ERROR "No feature spec at {path}"
2. Fill Technical Context (scan for NEEDS CLARIFICATION)
   → Detect Project Type from file system structure or context (web=frontend+backend, mobile=app+api)
   → Set Structure Decision based on project type
3. Fill the Constitution Check section based on the content of the constitution document.
4. Evaluate Constitution Check section below
   → If violations exist: Document in Complexity Tracking
   → If no justification possible: ERROR "Simplify approach first"
   → Update Progress Tracking: Initial Constitution Check
5. Execute Phase 0 → research.md
   → If NEEDS CLARIFICATION remain: ERROR "Resolve unknowns"
6. Execute Phase 1 → contracts, data-model.md, quickstart.md, agent-specific template file (e.g., `CLAUDE.md` for Claude Code, `.github/copilot-instructions.md` for GitHub Copilot, `GEMINI.md` for Gemini CLI, `QWEN.md` for Qwen Code or `AGENTS.md` for opencode).
7. Re-evaluate Constitution Check section
   → If new violations: Refactor design, return to Phase 1
   → Update Progress Tracking: Post-Design Constitution Check
8. Plan Phase 2 → Describe task generation approach (DO NOT create tasks.md)
9. STOP - Ready for /tasks command
```

**IMPORTANT**: The /plan command STOPS at step 7. Phases 2-4 are executed by other commands:
- Phase 2: /tasks command creates tasks.md
- Phase 3-4: Implementation execution (manual or via tools)

## Summary
Building a Progressive Web Application that provides an AI-powered phone and SMS assistant named Pat. The system enables users to delegate call and message handling to an AI agent that screens unknown contacts, engages trusted contacts with conversational context, and only transfers calls when appropriate. The PWA will be built with vanilla HTML/CSS/JavaScript to minimize dependencies, with Supabase providing backend data persistence for user accounts, contacts, call recordings, transcripts, and conversation history.

## Technical Context
**Language/Version**: JavaScript ES6+, HTML5, CSS3 (vanilla, minimal framework usage per user requirement)
**Primary Dependencies**: Supabase JS Client (auth, database, realtime), Service Worker API (PWA), Web Audio API (voice), WebRTC (real-time voice communication), Signalwire (custom telephony integration for calls/SMS - to be researched), Retellai.com (AI agent)
**Storage**: Supabase (PostgreSQL backend) for users, contacts, call records, transcripts, conversation context, agent config
**Testing**: Web Test Runner or Vitest for unit tests, Playwright for integration/E2E tests
**Target Platform**: Modern web browsers (Chrome 90+, Safari 14+, Firefox 88+), mobile-optimized, installable PWA
**Project Type**: Web (PWA) - single frontend application with Supabase backend
**Performance Goals**: <500ms AI response latency during calls, <3 rings before answering inbound calls, <2s SMS response time, 60fps UI animations
**Constraints**: Minimal dependencies (vanilla JS preferred), offline-capable for viewing history, <50MB initial bundle size, mobile-first responsive design
**Scale/Scope**: MVP targeting 100-1000 users, ~10-15 views/pages, support for unlimited call/SMS history per user with pagination

## Constitution Check
*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### I. Code Quality First
- ✅ **PASS**: Vanilla JS/HTML/CSS enables clear, readable code without framework abstractions
- ✅ **PASS**: Minimal dependencies reduce complexity and maintenance burden
- ✅ **PASS**: Plan includes linting setup and code style enforcement

### II. Test-Driven Development (NON-NEGOTIABLE)
- ✅ **PASS**: Phase 1 will generate contract tests before implementation
- ✅ **PASS**: Integration tests planned for all user flows
- ✅ **PASS**: Tests will be written to fail first, then implementation follows
- ✅ **PASS**: 80%+ coverage target with 100% for auth and telephony critical paths

### III. User Experience Consistency
- ✅ **PASS**: Error messages will be actionable (spec requires clear user feedback)
- ✅ **PASS**: PWA provides consistent mobile-first experience
- ✅ **PASS**: Quickstart guide will demonstrate end-to-end flows
- ⚠️ **NEEDS ATTENTION**: Voice/UI design patterns to be established in Phase 1

### IV. Performance by Design
- ✅ **PASS**: Specific latency targets documented (<500ms AI response, <3 rings answer time, <2s SMS)
- ✅ **PASS**: Performance tests planned for call handling and response times
- ✅ **PASS**: Bundle size constraint (<50MB) enforces performance awareness
- ✅ **PASS**: Graceful degradation planned (offline mode for history viewing)

### Quality Standards Check
- ✅ **PASS**: Contract tests required for Supabase and telephony integrations
- ✅ **PASS**: Integration tests required for external auth providers (SSO)
- ✅ **PASS**: Quickstart documentation planned
- ✅ **PASS**: Public API contracts will be documented with examples

### Initial Assessment: **PASS** - Ready for Phase 0

---

### Post-Design Re-evaluation (After Phase 1)

#### I. Code Quality First
- ✅ **PASS**: Data model clearly defined with validation rules and relationships
- ✅ **PASS**: API contracts documented in OpenAPI format for clarity
- ✅ **PASS**: Structure promotes separation of concerns (auth/, phone/, agent/, call-handling/, data/, ui/)
- ✅ **PASS**: No excessive abstraction - vanilla JS module pattern is straightforward

#### II. Test-Driven Development
- ✅ **PASS**: Contract tests defined for all external APIs (auth-api.yaml, supabase-data-api.yaml, telephony-webhooks.yaml)
- ✅ **PASS**: Quickstart guide provides integration test scenarios with expected outcomes
- ✅ **PASS**: Test structure mirrors implementation structure (contract/, integration/, unit/)
- ✅ **PASS**: Critical paths identified (auth flow, call handling, SMS) for 100% coverage

#### III. User Experience Consistency
- ✅ **PASS**: Quickstart demonstrates consistent flows across all features
- ✅ **PASS**: Error handling patterns documented (offline mode messaging, verification failures)
- ✅ **PASS**: UI patterns established (mobile-first, responsive, native web components)
- ✅ **PASS**: Voice interaction design specified (greeting templates, response styles)

#### IV. Performance by Design
- ✅ **PASS**: Database indexes specified for performance-critical queries
- ✅ **PASS**: Vector search optimization planned (pgvector with IVFFlat/HNSW)
- ✅ **PASS**: Pagination strategy for history views (50 items default)
- ✅ **PASS**: Caching strategy (Service Worker for offline, Supabase Realtime for updates)

#### Quality Standards Verification
- ✅ **PASS**: All entities have RLS policies for security
- ✅ **PASS**: API contracts complete with schemas, validation, error responses
- ✅ **PASS**: Quickstart covers all acceptance scenarios from spec
- ✅ **PASS**: No complexity violations - architecture is appropriate for requirements

### Final Assessment: **PASS** - Ready for Task Generation

## Project Structure

### Documentation (this feature)
```
specs/Pat-AI/
├── plan.md              # This file (/plan command output)
├── research.md          # Phase 0 output (/plan command)
├── data-model.md        # Phase 1 output (/plan command)
├── quickstart.md        # Phase 1 output (/plan command)
├── contracts/           # Phase 1 output (/plan command)
└── tasks.md             # Phase 2 output (/tasks command - NOT created by /plan)
```

### Source Code (repository root)
```
public/
├── index.html           # Main entry point
├── manifest.json        # PWA manifest
├── service-worker.js    # PWA offline support
├── icons/               # App icons for install
└── assets/              # Images, fonts, static resources

src/
├── auth/
│   ├── login.js         # Login UI and logic
│   ├── register.js      # Registration flow
│   └── sso-handlers.js  # Google, Github, Facebook, LinkedIn integrations
├── phone/
│   ├── verification.js  # Phone number verification flow
│   └── contacts.js      # Contact list management
├── agent/
│   ├── config.js        # Pat configuration interface
│   ├── voice-interface.js  # WebRTC voice interaction
│   └── text-interface.js   # Text-based configuration
├── call-handling/
│   ├── inbound-call.js  # Call answering logic
│   ├── screening.js     # Unknown caller vetting
│   └── transfer.js      # Call transfer to user
├── sms/
│   ├── inbound-sms.js   # SMS receiving and handling
│   └── response.js      # AI-generated SMS responses
├── history/
│   ├── call-history.js  # Call records viewer
│   ├── sms-history.js   # SMS records viewer
│   └── playback.js      # Audio playback, transcript display
├── data/
│   ├── supabase-client.js  # Supabase connection config
│   ├── user-model.js       # User CRUD operations
│   ├── contact-model.js    # Contact operations
│   ├── call-record-model.js # Call record operations
│   └── conversation-context.js # Context retrieval/storage
├── ui/
│   ├── components.js    # Reusable UI components
│   ├── router.js        # Client-side routing
│   └── state.js         # Application state management
└── utils/
    ├── validation.js    # Input validation helpers
    ├── formatting.js    # Display formatting
    └── error-handler.js # Centralized error handling

tests/
├── contract/
│   ├── supabase-auth.test.js
│   ├── supabase-data.test.js
│   └── telephony-api.test.js
├── integration/
│   ├── registration-flow.test.js
│   ├── phone-verification.test.js
│   ├── call-handling.test.js
│   └── sms-handling.test.js
└── unit/
    ├── validation.test.js
    ├── models.test.js
    └── ui-components.test.js

supabase/
├── migrations/          # Database schema versions
├── functions/           # Edge functions for telephony webhooks
└── config.toml          # Supabase local config
```

**Structure Decision**: PWA architecture with vanilla JavaScript modules. The `public/` directory contains static assets and PWA configuration. The `src/` directory is organized by feature domain (auth, phone, agent, calls, SMS, history, data access, UI, utilities). The `tests/` directory mirrors the TDD requirement with contract tests for external services, integration tests for user flows, and unit tests for business logic. Supabase backend is configured in the `supabase/` directory with migrations and edge functions for telephony webhook handling.

## Phase 0: Outline & Research
1. **Extract unknowns from Technical Context** above:
   - For each NEEDS CLARIFICATION → research task
   - For each dependency → best practices task
   - For each integration → patterns task

2. **Generate and dispatch research agents**:
   ```
   For each unknown in Technical Context:
     Task: "Research {unknown} for {feature context}"
   For each technology choice:
     Task: "Find best practices for {tech} in {domain}"
   ```

3. **Consolidate findings** in `research.md` using format:
   - Decision: [what was chosen]
   - Rationale: [why chosen]
   - Alternatives considered: [what else evaluated]

**Output**: research.md with all NEEDS CLARIFICATION resolved

## Phase 1: Design & Contracts
*Prerequisites: research.md complete*

1. **Extract entities from feature spec** → `data-model.md`:
   - Entity name, fields, relationships
   - Validation rules from requirements
   - State transitions if applicable

2. **Generate API contracts** from functional requirements:
   - For each user action → endpoint
   - Use standard REST/GraphQL patterns
   - Output OpenAPI/GraphQL schema to `/contracts/`

3. **Generate contract tests** from contracts:
   - One test file per endpoint
   - Assert request/response schemas
   - Tests must fail (no implementation yet)

4. **Extract test scenarios** from user stories:
   - Each story → integration test scenario
   - Quickstart test = story validation steps

5. **Update agent file incrementally** (O(1) operation):
   - Run `.specify/scripts/bash/update-agent-context.sh claude`
     **IMPORTANT**: Execute it exactly as specified above. Do not add or remove any arguments.
   - If exists: Add only NEW tech from current plan
   - Preserve manual additions between markers
   - Update recent changes (keep last 3)
   - Keep under 150 lines for token efficiency
   - Output to repository root

**Output**: data-model.md, /contracts/*, failing tests, quickstart.md, agent-specific file

## Phase 2: Task Planning Approach
*This section describes what the /tasks command will do - DO NOT execute during /plan*

**Task Generation Strategy**:
The /tasks command will generate tasks from the Phase 1 design artifacts following these rules:

1. **Setup Tasks** (5-7 tasks):
   - Initialize project structure (public/, src/, tests/, supabase/)
   - Configure Supabase project and environment variables
   - Set up PWA manifest, service worker skeleton
   - Install minimal dependencies (Supabase JS client, test runners)
   - Configure linting (ESLint) and formatting (Prettier)
   - Create package.json with build scripts

2. **Database & Schema Tasks** (6-8 tasks):
   - From `data-model.md`: Create migration for each entity group:
     * Migration 001: users table + RLS
     * Migration 002: contacts table + indexes + RLS
     * Migration 003: agent_configs table + RLS
     * Migration 004: call_records table + indexes + RLS
     * Migration 005: sms_messages table + indexes + RLS
     * Migration 006: conversation_contexts table + pgvector + RLS
   - Each migration task is [P] (can run in parallel during development)

3. **Contract Test Tasks** (9-12 tasks) - **MUST BE WRITTEN FIRST**:
   - From `contracts/auth-api.yaml`:
     * tests/contract/supabase-auth-signup.test.js [P]
     * tests/contract/supabase-auth-login.test.js [P]
     * tests/contract/supabase-auth-verify.test.js [P]
   - From `contracts/supabase-data-api.yaml`:
     * tests/contract/supabase-contacts.test.js [P]
     * tests/contract/supabase-call-records.test.js [P]
     * tests/contract/supabase-sms-messages.test.js [P]
     * tests/contract/supabase-agent-config.test.js [P]
   - From `contracts/telephony-webhooks.yaml`:
     * tests/contract/signalwire-inbound-call.test.js [P]
     * tests/contract/signalwire-inbound-sms.test.js [P]
     * tests/contract/signalwire-verification.test.js [P]
     * tests/contract/retell-analysis.test.js [P]

4. **Data Model Tasks** (6-7 tasks):
   - From `data-model.md` entities:
     * src/data/supabase-client.js (connection setup) [P]
     * src/data/user-model.js (CRUD operations) [P]
     * src/data/contact-model.js [P]
     * src/data/call-record-model.js [P]
     * src/data/conversation-context.js (with vector search) [P]
     * src/data/agent-config-model.js [P]

5. **Integration Test Tasks** (8-10 tasks) - **WRITTEN BEFORE FEATURE IMPLEMENTATION**:
   - From `quickstart.md` scenarios:
     * tests/integration/registration-flow.test.js
     * tests/integration/email-verification.test.js
     * tests/integration/phone-verification.test.js [P]
     * tests/integration/agent-configuration.test.js [P]
     * tests/integration/contact-import.test.js [P]
     * tests/integration/inbound-call-whitelisted.test.js
     * tests/integration/inbound-call-unknown.test.js
     * tests/integration/inbound-sms-whitelisted.test.js [P]
     * tests/integration/inbound-sms-unknown.test.js [P]
     * tests/integration/offline-mode.test.js [P]

6. **Feature Implementation Tasks** (35-45 tasks):
   - **Authentication** (5 tasks):
     * src/auth/register.js
     * src/auth/login.js
     * src/auth/sso-handlers.js (Google, Github, Facebook, LinkedIn)
     * public/index.html (landing page)
     * src/ui/router.js (client-side routing)

   - **Phone Verification** (4 tasks):
     * src/phone/verification.js (UI + logic)
     * supabase/functions/verify-phone-send.ts (Edge Function)
     * supabase/functions/verify-phone-check.ts (Edge Function)
     * src/phone/contacts.js (contact import + manual entry)

   - **Agent Configuration** (3 tasks):
     * src/agent/config.js (settings UI)
     * src/agent/text-interface.js
     * src/agent/voice-interface.js (WebRTC integration)

   - **Call Handling** (6 tasks):
     * supabase/functions/webhook-inbound-call.ts (SignalWire webhook)
     * supabase/functions/webhook-call-status.ts
     * supabase/functions/webhook-retell-analysis.ts (Retell.ai webhook)
     * src/call-handling/inbound-call.js (UI notifications)
     * src/call-handling/screening.js (screening logic)
     * src/call-handling/transfer.js (call transfer UI)

   - **SMS Handling** (4 tasks):
     * supabase/functions/webhook-inbound-sms.ts (SignalWire webhook)
     * src/sms/inbound-sms.js (UI notifications)
     * src/sms/response.js (AI response generation)
     * src/sms/conversation-view.js (threaded messages)

   - **History & Playback** (5 tasks):
     * src/history/call-history.js (list view with pagination)
     * src/history/sms-history.js (list view with pagination)
     * src/history/playback.js (audio player + transcript display)
     * src/history/search.js (search and filter)
     * src/history/export.js (data export)

   - **UI Foundation** (4 tasks):
     * src/ui/components.js (reusable web components)
     * src/ui/state.js (application state management)
     * public/manifest.json (PWA manifest)
     * public/service-worker.js (offline support + caching)

   - **Utilities** (4 tasks):
     * src/utils/validation.js + unit tests
     * src/utils/formatting.js + unit tests
     * src/utils/error-handler.js + unit tests
     * public/assets/ (icons, images, CSS)

7. **Edge Function Deployment Tasks** (3-4 tasks):
   - Deploy all Supabase Edge Functions
   - Configure SignalWire webhook URLs
   - Configure Retell.ai webhook URLs
   - Test end-to-end webhooks with live calls/SMS

8. **Performance & Polish Tasks** (5-7 tasks):
   - Implement Service Worker caching strategy
   - Add loading states and error boundaries
   - Performance audit (Lighthouse)
   - Bundle size optimization (code splitting)
   - Accessibility audit (WCAG 2.1 AA)
   - Cross-browser testing (Chrome, Safari, Firefox)
   - Mobile device testing (iOS, Android)

**Ordering Strategy**:
- **Phase 3.1**: Setup (tasks run in any order, [P] for all)
- **Phase 3.2**: Database migrations (sequential for safety, or [P] if using separate DBs)
- **Phase 3.3**: Contract tests (**MUST RUN AND FAIL** before any implementation)
- **Phase 3.4**: Data models (all [P], independent modules)
- **Phase 3.5**: Integration tests (**MUST BE WRITTEN** before feature code)
- **Phase 3.6**: Feature implementation (follow dependency order):
  * Auth → Phone → Agent Config → Call/SMS handling → History
  * Within each domain, mark [P] where files are independent
- **Phase 3.7**: Edge Functions (sequential to avoid deployment conflicts)
- **Phase 3.8**: Performance & polish (most can be [P])

**Dependency Rules**:
- Contract tests → Integration tests → Implementation (strict TDD)
- Data models → Services → UI (classic layering)
- Supabase client → All data models (shared dependency)
- Router → All page components (navigation dependency)
- Auth → All features (must be logged in)

**Estimated Output**: 85-95 numbered, dependency-ordered tasks in tasks.md

**Parallel Execution Opportunities**:
- All contract tests can run in parallel (11 files)
- All data models can be built in parallel (6 files)
- Most integration tests can run in parallel (7 of 10)
- UI components, utilities, and static assets can be built in parallel
- Cross-browser testing can run in parallel

**Critical Path** (longest dependency chain):
Setup → Migrations → Supabase Client → User Model → Auth → Phone Verification → Agent Config → Call Handling → Integration Tests → Deployment

**IMPORTANT**: This phase is executed by the /tasks command, NOT by /plan

## Outbound Calling Design Specification

### Overview
This section defines the phased approach for implementing outbound calling:
1. **Phase 1**: Get SignalWire SIP calling working from browser (using existing JsSIP client)
2. **Phase 2**: Add LiveKit bridging for recording and agent participation
3. **Phase 3**: Implement speaker labeling and tool invocation tracking

The current LiveKit-based implementation will be replaced with a SIP-first approach that allows optional LiveKit bridging when recording or agent features are needed.

### Core Capabilities

#### 1. User Control Requirements
- **Number Selection**: User can initiate outbound calls from any of their active service numbers
- **Call Recording**: Optional toggle to record the entire call (default: off)
- **Agent Participation**: Optional toggle to include Pat AI agent in the call (default: off)
- **Call Records**: All outbound calls appear in inbox with recordings, transcripts, and tool invocations
- **Tool Invocation Tracking**: When agent is active, all tool calls (SMS sending, contact adding, etc.) are logged in call record

#### 2. Current Implementation Status

##### 2.1 Existing Outbound Call System ✅
**Location**: `src/pages/inbox.js:1499` (`initiateCall()` method)

**Current Flow** (Already Working):
```
1. User clicks Call button in inbox
2. Frontend calls: supabase.functions.invoke('livekit-outbound-call')
   Parameters: { phoneNumber, callerIdNumber, userId, recordCall }
3. Edge Function creates LiveKit room
4. Edge Function dials PSTN number via SignalWire
5. Edge Function connects PSTN to LiveKit room
6. Frontend gets LiveKit token
7. Frontend joins LiveKit room
8. User is connected in LiveKit room with destination caller
```

**What Works**:
- ✅ Basic outbound calling via LiveKit
- ✅ Caller ID selection ("Call from" dropdown)
- ✅ Number pad dialer interface
- ✅ Call button UI with hangup transformation
- ✅ LiveKit room connection
- ✅ **Recording toggle UI** - Purple toggle switch in header
- ✅ Recording parameter passed to Edge Function

**What's Missing**:
- ❌ **Agent participation toggle UI** - Need "Include Agent" toggle next to "Record Call"
- ❌ Agent joining LiveKit room when enabled
- ❌ Speaker labeling in transcripts (User vs Agent vs Guest)
- ❌ Tool invocation tracking when agent is active
- ❌ Call records with proper direction, recording status, agent status in database

##### 2.2 Phase 1: SignalWire SIP Calling (Priority)

**Goal**: Get basic SIP calling working from browser to PSTN using JsSIP

**Implementation Steps**:

1. **Store SIP Credentials in Database**
   ```sql
   -- Add to service_numbers table
   ALTER TABLE service_numbers ADD COLUMN IF NOT EXISTS
     sip_username VARCHAR(255),
     sip_password VARCHAR(255), -- encrypted
     sip_domain VARCHAR(255) DEFAULT 'erik.signalwire.com',
     sip_ws_server VARCHAR(255) DEFAULT 'wss://erik.signalwire.com:7443';
   ```

2. **Provision SIP Endpoint for Each Service Number**
   - Create Edge Function: `supabase/functions/provision-sip-endpoint/index.ts`
   - Call SignalWire API to create SIP endpoint
   - Store credentials in database (encrypted)
   - Auto-provision when number is purchased/activated

3. **Update Outbound Call Flow in Inbox**
   ```javascript
   // src/pages/inbox.js - initiateCall() method

   async initiateCall(phoneNumber, callerIdNumber = null) {
     // Step 1: Get SIP credentials for the selected service number
     const { data: serviceNumber } = await supabase
       .from('service_numbers')
       .select('sip_username, sip_password, sip_domain, sip_ws_server')
       .eq('phone_number', callerIdNumber)
       .eq('is_active', true)
       .single();

     // Step 2: Initialize SIP client
     await sipClient.initialize({
       sipUri: `sip:${serviceNumber.sip_username}@${serviceNumber.sip_domain}`,
       sipPassword: serviceNumber.sip_password,
       wsServer: serviceNumber.sip_ws_server,
       displayName: callerIdNumber
     });

     // Step 3: Make call via SIP
     await sipClient.makeCall(phoneNumber, callerIdNumber, {
       onProgress: () => this.updateCallState('ringing'),
       onConfirmed: () => this.updateCallState('active'),
       onFailed: (cause) => this.updateCallState('failed', cause),
       onEnded: () => this.updateCallState('idle')
     });
   }
   ```

4. **SignalWire Configuration**
   - Enable SIP endpoints in SignalWire dashboard
   - Configure allowed domains for WebRTC
   - Set up STUN/TURN servers if needed
   - Test SIP registration from browser

5. **Call State Management**
   - Update UI to show SIP call states (registering, ringing, connected, ended)
   - Handle SIP errors (registration failed, call rejected, etc.)
   - Update call button to hangup button when connected
   - Show call duration timer

**Testing Phase 1**:
- ✅ SIP registration succeeds
- ✅ Outbound call rings destination number
- ✅ Audio flows both ways
- ✅ Hangup works from either side
- ✅ Call state updates correctly in UI
- ✅ Caller ID shows correct number

**Phase 1 Complete When**: User can make basic PSTN calls from browser using SIP, with no recording or agent features.

##### 2.3 Improved Call Flow Architecture

**Updated Flow** (With New Features):
```
1. User Interface:
   - Select "Call From" number
   - Enter "Call To" number
   - Toggle [🎙 Record Call] ON/OFF
   - Toggle [🤖 Include Agent] ON/OFF
   - Click "Call" button

2. Frontend (src/pages/inbox.js):
   - Calls Edge Function with recording & agent flags
   - Waits for LiveKit room creation

3. Edge Function (supabase/functions/livekit-outbound-call):
   - Creates LiveKit room
   - If agent enabled:
     * Connects agent to room FIRST
     * Waits for agent ready signal
   - If recording enabled:
     * Starts LiveKit room recording
   - Dials PSTN number via SignalWire
   - Connects PSTN to LiveKit room

4. LiveKit Room:
   - User participant (via WebRTC from browser)
   - Agent participant (if enabled)
   - PSTN caller participant (destination number)

Audio Routing:
  User ←→ LiveKit Room ←→ PSTN Destination
           ↕
      Agent (optional)
```

##### 2.4 Database Schema Updates

**New Fields in `call_records` table**:
```sql
ALTER TABLE call_records ADD COLUMN IF NOT EXISTS
  call_direction VARCHAR(10) CHECK (call_direction IN ('inbound', 'outbound')),
  recording_enabled BOOLEAN DEFAULT false,
  agent_enabled BOOLEAN DEFAULT false,
  livekit_room_name VARCHAR(255),
  livekit_recording_url TEXT,
  tool_invocations JSONB DEFAULT '[]'::jsonb;

-- Index for outbound calls
CREATE INDEX idx_call_records_direction ON call_records(call_direction);
CREATE INDEX idx_call_records_outbound_user ON call_records(user_id, call_direction)
  WHERE call_direction = 'outbound';
```

**New Fields in `service_numbers` table**:
```sql
ALTER TABLE service_numbers ADD COLUMN IF NOT EXISTS
  sip_username VARCHAR(255),
  sip_password VARCHAR(255),
  sip_domain VARCHAR(255),
  sip_endpoint_id VARCHAR(255);

-- Encrypt SIP credentials
CREATE EXTENSION IF NOT EXISTS pgcrypto;
```

##### 2.5 UI Components

**Outbound Call Interface**: `src/call-handling/outbound-call-dialer.js`

**Features**:
- Number pad for dialing
- Contact picker (auto-fill from contacts)
- Service number selector (which number to call from)
- Recording toggle with icon indicator
- Agent toggle with icon indicator
- Call duration timer
- Hang up button
- Call status display (dialing, ringing, connected)

**UI Wireframe**:
```
┌─────────────────────────────────┐
│  Outbound Call                  │
├─────────────────────────────────┤
│  Call From:  [+1 604 243-1596▼] │
│  Call To:    [+1 555 123-4567 ] │
│              [📞 Select Contact] │
│                                  │
│  ┌─────────────────────────────┐│
│  │ 1 │ 2 │ 3 │                 ││
│  │ 4 │ 5 │ 6 │                 ││
│  │ 7 │ 8 │ 9 │                 ││
│  │ * │ 0 │ # │                 ││
│  └─────────────────────────────┘│
│                                  │
│  [🎙 Record Call    ] Toggle Off │
│  [🤖 Include Agent  ] Toggle Off │
│                                  │
│  [        📞 Call        ]       │
└─────────────────────────────────┘
```

##### 2.6 Transcript Speaker Labeling

**Implementation**: `supabase/functions/process-outbound-transcript/index.ts`

**Logic**:
```typescript
interface TranscriptSegment {
  speaker: 'User' | 'Agent' | 'Guest';
  text: string;
  timestamp: number;
  confidence: number;
}

// LiveKit provides speaker diarization
// Map participant IDs to speaker labels:
const speakerMap = {
  [userParticipantId]: 'User',
  [agentParticipantId]: 'Agent',
  [guestParticipantId]: 'Guest'
};

// Process transcript
const labeledTranscript = rawTranscript.segments.map(segment => ({
  speaker: speakerMap[segment.participantId] || 'Unknown',
  text: segment.text,
  timestamp: segment.timestamp,
  confidence: segment.confidence
}));
```

**Display in Inbox**:
```
Call Record Detail View:
┌──────────────────────────────────────┐
│ Outbound Call to +1 555 123-4567    │
│ From: +1 604 243-1596                │
│ Duration: 5:23                       │
│ Recorded: Yes  │  Agent: Yes         │
├──────────────────────────────────────┤
│ Transcript:                          │
│                                      │
│ [User] Hello, this is Erik           │
│ [Guest] Hi Erik, how can I help?     │
│ [Agent] I can send them the link     │
│ [User] Yes please, Pat send the link │
│                                      │
│ Tool Invocations:                    │
│ ✓ SMS sent to +1 555 123-4567        │
│   "Here's the booking link: ..."     │
└──────────────────────────────────────┘
```

##### 2.7 Agent Tool Invocation Tracking

**Implementation**: `supabase/functions/livekit-agent-tools/index.ts`

**Tool Tracking**:
```typescript
// When agent invokes a tool during outbound call
async function trackToolInvocation(
  callRecordId: string,
  toolName: string,
  parameters: object,
  result: object
) {
  await supabase
    .from('call_records')
    .update({
      tool_invocations: sql`
        tool_invocations || jsonb_build_object(
          'timestamp', now(),
          'tool', ${toolName},
          'parameters', ${parameters}::jsonb,
          'result', ${result}::jsonb
        )::jsonb
      `
    })
    .eq('id', callRecordId);
}

// Example tool invocations stored in JSONB:
[
  {
    timestamp: "2025-10-31T12:30:45Z",
    tool: "send_sms",
    parameters: {
      to: "+15551234567",
      message: "Here's the booking link: https://..."
    },
    result: {
      success: true,
      message_id: "msg_abc123"
    }
  },
  {
    timestamp: "2025-10-31T12:31:12Z",
    tool: "add_to_call",
    parameters: {
      phone_number: "+15559876543",
      name: "Sarah"
    },
    result: {
      success: true,
      participant_id: "part_xyz789"
    }
  }
]
```

### Implementation Phases

#### Phase 1: Foundation (Week 1)
- [ ] Update database schema (call_records, service_numbers)
- [ ] Create SIP endpoint provisioning logic
- [ ] Build outbound call dialer UI component
- [ ] Implement browser SIP client integration

#### Phase 2: Call Bridging (Week 2)
- [ ] Design and test SWML/CXML script
- [ ] Implement LiveKit room creation for outbound calls
- [ ] Build SIP-to-LiveKit bridge logic
- [ ] Test call flow without agent (recording only)

#### Phase 3: Agent Integration (Week 3)
- [ ] Connect LiveKit agent to outbound calls
- [ ] Implement speaker labeling in transcripts
- [ ] Build tool invocation tracking system
- [ ] Test agent participation in calls

#### Phase 4: Recording & Transcription (Week 4)
- [ ] Implement LiveKit recording for outbound calls
- [ ] Process and store transcripts with speaker labels
- [ ] Update inbox to display outbound call records
- [ ] Add tool invocation display in call detail view

#### Phase 5: Polish & Testing (Week 5)
- [ ] End-to-end testing of all call scenarios
- [ ] Error handling and edge cases
- [ ] UI/UX refinement
- [ ] Performance optimization

### Testing Scenarios

1. **Basic Outbound Call** (No recording, no agent)
   - User dials number → Call connects → Conversation → Hang up
   - Expected: Call record created with minimal metadata

2. **Recorded Call** (Recording on, no agent)
   - User dials with recording enabled → Call connects → Conversation → Hang up
   - Expected: Call record with recording URL and transcript (User + Guest only)

3. **Agent-Assisted Call** (No recording, agent on)
   - User dials with agent enabled → Agent joins → Call connects → Agent responds to commands
   - Expected: Call record with agent participation logged

4. **Fully Enabled Call** (Recording + Agent)
   - User dials with both toggles on → Agent joins → Call connects → Full conversation with tool invocations
   - Expected: Call record with recording, 3-speaker transcript, and tool invocation log

5. **Call Failures**
   - Destination busy
   - Destination no answer
   - Destination invalid number
   - LiveKit connection failure
   - Agent connection timeout

### Security Considerations

1. **SIP Credentials**: Encrypt sip_password in database using pgcrypto
2. **LiveKit Tokens**: Generate time-limited tokens for each call
3. **Recording Consent**: Display "This call is being recorded" message if recording enabled
4. **Agent Access**: Validate agent permissions before allowing tool invocations
5. **Call Authorization**: Verify user owns the source service number

### Performance Requirements

- **Call Setup Time**: < 2 seconds from dial to ring
- **LiveKit Connection**: < 500ms to join room
- **Agent Join Time**: < 1 second when enabled
- **Recording Processing**: < 30 seconds post-call for transcript generation
- **UI Responsiveness**: 60fps during call interface interactions

### Future Enhancements

1. **Multi-party Calls**: Support adding multiple participants during call
2. **Call Transfer**: Transfer ongoing call to another number
3. **Call Hold**: Put destination on hold while consulting with agent
4. **Call Recording Pause**: Pause/resume recording during sensitive parts
5. **Real-time Transcription**: Display live transcript during call
6. **Agent Coaching Mode**: Agent whispers suggestions only to user

## Phase 3+: Future Implementation
*These phases are beyond the scope of the /plan command*

**Phase 3**: Task execution (/tasks command creates tasks.md)  
**Phase 4**: Implementation (execute tasks.md following constitutional principles)  
**Phase 5**: Validation (run tests, execute quickstart.md, performance validation)

## Complexity Tracking
*Fill ONLY if Constitution Check has violations that must be justified*

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., 4th project] | [current need] | [why 3 projects insufficient] |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient] |


## Progress Tracking
*This checklist is updated during execution flow*

**Phase Status**:
- [x] Phase 0: Research complete (/plan command) ✅ research.md created
- [x] Phase 1: Design complete (/plan command) ✅ data-model.md, contracts/, quickstart.md, CLAUDE.md created
- [x] Phase 2: Task planning complete (/plan command - describe approach only) ✅ Approach documented
- [ ] Phase 3: Tasks generated (/tasks command) ⏳ Ready for /tasks command
- [ ] Phase 4: Implementation complete
- [ ] Phase 5: Validation passed

**Gate Status**:
- [x] Initial Constitution Check: PASS ✅ All principles validated before Phase 0
- [x] Post-Design Constitution Check: PASS ✅ All principles re-validated after Phase 1
- [x] All NEEDS CLARIFICATION resolved ✅ Research decisions documented in research.md
- [x] Complexity deviations documented ✅ No violations - architecture appropriate for requirements

**Artifacts Generated**:
- ✅ plan.md (this file)
- ✅ research.md (12 technical decisions with rationale)
- ✅ data-model.md (7 entities, relationships, migrations, RLS policies)
- ✅ contracts/auth-api.yaml (Supabase Auth contract)
- ✅ contracts/supabase-data-api.yaml (PostgREST contract)
- ✅ contracts/telephony-webhooks.yaml (SignalWire + Retell.ai webhooks)
- ✅ quickstart.md (8 end-to-end test scenarios)
- ✅ CLAUDE.md (agent context file)

**Next Step**: Run `/tasks` command to generate tasks.md with 85-95 implementation tasks

---
*Based on Constitution v1.0.0 - See `.specify/memory/constitution.md`*
