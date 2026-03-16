# Research: Magpipe Agent Skills Framework

**Date**: 2026-03-04 | **Branch**: `007-magpipe-agent-skills`

## 1. Skill Execution Engine

**Decision**: Dual-path execution — scheduled skills via `scheduled_actions` queue, event-triggered skills via direct edge function invocation.

**Rationale**: The existing `scheduled_actions` table + 5-min pg_cron is proven and handles retries, status tracking, and failure recovery. Event-triggered skills (call ends, message received) need faster response than 5-min polling, so they call `execute-skill` directly from the voice agent or webhook handler.

**Alternatives Considered**:
- **Supabase Realtime + client-side execution**: Rejected — skills run server-side, not in the browser.
- **Dedicated pg_cron per skill**: Rejected — too many cron jobs; better to batch through the existing queue.
- **External job queue (BullMQ, Temporal)**: Rejected — adds infrastructure complexity; scheduled_actions with 5-min cron is sufficient for v1 scale.

## 2. Skill Definition Storage

**Decision**: Database table (`skill_definitions`) with JSONB columns for parameter schemas and configuration schemas.

**Rationale**: Clarification confirmed DB-stored definitions. Follows the `integration_providers` pattern already in the codebase. New skills can be added by inserting rows + deploying a handler module.

**Alternatives Considered**:
- **Hardcoded in frontend JS**: Rejected — user chose DB-stored for flexibility.
- **Hybrid (code + DB metadata)**: Viable but adds complexity; pure DB definitions with handler references is simpler.

## 3. Skill Handler Architecture

**Decision**: Each skill has a handler module in `_shared/skill-handlers/` that exports an `execute(context)` function. The `execute-skill` edge function loads the appropriate handler based on `skill_definitions.handler_id`.

**Rationale**: Self-contained handlers are independently testable and deployable. The shared module pattern is used by `_shared/js-content-fetcher.ts` and `_shared/slack-channels.ts` already.

**Alternatives Considered**:
- **Single monolithic edge function with switch/case**: Rejected — grows unwieldy as skills are added.
- **Separate edge function per skill**: Rejected — deployment overhead for 7+ functions; shared handler modules are lighter.

## 4. Event Trigger Dispatch

**Decision**: Voice agent adds `asyncio.create_task(trigger_event_skills(call_context))` in `on_call_end()`. This function calls the `execute-skill` edge function with event metadata. SMS/chat handlers add similar dispatch.

**Rationale**: Follows the existing pattern of 4 parallel async tasks spawned at call end (Slack notification, billing, memory, webhooks). Adding a 5th task for skills is zero-friction.

**Alternatives Considered**:
- **Database trigger on `call_records` update**: Rejected — Postgres triggers can't call external services directly; would need pg_net which adds latency and complexity.
- **Supabase Realtime subscription from a worker**: Rejected — no worker infrastructure exists.

## 5. UI Pattern

**Decision**: New `skills-tab.js` mixin following the exact pattern of `functions-tab.js`. Skill cards with toggle + configure button. Configuration modal using `contact-modal-*` CSS classes.

**Rationale**: Direct pattern match with existing tabs. Users already understand the toggle + configure pattern from the Functions tab (custom functions have the same UX: list → toggle → configure modal).

**Alternatives Considered**:
- **Top-level Skills page (not per-agent)**: Rejected — skills are per-agent; putting them on agent detail is natural.
- **Inline configuration (no modal)**: Rejected — skill config has too many sections (trigger, delivery, parameters) to fit inline.

## 6. Template Interpolation

**Decision**: Use `{{variable_name}}` syntax in message templates. Variables resolved from: extracted data (dynamic variables), call metadata (`{{caller_name}}`, `{{caller_phone}}`, `{{call_duration}}`), agent metadata (`{{agent_name}}`, `{{organization_name}}`).

**Rationale**: Double-brace syntax is universally recognized and avoids conflicts with JS template literals. Missing variables render as empty string with no error.

**Alternatives Considered**:
- **`${variable}` JS template literals**: Rejected — conflicts with actual JS, security risk (code injection).
- **Handlebars/Mustache library**: Rejected — overkill for simple variable replacement; a 10-line regex replace is sufficient.

## 7. Delivery Channel Routing

**Decision**: Each `agent_skill` config has a `delivery_channels` JSONB array specifying channels and their settings. The `execute-skill` edge function iterates channels and calls existing notification functions in parallel.

**Rationale**: Reuses `send-notification-email`, `send-notification-sms`, `send-notification-slack` without modification. Each delivery is independent — failure in one doesn't block others (FR-032).

**Alternatives Considered**:
- **Modify existing notification functions to accept skill context**: Rejected — would change signatures for existing callers.
- **New unified notification dispatcher**: Rejected — over-engineering for v1; direct calls to existing functions are simpler.
