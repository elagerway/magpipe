# Tasks: Magpipe Agent Skills Framework

**Input**: Design documents from `/specs/007-magpipe-agent-skills/`
**Prerequisites**: plan.md, research.md, data-model.md, contracts/skill-api.md, quickstart.md

## Phase 3.1: Setup — Database & Infrastructure

- [x] T001 Create database migration `supabase/migrations/20260304_agent_skills.sql`
  - Create `skill_definitions` table with all columns from data-model.md (slug, name, description, category, icon, supported_triggers, supported_events, supported_channels, required_integrations, config_schema, handler_id, agent_type_filter, is_active, sort_order)
  - Create `agent_skills` table with all columns (user_id, agent_id, skill_definition_id, is_enabled, config, trigger_type, schedule_config, event_config, delivery_channels, last_executed_at, execution_count) + UNIQUE(agent_id, skill_definition_id)
  - Create `skill_executions` table with all columns (user_id, agent_id, agent_skill_id, skill_definition_id, trigger_type, trigger_context, status, result, deliveries, error_message, retry_count, started_at, completed_at, execution_time_ms) + 3 indexes
  - Enable RLS on all 3 tables with policies per data-model.md (skill_definitions: read-only for authenticated; agent_skills: CRUD for own agents; skill_executions: SELECT/UPDATE for own agents, INSERT service_role only)
  - ALTER `scheduled_actions` CHECK constraint to add `'execute_skill'`
  - Seed 7 built-in skill definitions with full config_schema JSONB (see data-model.md Seed Data table and Config Schema Examples)
  - Apply migration via Supabase MCP `apply_migration`

- [x] T002 Create `execute-skill` edge function scaffolding at `supabase/functions/execute-skill/index.ts`
  - Import Supabase client from `_shared/`
  - Accept POST with `{ agent_skill_id?, event_type?, agent_id?, trigger_type, trigger_context }`
  - Two entry paths: (1) direct `agent_skill_id` execution, (2) `event_type` + `agent_id` → query all matching enabled skills
  - For each skill: create `skill_executions` row (pending), update to running, dynamically import handler by `handler_id`, call `handler.execute(context)`, deliver results, update to completed/failed
  - Handle dry_run: return preview without delivery
  - Delivery: for each `delivery_channels` entry, call existing `send-notification-email/sms/slack` via `fetch()` with service role key
  - Retry logic: if handler throws, increment retry_count, re-queue if < 3
  - Dedup: check for existing running execution of same agent_skill_id before starting
  - Deploy with `--no-verify-jwt` (service role auth + dry_run user JWT)

- [x] T003 Create skill handler interface and template at `supabase/functions/_shared/skill-handlers/types.ts`
  - Export `SkillExecutionContext` interface: `{ agentSkill, skillDefinition, triggerContext, config, isDryRun }`
  - Export `SkillExecutionResult` interface: `{ summary, actions_taken, preview?, data? }`
  - Export `SkillHandler` interface: `{ execute(context: SkillExecutionContext): Promise<SkillExecutionResult> }`

- [x] T004 Create template interpolation utility at `supabase/functions/_shared/skill-handlers/template.ts`
  - Export `resolveTemplate(template: string, variables: Record<string, string>): string`
  - Replace `{{variable_name}}` patterns with values from variables map
  - Missing variables → empty string (no error)
  - Variable sources: extracted_data, caller_phone, caller_name, call_duration, agent_name, organization_name, call_summary

## Phase 3.2: Skill Handlers [P] — All Independent Files

- [x] T005 [P] Create `supabase/functions/_shared/skill-handlers/post-call-followup.ts`
  - Read config: delay_minutes, message_template, min_call_duration_seconds, consent_confirmed
  - Validate: call_duration >= min_call_duration_seconds, consent_confirmed is true
  - Resolve template with call context variables
  - Return result with resolved message — delivery handled by execute-skill
  - Dry run: return preview of resolved template

