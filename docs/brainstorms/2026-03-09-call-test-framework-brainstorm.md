---
date: 2026-03-09
topic: call-test-framework
---

# Call Test Framework

## What We're Building

A full-stack call testing framework that lets teams (and API customers) define test cases against their Magpipe agents, fire real calls, collect logs from all layers of the stack (SignalWire, LiveKit, Render), run pass/fail assertions, and get AI-generated diagnosis + proposed fixes when something breaks.

Tests can simulate a human caller three ways: silent (just verifies agent speaks), scripted (TTS plays predefined phrases), or using another Magpipe agent as the caller. Tests are charged against the org's credit balance like regular calls.

## Why This Approach

Rather than mocking the call stack, we fire real calls to real agents through the full SignalWire → LiveKit → Python agent path. This means test failures reflect actual production issues, not test harness gaps. The "test caller" is just another SignalWire number we control, with behaviour defined per test case.

---

## Architecture

### DB Tables

**`test_suites`** — groups of related tests
- `id`, `org_id`, `name`, `description`, `created_by`, `created_at`

**`test_cases`** — individual test definitions
- `id`, `suite_id`, `org_id`, `name`, `description`
- `type`: `inbound_call` | `outbound_call` | `agent_to_agent`
- `agent_id` — the agent under test
- `caller_mode`: `silent` | `scripted` | `agent`
- `caller_agent_id` — if `caller_mode=agent`, the agent that plays the human
- `caller_script` — array of TTS phrases for scripted mode (played in order)
- `expected_phrases` — must appear in transcript (substring match)
- `prohibited_phrases` — must NOT appear in transcript
- `expected_functions` — custom function names that must be invoked
- `min_duration_seconds`, `max_duration_seconds`

**`test_runs`** — execution records
- `id`, `test_case_id`, `org_id`
- `triggered_by`: `user_id` | `api` | `scheduled`
- `status`: `pending` | `running` | `passed` | `failed` | `error`
- `call_record_id` — FK to `call_records`
- `started_at`, `completed_at`
- `logs` JSONB — aggregated from SignalWire, LiveKit, Render
- `assertions` JSONB — per-assertion results with pass/fail + detail
- `ai_analysis` text — LLM diagnosis
- `ai_proposed_fixes` JSONB — structured list of suggested fixes
- `credits_charged` — actual credits consumed

---

### Call Flow by Test Type

**`inbound_call`**
1. `run-test` fires a SignalWire call FROM our test number TO the agent's service number
2. Normal inbound webhook path → LiveKit SIP trunk → agent joins
3. Test number answers and behaves per `caller_mode`
4. After call ends → collect logs → run assertions

**`outbound_call`**
1. `run-test` calls `initiate-bridged-call` targeting our test number as destination
2. Agent makes outbound call through conference bridge
3. Test number answers per `caller_mode`
4. After call ends → collect logs → run assertions

**`agent_to_agent`**
1. `run-test` fires inbound call to Agent A's number
2. Agent A (the caller agent, `caller_mode=agent`) responds naturally
3. If Agent A has a transfer function, can test full transfer flows to Agent B
4. Both agent conversations collected in logs + assertions

---

### Test Caller Modes

- **`silent`** — test number answers, says nothing. Verifies agent speaks first, handles silence, doesn't drop call.
- **`scripted`** — test number plays `caller_script` phrases via TTS (ElevenLabs or SignalWire TTS), one per turn. Good for verifying agent responses to specific inputs.
- **`agent`** — test number routes to a real Magpipe agent with a caller persona (e.g. "You are a customer asking about pricing"). Full natural conversation, AI-evaluated quality.

---

### Log Aggregation

Collected after call completes (30s delay for stragglers), stored in `test_runs.logs`:

```json
{
  "signalwire": [...],   // webhook-call-status events tagged with test_run_id
  "livekit": [...],      // room events, participant events via LiveKit API
  "render": [...],       // Python agent stdout/stderr via Render Logs API
  "edge_functions": [...] // Supabase function logs for the call window
}
```

Tag call with `test_run_id` in metadata so logs can be filtered post-hoc.

---

### Assertions Engine

After logs collected, run assertions in order:

| Assertion | Source | Pass condition |
|---|---|---|
| Call connected | SignalWire | `call-status: completed`, not `no-answer` or `failed` |
| Agent joined | LiveKit | Participant with agent name joined room |
| Expected phrases | Transcript | Each phrase found as substring (case-insensitive) |
| Prohibited phrases | Transcript | No phrase found |
| Expected functions | call_records.custom_function_calls | Each function name present |
| Min/max duration | call_records | Duration within range |
| No errors | All logs | No `error` level entries |

---

### AI Analysis

Triggered automatically on failure; available on-demand for any run.

Edge function `test-ai-analyze`:
1. Pulls full test run (test case config + logs + assertion results)
2. Sends to `claude-sonnet-4-6` with structured prompt
3. LLM returns:
   - Root cause assessment per failed assertion
   - Specific proposed fixes (edge function names, code changes, config changes)
   - Confidence level (high/medium/low)
4. Stored in `test_runs.ai_analysis` + `test_runs.ai_proposed_fixes`

---

### Edge Functions

| Function | Auth | Purpose |
|---|---|---|
| `test-cases` | resolveUser | CRUD test suites + cases |
| `run-test` | resolveUser | Fire a test run, charge credits |
| `test-runs` | resolveUser | List/get test runs |
| `test-log-collector` | service role | Aggregate logs after call ends (called by webhook-call-status) |
| `test-ai-analyze` | resolveUser + admin | LLM analysis of a test run |

---

### Billing

- Test calls flow through the same billing path as regular calls
- `call_records` gets `test_run_id` column → credits deducted as normal
- `test_runs.credits_charged` mirrors the actual deduction
- API customers see test call costs in their usage history

---

### Admin UI (`/admin` → Tests tab)

- All orgs, all suites, all runs
- Fire any test, see live status
- AI analysis panel inline
- Bulk re-run failed tests

### Customer UI (`/tests` page)

- Their org only
- Create suites + cases, run tests, view history
- AI analysis (charged as credit usage)

### API

```
POST /functions/v1/test-cases?action=create_suite
POST /functions/v1/test-cases?action=create_case
POST /functions/v1/run-test                         # fires a run
GET  /functions/v1/test-runs?suite_id=...
GET  /functions/v1/test-runs?id=...
POST /functions/v1/test-ai-analyze                  # on-demand analysis
```

---

## Key Decisions

- **Real calls, not mocks** — tests run through the full production path. More complex, but catches real issues.
- **Test number is a real SignalWire number** — one dedicated test number per Magpipe env (not per customer)
- **Log aggregation is async** — `test-log-collector` fires 30s after call ends to ensure all webhooks have landed
- **Credits charged like normal calls** — no separate pricing tier, customers pay for what they use
- **AI analysis is on-demand + auto** — auto on failure, manual button otherwise

## Open Questions

- Do we need a dedicated test SignalWire number, or can we reuse any system number?
- Should scheduled tests be supported in v1 (cron-triggered), or defer to v2?
- Render logs API requires a Render API key — where does this secret live?

## Next Steps

→ `/plan` to generate implementation tasks
