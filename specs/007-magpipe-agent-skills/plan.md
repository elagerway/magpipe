
# Implementation Plan: Magpipe Agent Skills Framework

**Branch**: `007-magpipe-agent-skills` | **Date**: 2026-03-04 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/007-magpipe-agent-skills/spec.md`

## Summary

Build an autonomous skills framework that lets Magpipe agents execute background jobs (post-call follow-ups, competitor monitoring, appointment reminders, CRM updates) triggered by schedules or events (call ends, message received). Skills are defined as database records, configured per-agent via a new "Skills" tab, executed by extending the existing `scheduled_actions` queue, and delivered through existing notification channels (Slack, email, SMS, push, webhook, voice). The initial release ships 7 built-in skills with no plan-based gating.

## Technical Context
**Language/Version**: JavaScript ES6+ (frontend), TypeScript (edge functions), Python 3.11 (voice agent)
**Primary Dependencies**: Supabase JS Client, Vite, pg_cron, existing notification edge functions
**Storage**: PostgreSQL (Supabase) with 3 new tables: `skill_definitions`, `agent_skills`, `skill_executions`
**Testing**: Vitest (unit), Playwright (E2E)
**Target Platform**: Web application (browser) + Supabase Edge Functions + LiveKit voice agent
**Project Type**: Web (existing monorepo: `src/` frontend + `supabase/functions/` backend + `agents/` voice)
**Performance Goals**: Simple skills <60s, complex skills <5min, Skills tab loads <2s, 100 concurrent executions
**Constraints**: Extend existing `scheduled_actions` queue (5-min cron), no new delivery channels, all skills available to all users
**Scale/Scope**: ~500 agents, 7 built-in skills v1, 3 new DB tables, 1 new edge function, 1 new UI tab, voice agent event hook

## Constitution Check
*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Code Quality First | PASS | Mobile-first UI, follows existing mixin/tab patterns, top-level imports only |
| II. TDD | PASS | Contract tests for edge functions, E2E for UI tab, unit tests for template interpolation |
| IIa. Breaking Change Prevention | PASS | Additive only — new tables, new tab, new edge function. No changes to existing schemas or APIs |
| III. UX Consistency | PASS | Skills tab follows existing tab mixin pattern, modals use `contact-modal-*` pattern, no vendor names exposed |
| IV. Performance by Design | PASS | 5-min cron polling is existing pattern; event triggers add <1s via async task spawn in voice agent |
| V. Outbound Call Architecture | PASS | Appointment Reminder skill will use existing batch call infrastructure (SignalWire), NOT LiveKit SIP trunk |
| VI. Debugging Infrastructure | PASS | `skill_executions` table logs every execution with status, timestamps, delivery receipts, errors |

**Initial Constitution Check: PASS** — No violations. All additive changes following existing patterns.

## Project Structure

### Documentation (this feature)
```
specs/007-magpipe-agent-skills/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── skill-api.md     # Edge function contracts
└── tasks.md             # Phase 2 output (/tasks command)
```

### Source Code (repository root)
```
src/
├── pages/agent-detail/
│   ├── index.js              # Add Skills tab button + import
│   └── skills-tab.js         # NEW: Skills tab mixin (catalog, config modal, execution history)
├── lib/
│   └── skills.js             # NEW: Skill API helpers (CRUD, execute, list)

supabase/
├── migrations/
│   └── 20260304_agent_skills.sql    # NEW: skill_definitions, agent_skills, skill_executions tables + RLS + seed data
├── functions/
│   ├── execute-skill/               # NEW: Skill execution engine
│   │   └── index.ts
│   └── _shared/
│       └── skill-handlers/          # NEW: Per-skill execution logic
│           ├── post-call-followup.ts
│           ├── appointment-reminder.ts
│           ├── competitor-monitoring.ts
│           ├── daily-news-digest.ts
│           ├── auto-crm-update.ts
│           ├── social-media-monitoring.ts
│           └── review-request.ts