- [x] T006 [P] Create `supabase/functions/_shared/skill-handlers/appointment-reminder.ts`
  - Read config: reminder_hours_before, message_template, fallback_to_sms
  - Query Cal.com for upcoming appointments (use existing Cal.com integration via user_integrations)
  - For each appointment within window: resolve template with appointment details (name, time, date)
  - Return list of reminders to send — execute-skill handles delivery
  - Dry run: return list of upcoming appointments that would trigger

- [x] T007 [P] Create `supabase/functions/_shared/skill-handlers/competitor-monitoring.ts`
  - Read config: urls (array, max 10), check_for (any_changes/pricing_changes/new_content/all), digest_format
  - For each URL: fetch content using `fetchPageContent` from `_shared/js-content-fetcher.ts`
  - Compare against previous snapshot stored in `skill_executions` result of last successful run
  - Generate diff summary using LLM (OpenAI via existing pattern)
  - Return digest text with changes detected per URL
  - Dry run: return list of URLs that would be monitored

- [x] T008 [P] Create `supabase/functions/_shared/skill-handlers/daily-news-digest.ts`
  - Read config: topics (array), sources (array of domains, optional), digest_format
  - Use Serper API (existing pattern from `process-social-listening`) to search news
  - Deduplicate results
  - Generate executive summary using LLM
  - Return formatted digest
  - Dry run: return sample search results without LLM summary

- [x] T009 [P] Create `supabase/functions/_shared/skill-handlers/auto-crm-update.ts`
  - Read config: field_mapping (which extracted data → which CRM fields)
  - Check user has HubSpot connected (query `user_integrations` for hubspot provider)
  - Map extracted_data from trigger_context to HubSpot contact fields
  - Call HubSpot API via existing integration (create note + update contact)
  - Return result with CRM update summary
  - Dry run: return preview of what fields would be updated

- [x] T010 [P] Create `supabase/functions/_shared/skill-handlers/social-media-monitoring.ts`
  - Read config: keywords (array), platforms (reddit, hackernews, google), digest_format
  - Reuse Serper API search pattern from existing `process-social-listening` edge function
  - Deduplicate against previous execution results
  - Format results grouped by platform
  - Return formatted digest with new mentions
  - Dry run: return sample search without persistence

- [x] T011 [P] Create `supabase/functions/_shared/skill-handlers/review-request.ts`
  - Read config: message_template, review_url, min_days_since_last_request, consent_confirmed
  - Query recent call contacts who haven't been sent a review request (check skill_executions history)
  - Resolve template with contact name and review URL
  - Return list of contacts to message
  - Dry run: return list of eligible contacts without sending

## Phase 3.3: Scheduled Actions Extension

- [x] T012 Extend `supabase/functions/process-scheduled-actions/index.ts` to handle `execute_skill` action type
  - Add `else if (action.action_type === 'execute_skill')` branch
  - Call `execute-skill` edge function via `fetch()` with service role key
  - Pass `agent_skill_id`, `trigger_type: 'schedule'`, and `trigger_context` from action parameters
  - After successful execution: calculate next scheduled time from `agent_skills.schedule_config` and insert new `scheduled_actions` row
  - Handle failure: existing retry logic applies

## Phase 3.4: Voice Agent Event Hook

- [x] T013 Add skill trigger dispatch to `agents/livekit-voice-agent/agent.py`
  - Add `trigger_event_skills(call_context)` async function near existing post-call tasks
  - Function calls `POST {SUPABASE_URL}/functions/v1/execute-skill` with service role key
  - Payload: `{ event_type: "call_ends", agent_id, trigger_context: { call_record_id, caller_phone, caller_name, call_duration_seconds, call_summary, extracted_data } }`
  - In `on_call_end()`: add `asyncio.create_task(trigger_event_skills(call_context))` alongside existing 4 async tasks (after Slack notification, billing, memory, webhooks)
  - Wrap in try/except to never crash on skill failure
  - Log skill trigger attempt and response status

## Phase 3.5: Frontend — API Helpers

