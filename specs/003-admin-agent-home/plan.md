
# Implementation Plan: Admin Agent & Home Page Redesign

**Branch**: `003-admin-agent-home` | **Date**: 2025-11-05 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/Users/erik/Documents/GitHub/Snapsonic/pat/specs/003-admin-agent-home/spec.md`

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
Replace the current Pat dashboard homepage with a conversational admin interface that allows users to configure their AI call/SMS agent through natural language (voice or text). Users will be able to update system prompts, add knowledge sources from URLs, and perform admin functions both via web interface and phone calls with secure access code authentication.

## Technical Context
**Language/Version**: JavaScript ES6+ (frontend), TypeScript (Supabase Edge Functions), Python 3.11 (LiveKit agent - if phone admin integration needed)
**Primary Dependencies**:
  - Frontend: Vite, @supabase/supabase-js, Web Speech API (voice toggle)
  - Backend: Supabase Edge Functions, Deno runtime
  - AI: OpenAI API (GPT-4 for admin agent), ElevenLabs (TTS for phone admin)
  - Vector DB: Supabase pgvector extension (knowledge base embeddings)
  - Auth: Supabase Auth (existing)
**Storage**: PostgreSQL (Supabase) with pgvector extension for embeddings
**Testing**: Vitest (unit/integration), Playwright (E2E)
**Target Platform**: Web browsers (mobile-first PWA), phone calls via existing LiveKit/Retell infrastructure
**Project Type**: web (frontend + backend Edge Functions)
**Performance Goals**: Lowest possible latency for agent responses, knowledge base sync, and configuration updates
**Constraints**:
  - Must work on mobile and desktop browsers
  - Phone admin must use existing call infrastructure (LiveKit/Retell)
  - SMS confirmation for access code changes
  - 3 failed auth attempts → lock until web reset
**Scale/Scope**:
  - 1 new homepage (chat interface)
  - 1 new settings section (knowledge base + access code management)
  - 6-8 new Supabase Edge Functions (admin agent, knowledge management, access code verification)
  - 3-5 new database tables (admin conversations, knowledge sources, access codes, etc.)
  - Phone admin integration with existing call handlers

## Constitution Check
*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**I. Code Quality First**: ✅ PASS
- All imports will be at module/file top (enforced by pre-commit hooks)
- Mobile-first design required per NFR-005
- Code will follow existing ESLint/Prettier conventions
- Inline documentation for complex AI agent logic

**II. Test-Driven Development**: ✅ PASS
- Contract tests will be written before Edge Function implementation
- Integration tests will validate user scenarios from spec
- E2E tests will cover homepage chat interface and settings UI
- All tests run before any commits (PRE-COMMIT-CHECKLIST.md)

**IIa. Breaking Change Prevention**: ✅ PASS
- New homepage replaces existing dashboard (intentional breaking change, user-approved)
- No modification of existing tables (agent_configs, service_numbers, users)
- New tables added for admin features (admin_conversations, knowledge_sources, access_codes)
- Backward compatible: existing call/SMS agent continues working unchanged

**III. User Experience Consistency**: ✅ PASS
- No vendor names (Retell, SignalWire, OpenAI) exposed in UI
- Error messages will be actionable per constitution
- Chat interface follows conversational patterns (similar to ChatGPT)
- Settings page integrates with existing settings UI patterns

**IV. Performance by Design**: ✅ PASS
- NFR-002/NFR-003: "Lowest possible latency" documented as performance target
- Streaming responses from admin agent (OpenAI streaming API)
- Vector search optimized with pgvector indexes
- Knowledge sync runs async (background jobs, not blocking user)

**V. Debugging Infrastructure Required**: ✅ PASS
- Admin agent conversations logged to `admin_conversations` table
- Knowledge sync state tracked in `knowledge_sources` table (sync_status, last_synced_at)
- Access code verification attempts logged to `access_code_attempts` table
- Phone admin auth flow logs to `call_state_logs` (existing pattern)

**Complexity Budget**: ✅ ACCEPTABLE
- New dependency: OpenAI API (required for conversational admin agent)
- New dependency: pgvector extension (required for knowledge base RAG)
- Justification: No simpler alternative for natural language config + knowledge retrieval
- Offset: Removes complexity of form-based settings (replaced by conversation)

## Project Structure

### Documentation (this feature)
```
specs/003-admin-agent-home/
├── plan.md              # This file (/plan command output)
├── research.md          # Phase 0 output (/plan command)
├── data-model.md        # Phase 1 output (/plan command)
├── quickstart.md        # Phase 1 output (/plan command)
├── contracts/           # Phase 1 output (/plan command)
│   ├── admin-agent-chat.json         # POST /admin-agent-chat endpoint
│   ├── knowledge-source-add.json     # POST /knowledge-source-add endpoint
│   ├── knowledge-source-delete.json  # DELETE /knowledge-source-delete endpoint
│   ├── access-code-verify.json       # POST /access-code-verify endpoint
│   └── access-code-update.json       # POST /access-code-update endpoint
└── tasks.md             # Phase 2 output (/tasks command - NOT created by /plan)
```

### Source Code (repository root)
```
# Frontend (web application)
src/
├── pages/
│   └── home.js                    # NEW: Chat interface homepage
├── components/
│   ├── AdminChatInterface.js      # NEW: Main chat UI component
│   ├── VoiceToggle.js            # NEW: Voice input toggle button
│   ├── KnowledgeSourceManager.js  # NEW: Settings KB management
│   └── AccessCodeSettings.js      # NEW: Settings access code UI
├── services/
│   ├── adminAgentService.js      # NEW: Admin agent API calls
│   └── knowledgeService.js       # NEW: Knowledge base API calls
└── lib/
    └── voiceRecognition.js       # NEW: Web Speech API wrapper

