# Magpipe Call Test Framework

> Status: Spec — not yet implemented

## Overview

A full-stack call testing framework for validating agent behaviour through real call flows. Tests fire actual SignalWire calls, run through LiveKit and the Python voice agent, collect logs from all layers, evaluate pass/fail assertions, and surface AI-generated diagnosis when something fails.

Available to:
- **Admin** — full access, all orgs, all tests
- **API customers** — scoped to their org, charged per test call

---

## Core Concepts

### Test Suite
A named group of related test cases (e.g. "Booking Agent — Regression Suite").

### Test Case
A single test definition:
- Which agent to test
- What type of call to make (inbound / outbound / agent-to-agent)
- How the simulated caller behaves (silent / scripted / another agent)
- What assertions to evaluate after the call

### Test Run
One execution of a test case. Produces:
- Real call record (billed to org)
- Aggregated logs from SignalWire, LiveKit, Render
- Per-assertion pass/fail results
- AI analysis (auto on failure, on-demand otherwise)

---

## Test Types

### `inbound_call`
Simulates a caller dialling the agent's number.

Flow:
1. Magpipe dials the agent's service number FROM our dedicated test number
2. SignalWire routes to agent via normal inbound webhook
3. LiveKit SIP trunk → Python agent joins the room
4. Test number behaves per `caller_mode`

### `outbound_call`
Simulates the agent placing an outbound call.

Flow:
1. `initiate-bridged-call` triggered targeting our test number
2. Conference bridge established — agent SIP leg first
3. Test number answers per `caller_mode`

### `agent_to_agent`
Two agents in a real conversation — one plays the "caller", the other is the agent under test. Used to test agent-to-agent handoff flows.

---

## Caller Modes

### `silent`
Test number answers and says nothing. Verifies:
- Agent speaks first
- Agent handles silence gracefully
- Call doesn't drop unexpectedly

### `scripted`
Test number plays a defined list of TTS phrases in sequence, one per conversation turn. Each phrase triggers after the agent finishes speaking (silence detection).

Config:
```json
{
  "caller_script": [
    "Hi, I'd like to book an appointment for next Tuesday",
    "Yes, 2pm works for me",
    "My name is John Smith"
  ]
}
```

### `agent`
Test number routes to a real Magpipe agent configured with a caller persona. Full natural conversation. Useful for regression testing complex flows.

Config:
```json
{
  "caller_agent_id": "uuid-of-caller-agent"
}
```
The caller agent's system prompt defines the persona (e.g. "You are a customer calling to enquire about pricing. Ask about the Pro plan. After getting pricing, say goodbye and end the call.").

---

## Assertions

Evaluated after call ends and logs are collected. All assertions defined per test case.

| Assertion | Type | Config |
|---|---|---|
| Call connected | Automatic | Always checked |
| Agent joined | Automatic | Always checked |
| Expected phrases | Transcript | `expected_phrases: string[]` |
| Prohibited phrases | Transcript | `prohibited_phrases: string[]` |
| Expected functions | Call record | `expected_functions: string[]` |
| Min duration | Call record | `min_duration_seconds: number` |
| Max duration | Call record | `max_duration_seconds: number` |
| No errors | All logs | Always checked |

Phrase matching is case-insensitive substring match against the full call transcript.

Function matching checks `call_records.custom_function_calls` JSONB array for function name presence.

---

## Log Aggregation

Logs are collected ~30 seconds after call ends (to allow all webhooks to land). Stored in `test_runs.logs`:

```json
{
  "signalwire": [
    { "event": "call.completed", "duration": 45, "status": "completed", ... }
  ],
  "livekit": [
    { "event": "participant_joined", "identity": "agent", "timestamp": "..." },
    { "event": "participant_left", "identity": "agent", "timestamp": "..." }
  ],
  "render": [
    { "level": "info", "message": "Agent joined room outbound-...", "timestamp": "..." },
    { "level": "error", "message": "...", "timestamp": "..." }
  ],
  "edge_functions": [
    { "function": "webhook-inbound-call", "level": "info", "message": "...", "timestamp": "..." }
  ]
}
```

---

## AI Analysis

### Automatic
Every failed test run triggers `test-ai-analyze` automatically after assertions are evaluated.

### On-demand
"Analyze" button available on any test run (passed or failed). Sends fresh analysis request.

### Output
```json
{
  "root_cause": "The agent did not join the LiveKit room within 8s of call connect. SignalWire delivered the inbound webhook but the SIP INVITE to LiveKit timed out.",
  "confidence": "high",
  "proposed_fixes": [
    {
      "title": "Check LiveKit SIP trunk configuration",
      "description": "Verify LIVEKIT_SIP_TRUNK_ID is set and the trunk includes the agent's service number.",
      "file": "supabase/functions/_shared/livekit-sip.ts",
      "action": "inspect"
    },
    {
      "title": "Check Render agent health",
      "description": "Render logs show the agent process restarted at 14:23 UTC — 2 minutes before the test. Agent may have been cold-starting.",
      "action": "monitor"
    }
  ]
}
```

---

## Database Schema