- [x] T014 Create `src/lib/skills.js` — Skill API helper functions
  - `listSkillDefinitions()` — query `skill_definitions` where `is_active = true`, ordered by category + sort_order
  - `listAgentSkills(agentId)` — query `agent_skills` with join to `skill_definitions`, filtered by agent_id
  - `enableSkill(agentId, skillDefinitionId, config)` — insert into `agent_skills` with user_id from session
  - `updateSkillConfig(agentSkillId, updates)` — update `agent_skills` row
  - `disableSkill(agentSkillId)` — update `is_enabled = false`
  - `deleteSkill(agentSkillId)` — delete from `agent_skills`
  - `testSkill(agentSkillId)` — invoke `execute-skill` edge function with `trigger_type: 'dry_run'`
  - `listExecutions(agentId, filters)` — query `skill_executions` with join to `skill_definitions(name, icon)`, filtered by agent_id, optional status/date filters, ordered by created_at DESC, limit 100
  - `cancelExecution(executionId)` — update `skill_executions` set status = 'cancelled' where status = 'pending'
  - `createScheduledAction(agentSkillId, scheduleConfig)` — insert into `scheduled_actions` with action_type = 'execute_skill'

## Phase 3.6: Frontend — Skills Tab UI

- [x] T015 Create `src/pages/agent-detail/skills-tab.js` — Skills tab mixin
  - Export `skillsTabMethods` object with methods mixed into AgentDetailPage prototype
  - `renderSkillsTab()` — main render function returning HTML string with:
    - Category filter buttons (All, Sales, Support, Operations, Marketing, Research)
    - Skill cards grid: each card has icon, name, description, category badge, enable/disable toggle, "Configure" button (shown when enabled), status line ("Enabled — Daily at 9:00 AM" or "Disabled")
    - Integration warning badges for skills requiring unconnected integrations (check `user_integrations` table)
    - Agent type filtering: only show skills matching current agent's type (voice/text/chat)
    - Execution History section below cards: table with columns (Skill, Trigger, Status badge, Time, Actions)
    - Status filter dropdown (All, Completed, Failed, Pending)
  - `renderSkillConfigModal(skillDefinition, agentSkill)` — configuration modal using `contact-modal-*` pattern:
    - Header: skill name
    - Body sections: Trigger (event type picker or schedule builder), Delivery (channel checkboxes with channel-specific config like Slack channel picker), Parameters (dynamically generated from config_schema — text inputs, number inputs, checkboxes, selects, textarea for templates), Consent toggle (for outbound skills)
    - Footer: Cancel, Test (dry run), Save
  - `attachSkillsListeners()` — event delegation for:
    - Toggle enable/disable → call enableSkill/disableSkill
    - Configure button → show modal
    - Save config → call updateSkillConfig + createScheduledAction if schedule type
    - Test button → call testSkill, show preview in modal
    - Category filter clicks
    - Execution history expand/cancel
  - `renderExecutionHistoryRow(execution)` — single row with status badge (green/yellow/red), skill name, trigger type, timestamp, expandable delivery details

- [x] T016 Integrate Skills tab into `src/pages/agent-detail/index.js`
  - Import `skillsTabMethods` from `./skills-tab.js`
  - `Object.assign(AgentDetailPage.prototype, skillsTabMethods)`
  - Add `<button class="agent-tab" data-tab="skills">Skills</button>` between Functions and Notifications tabs (both desktop tabs and mobile dropdown)
  - Add `case 'skills': return this.renderSkillsTab()` to `switchTab()`/`renderTab()` method
  - Ensure `attachSkillsListeners()` is called after tab renders

## Phase 3.7: Implementation Additions (built during session, not in original plan)

- [x] T017a CRM field mapping row builder UI
  - Left dropdown: agent's `dynamic_variables` (fetched from DB)
  - Right dropdown: HubSpot contact properties (fetched via `hubspot_list_contact_properties` mcp-execute tool)
  - Add/remove rows, duplicate validation on save
  - Fallback to common default fields when HubSpot API unavailable