agents/livekit-voice-agent/
└── agent.py                  # MODIFY: Add skill trigger dispatch on call end

tests/
├── unit/
│   └── skills.test.js        # Template interpolation, config validation
└── e2e/
    └── skills.spec.js        # Skills tab E2E tests
```

**Structure Decision**: Existing web monorepo structure. Skills tab follows the agent-detail mixin pattern. Skill handler logic lives in `_shared/skill-handlers/` so the `execute-skill` edge function can import them. Each handler is a self-contained module.

## Phase 0: Outline & Research

No NEEDS CLARIFICATION items remain. All technical choices are informed by existing codebase patterns:

1. **Skill execution engine**: Extend `scheduled_actions` with `action_type = 'execute_skill'` for scheduled skills. Event-triggered skills dispatch directly from voice agent `on_call_end()` and SMS webhook handlers.
2. **Skill definitions storage**: Database table (`skill_definitions`) following the `integration_providers` 3-table pattern.
3. **UI tab pattern**: Mixin pattern from `functions-tab.js` with `contact-modal-*` config modals.
4. **Notification delivery**: Reuse existing `send-notification-email/sms/slack` edge functions.
5. **Voice agent hook**: Add `asyncio.create_task(trigger_event_skills(...))` alongside existing post-call tasks in `on_call_end()`.

**Output**: See [research.md](./research.md)

## Phase 1: Design & Contracts

### 1. Data Model
See [data-model.md](./data-model.md) for complete entity definitions including:
- `skill_definitions` — catalog of available skills (7 seeded rows)
- `agent_skills` — per-agent skill configuration
- `skill_executions` — execution log with delivery tracking

### 2. API Contracts
See [contracts/skill-api.md](./contracts/skill-api.md) for edge function contracts:
- `execute-skill` — main execution engine (called by cron and event triggers)
- Extensions to `process-scheduled-actions` for `execute_skill` action type
- Frontend API calls via Supabase client (CRUD on `agent_skills`)

### 3. Quickstart
See [quickstart.md](./quickstart.md) for end-to-end validation steps.

### 4. Agent Context Update
Run `.specify/scripts/bash/update-agent-context.sh claude` to update CLAUDE.md with skills framework context.

**Post-Design Constitution Re-Check: PASS** — Design follows all existing patterns. No new abstractions beyond what's needed. No breaking changes.

## Phase 2: Task Planning Approach
*This section describes what the /tasks command will do - DO NOT execute during /plan*

**Task Generation Strategy**:
- Migration first (tables + seed data + RLS)
- Edge function: `execute-skill` with handler interface
- 7 skill handlers (parallelizable — independent files)
- Voice agent hook (event trigger dispatch)
- Frontend: skills-tab.js (catalog UI + config modal + execution history)
- Frontend: skills.js (API helpers)
- Tests: unit tests for template interpolation, E2E for tab interaction
- Process-scheduled-actions extension for `execute_skill` action type

**Ordering Strategy**:
- TDD order: Tests defined alongside implementation
- Dependency order: Migration → Edge function → Handlers → Voice agent hook → Frontend
- Mark [P] for parallel execution: All 7 skill handlers are independent

**Estimated Output**: 18-22 numbered, ordered tasks in tasks.md

## Progress Tracking

**Phase Status**:
- [x] Phase 0: Research complete (/plan command)
- [x] Phase 1: Design complete (/plan command)
- [x] Phase 2: Task planning complete (/plan command - describe approach only)
- [x] Phase 3: Tasks generated (/tasks command)
- [ ] Phase 4: Implementation complete
- [ ] Phase 5: Validation passed

**Gate Status**:
- [x] Initial Constitution Check: PASS
- [x] Post-Design Constitution Check: PASS
- [x] All NEEDS CLARIFICATION resolved
- [x] Complexity deviations documented (none needed)

---
*Based on Constitution v1.0.0 - See `.specify/memory/constitution.md`*