```sql
-- Test suites (groups of test cases)
create table test_suites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  description text,
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);

-- Test cases
create table test_cases (
  id uuid primary key default gen_random_uuid(),
  suite_id uuid not null references test_suites(id) on delete cascade,
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  description text,
  type text not null check (type in ('inbound_call', 'outbound_call', 'agent_to_agent')),
  agent_id uuid references agent_configs(id) on delete set null,
  caller_mode text not null default 'silent' check (caller_mode in ('silent', 'scripted', 'agent')),
  caller_agent_id uuid references agent_configs(id) on delete set null,
  caller_script jsonb,                  -- string[] of TTS phrases
  expected_phrases jsonb,               -- string[]
  prohibited_phrases jsonb,             -- string[]
  expected_functions jsonb,             -- string[]
  min_duration_seconds integer,
  max_duration_seconds integer,
  schedule text,                        -- cron expression e.g. '0 9 * * 1' (optional)
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Global config (one row)
create table test_framework_config (
  id integer primary key default 1 check (id = 1),  -- singleton
  test_phone_number text,               -- SignalWire number used as test caller
  test_phone_number_sid text,           -- SignalWire SID for that number
  updated_by uuid references auth.users(id),
  updated_at timestamptz default now()
);

-- Test runs (executions)
create table test_runs (
  id uuid primary key default gen_random_uuid(),
  test_case_id uuid not null references test_cases(id) on delete cascade,
  org_id uuid not null references organizations(id) on delete cascade,
  triggered_by text not null,           -- user_id, 'api', or 'scheduled'
  status text not null default 'pending' check (status in ('pending','running','passed','failed','error')),
  call_record_id uuid references call_records(id) on delete set null,
  started_at timestamptz default now(),
  completed_at timestamptz,
  logs jsonb,                           -- aggregated from all sources
  assertions jsonb,                     -- per-assertion results
  ai_analysis text,
  ai_proposed_fixes jsonb,
  credits_charged integer default 0,
  error_message text
);
```

---

## Edge Functions

| Function | Auth | Purpose |
|---|---|---|
| `test-cases` | resolveUser | CRUD for suites and cases |
| `run-test` | resolveUser | Fire a test run, charge credits |
| `test-runs` | resolveUser | List and get test runs |
| `test-log-collector` | service role | Aggregate logs 30s after call ends |
| `test-ai-analyze` | resolveUser | Trigger/retrieve AI analysis |

All except `test-log-collector` are accessible via API key (resolveUser).

---

## Billing

Test calls are charged identically to regular calls:
- Per-minute rate against org credit balance
- `call_records` row created with `test_run_id` metadata
- Credits deducted via existing billing path
- `test_runs.credits_charged` mirrors the deduction
- Test costs appear in normal usage history

---

## API Reference

```
# Suites
POST   /functions/v1/test-cases  { action: "create_suite", name, description }
GET    /functions/v1/test-cases  ?action=list_suites
DELETE /functions/v1/test-cases  { action: "delete_suite", suite_id }

# Cases
POST   /functions/v1/test-cases  { action: "create_case", suite_id, ...config }
PATCH  /functions/v1/test-cases  { action: "update_case", case_id, ...config }
DELETE /functions/v1/test-cases  { action: "delete_case", case_id }
GET    /functions/v1/test-cases  ?action=list_cases&suite_id=...

# Runs
POST   /functions/v1/run-test    { test_case_id }
GET    /functions/v1/test-runs   ?suite_id=... | ?test_case_id=... | ?id=...

# Analysis
POST   /functions/v1/test-ai-analyze  { test_run_id }
```

---

## Admin UI

Location: `/admin` → Tests tab

Features:
- All orgs, all suites, all runs
- Fire any test, monitor live status
- Inline AI analysis panel
- Bulk re-run failed tests
- Filter by org, status, date

## Customer UI

Location: `/tests`

Features:
- Their org only
- Create / edit suites and cases
- Run tests manually
- View run history + assertions
- AI analysis per run
- Export run results (JSON)

---

## Decisions

1. **Test number** — provision one new SignalWire number the first time a test suite is created. Stored in a `test_framework_config` table (global, admin-editable). Users can change it in admin settings. Same number reused across all suites/orgs.
2. **Scheduled tests** — included in v1. Cron expression per test case (`schedule` column). `process-scheduled-actions` or a dedicated `process-scheduled-tests` cron worker fires due runs.
3. **Scripted caller SWML** — new edge function `test-caller-swml`. Receives the call on the test number, looks up the active test run, plays `caller_script` phrases via TTS one at a time using SignalWire's `<Say>` + `<Gather>` (silence detection between turns). Updates test run state as phrases are played.
4. **Render logs** — `RENDER_API_KEY` Supabase secret needed. Query `/v1/services/{id}/logs` filtered to the call's timestamp window.

---

## Implementation Order

1. DB migrations (`test_suites`, `test_cases`, `test_runs`, `test_framework_config`, RLS policies)
2. `test-cases` edge function (CRUD for suites + cases)
3. `run-test` edge function (fires call, creates run record, charges credits)
4. `test-caller-swml` edge function (scripted caller SWML handler)
5. `test-log-collector` edge function (async log aggregation — Supabase + LiveKit + Render)
6. Assertions engine (inside `test-log-collector`, runs after logs gathered)
7. `test-ai-analyze` edge function (LLM diagnosis + proposed fixes)
8. `test-runs` edge function (list/get runs)
9. Scheduled test cron worker (`process-scheduled-tests`)
10. Customer UI (`/tests` page)
11. Admin UI (Tests tab in `/admin`, config panel for test number)
12. Deploy script updates + API docs