- [x] T017b Cal.com OAuth fixes
  - Fixed redirect URI to use `API_URL` (`https://api.magpipe.ai`) instead of raw `SUPABASE_URL`
  - Fixed scope format: Cal.com requires separate query params per scope (not space/comma-joined)
  - Added token refresh in `mcp-execute` for Cal.com (client_id + optional client_secret)
  - Callback stores name/email in `user_integrations.config`
  - `cal-com-disconnect` auto-disables dependent skills

- [x] T017c Cal.com event type picker
  - `cal_com_list_event_types` tool in mcp-execute with token refresh
  - Checkbox UI in appointment reminder config modal
  - Handler filters bookings by selected event type IDs

- [x] T017d Appointment reminder full pipeline
  - `checkAppointmentReminders` in `process-scheduled-actions` cron
  - Handler: Cal.com polling, dedup via `skill_executions.trigger_context.booking_uid`, SMS/voice delivery

- [x] T017e Social Media Monitoring — 6 platforms
  - Serper API with `site:` filters for Reddit, HN, Google, X, LinkedIn, Facebook
  - Tested: 20+ mentions found across platforms

- [x] T017f Skills config UX improvements
  - Enable-on-save flow (toggle → config modal → save enables)
  - `enableSkill` uses UPSERT (handles re-enable after disable)
  - Single-trigger skills: hide trigger picker, show schedule config for schedule skills
  - Connected integration display (green badge with account name)
  - Enum array checkboxes (platforms)
  - Slack channel dropdown + optional email input in delivery channels
  - Modal overflow fix (scrollable body, fixed header/footer)
  - Confirm modal z-index fix (above skill config modal)

- [x] T017g `API_URL` shared config
  - Added to `_shared/config.ts` with fallback to `SUPABASE_URL`
  - Set as Supabase secret
  - Used by OAuth start/callback functions

## Phase 3.8: Tests

- [ ] T018 [P] Create unit tests at `tests/unit/skills.test.js`
  - Test `resolveTemplate()`: basic replacement, missing variables → empty string, special characters
  - Test skill config validation: required fields, consent toggle, schedule_config format
  - Test execution state transitions: pending→running→completed, pending→running→failed→pending (retry)

- [ ] T019 [P] Create E2E tests at `tests/e2e/skills.spec.js`
  - Test: Navigate to agent detail → Skills tab renders with 7 skill cards
  - Test: Enable skill → config modal opens → save → skill enabled
  - Test: Disable skill → toggle off → confirmed disabled
  - Test: Dry run → preview appears
  - Test: Category filter shows/hides correct skills
  - Test: Integration-required skills show warning when not connected

## Phase 3.9: Deployment & Validation

- [x] T020 Deploy all edge functions to prod
- [x] T021 Update `ARCHITECTURE.md` with Skills Framework section
- [ ] T022 Merge `007-magpipe-agent-skills` to master and deploy frontend via Vercel
- [ ] T023 Run quickstart.md validation steps manually

## Phase 4: Follow-on Actions

### 4.1 Production Readiness
- [ ] Merge `007-magpipe-agent-skills` to master
- [ ] Deploy frontend via `npx vercel --prod` (from master, NOT feature branch)
- [ ] Verify skills tab loads on production
- [ ] Test end-to-end: enable skill → configure → save → verify cron fires → check execution history

### 4.2 Post-Call Follow-Up — Wire to Voice Agent
- [ ] Voice agent `on_call_end()` calls `execute-skill` with `event_type: 'call_ends'`
- [ ] Pass full trigger context: `caller_phone`, `caller_name`, `call_duration_seconds`, `call_summary`, `extracted_data`
- [ ] Test: make a call → verify follow-up SMS sent after configured delay
- [ ] Auto-CRM Update also triggers on `call_ends` — test HubSpot contact update after call