# Backend (Supabase Edge Functions)
supabase/functions/
├── admin-agent-chat/
│   └── index.ts                  # NEW: Handle admin agent conversations
├── knowledge-source-add/
│   └── index.ts                  # NEW: Fetch URL, generate embeddings
├── knowledge-source-sync/
│   └── index.ts                  # NEW: Background sync job
├── knowledge-source-delete/
│   └── index.ts                  # NEW: Remove KB source
├── access-code-verify/
│   └── index.ts                  # NEW: Verify access code attempts
├── access-code-update/
│   └── index.ts                  # NEW: Update access code with SMS confirm
└── phone-admin-handler/
    └── index.ts                  # NEW: Phone call admin authentication

# Database
supabase/migrations/
└── 0XX_admin_agent_schema.sql    # NEW: Tables for admin features

# Tests
tests/
├── contract/
│   ├── admin-agent-chat.test.js
│   ├── knowledge-source.test.js
│   └── access-code.test.js
├── integration/
│   ├── admin-homepage.test.js
│   ├── knowledge-base-flow.test.js
│   └── phone-admin-auth.test.js
└── e2e/
    ├── admin-chat-interface.spec.js
    └── settings-knowledge-access.spec.js
```

**Structure Decision**: Web application structure with frontend (src/) and backend (supabase/functions/). Frontend uses existing Vite-based PWA architecture with new pages, components, and services for admin agent. Backend adds 6-7 new Edge Functions for AI agent, knowledge management, and access code verification. All new code integrates with existing authentication, database, and call infrastructure.

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
1. **Database Foundation** (from data-model.md):
   - Create migration 0XX_admin_agent_schema.sql
   - Enable pgvector extension
   - Create all 7 tables with indexes and RLS policies
   - Add columns to users table (phone_admin_*)

2. **Contract Tests** (from contracts/*.json):
   - Contract test for admin-agent-chat endpoint [P]
   - Contract test for knowledge-source-add endpoint [P]
   - Contract test for knowledge-source-list endpoint [P]
   - Contract test for knowledge-source-delete endpoint [P]
   - Contract test for access-code-update endpoint [P]

3. **Backend Implementation** (Edge Functions):
   - admin-agent-chat function (OpenAI function calling)
   - knowledge-source-add function (Readability + embeddings)
   - knowledge-source-sync background job
   - knowledge-source-list function
   - knowledge-source-delete function
   - access-code-update function (SMS confirmation)
   - Phone admin auth integration into LiveKit agent.py

4. **Frontend Components** (from Project Structure):
   - AdminChatInterface.js component [P]
   - VoiceToggle.js component [P]
   - KnowledgeSourceManager.js component [P]
   - AccessCodeSettings.js component [P]
   - voiceRecognition.js lib wrapper [P]
   - adminAgentService.js API client [P]
   - knowledgeService.js API client [P]

5. **Page Integration**:
   - home.js page with chat interface
   - Update settings page for KB and access code sections
   - Update router to make home page default route

6. **Integration Tests** (from quickstart.md scenarios):
   - Text-based prompt configuration flow
   - Knowledge source addition flow
   - Access code setup with SMS
   - Phone admin authentication

7. **E2E Tests**:
   - Admin chat interface (Playwright)
   - Settings KB management (Playwright)

**Ordering Strategy**:
1. Database first (all other tasks depend on schema)
2. Contract tests before implementation (TDD)
3. Backend before frontend (frontend depends on API)
4. Components in parallel (no dependencies between them)
5. Integration after implementation (requires working system)
6. E2E last (full stack must be working)

**Estimated Output**: 35-40 numbered, ordered tasks in tasks.md

**Dependencies**:
- Database → Backend → Frontend → Integration → E2E
- Contract tests run in parallel with database creation
- All component tasks can run in parallel [P]
- Edge Functions depend on database but can run in parallel after migration

**IMPORTANT**: This phase is executed by the /tasks command, NOT by /plan

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
- [x] Phase 0: Research complete (/plan command)
  - ✅ research.md created with all technology decisions documented
  - ✅ No NEEDS CLARIFICATION remaining
- [x] Phase 1: Design complete (/plan command)
  - ✅ data-model.md created with 7 entities, relationships, migrations
  - ✅ 5 API contracts generated in contracts/ directory
  - ✅ quickstart.md created with 6 validation scenarios
  - ✅ CLAUDE.md updated with new technologies
- [x] Phase 2: Task planning complete (/plan command - describe approach only)
  - ✅ Task generation strategy documented (35-40 tasks estimated)
  - ✅ Ordering strategy defined (Database → Backend → Frontend → Tests)
  - ✅ Dependencies mapped
- [x] Phase 3: Tasks generated (/tasks command)
  - ✅ tasks.md created with 40 numbered tasks (T001-T040)
  - ✅ Tasks organized in 9 phases (Database → Backend → Phone → Services → Components → Pages → Integration → E2E)
  - ✅ Parallel execution groups identified (6 groups of [P] tasks)
  - ✅ Dependencies documented and validated
  - ✅ TDD enforced (contract tests before implementation)
- [ ] Phase 4: Implementation complete
- [ ] Phase 5: Validation passed

**Gate Status**:
- [x] Initial Constitution Check: PASS
  - ✅ All 5 constitutional principles satisfied
  - ✅ Complexity budget justified (OpenAI, pgvector)
- [x] Post-Design Constitution Check: PASS
  - ✅ TDD approach enforced (contract tests before implementation)
  - ✅ Breaking change analysis complete (intentional homepage replacement)
  - ✅ Debugging infrastructure included (state logging tables)
  - ✅ Mobile-first design per NFR-005
- [x] All NEEDS CLARIFICATION resolved
  - ✅ Feature spec has 7 clarifications answered
  - ✅ Technical Context has no NEEDS CLARIFICATION markers
- [x] Complexity deviations documented
  - ✅ New dependencies justified in Constitution Check section

---
*Based on Constitution v1.0.0 - See `.specify/memory/constitution.md`*

**Ready for `/tasks` command** - All planning phases complete