### 4.3 Cal.com Token Refresh Everywhere
- [ ] Appointment reminder handler needs token refresh (currently only in `mcp-execute`)
- [ ] Extract shared `refreshCalComToken(supabase, integration)` to `_shared/cal-com-helpers.ts`
- [ ] Use in: `mcp-execute`, `appointment-reminder.ts`, `cal-com-get-slots`, `cal-com-create-booking`

### 4.4 Delivery Improvements
- [ ] Slack delivery: use selected channel from `delivery_channels[].channel_name` (currently ignored in `deliverResults`)
- [ ] Email delivery: use `to_email` from config instead of always sending to account email
- [ ] Voice call delivery: implement actual outbound call via `initiate-bridged-call` with reminder script as agent context
- [ ] Push notification delivery channel

### 4.5 Execution History UX
- [ ] Show execution result details in expandable row (click to see full summary, delivery status)
- [ ] Retry button for failed executions
- [ ] Filter by skill name
- [ ] Pagination for large execution history

### 4.6 Skill-Specific Improvements
- [ ] **Competitor Monitoring**: Currently uses Serper — add actual page content diffing with LLM summary
- [ ] **Daily News Digest**: Add LLM-generated executive summary instead of raw search results
- [ ] **Review Request**: Wire to cron, query recent callers, respect `min_days_since_last_request`
- [x] **Social Media Monitoring**: Removed Facebook (zero Google indexing), added domain filtering for X/LinkedIn results, removed auth requirements for X/LinkedIn (Serper needs no auth)
- [ ] **Appointment Reminder**: Show next reminder time on skill card status line

### 4.7 New Skills to Add
- [ ] **Lead Scoring**: Score inbound calls/contacts based on extracted data and conversation quality
- [ ] **Missed Call Follow-Up**: Auto-SMS when a call goes unanswered
- [ ] **Weekly Summary Report**: Aggregate call/message stats delivered to Slack/email
- [ ] **Custom Webhook Skill**: User-defined HTTP POST triggered on events (generic integration point)

### 4.8 Admin / Multi-tenant
- [ ] Skill definitions management in admin panel (add/edit/disable skills)
- [ ] Per-plan skill limits (free tier gets 2 skills, pro gets all 7, etc.)
- [ ] Execution billing: deduct credits per skill execution
- [ ] Rate limiting: max executions per hour per skill

---

## Dependencies

```
T001 (migration) ← blocks everything else
T002 (execute-skill) ← depends on T001, T003
T003 (handler interface) ← depends on T001
T004 (template util) ← depends on T003
T005-T011 (handlers) [P] ← depend on T003, T004
T012 (scheduled-actions ext) ← depends on T002
T013 (voice agent hook) ← depends on T002
T014 (API helpers) ← depends on T001
T015 (skills tab) ← depends on T014
T016 (tab integration) ← depends on T015
T017-T018 (tests) [P] ← depend on T004 (unit), T016 (E2E)
T019-T020 (deploy) ← depend on T002, T012
T021 (validation) ← depends on all above
T022 (docs) ← depends on T021
```

## Parallel Execution Groups

```
# Group 1: After T003 + T004 complete — all 7 handlers are independent
T005, T006, T007, T008, T009, T010, T011

# Group 2: After T002 complete — these are independent of each other
T012, T013

# Group 3: After T016 complete — tests are independent
T017, T018

# Group 4: After all implementation — deploy + validate
T019, T020
```

## Validation Checklist

- [x] All 3 entities (skill_definitions, agent_skills, skill_executions) have model tasks (T001)
- [x] All contracts have corresponding implementation (T002 execute-skill, T012 scheduled-actions, T013 voice agent, T014 API helpers)
- [x] All 7 skill handlers have individual tasks (T005-T011)
- [x] Tests specified (T017 unit, T018 E2E)
- [x] Parallel tasks truly independent (handlers touch different files, tests touch different files)
- [x] Each task specifies exact file paths
- [x] No [P] task modifies the same file as another [P] task
- [x] Quickstart validation included (T021)
- [x] Documentation update included (T022)
