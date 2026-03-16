# get-call 404 Investigation

## Symptom

Starting 2026-03-09, the `get-call` edge function logged a steady stream of 404 responses — 4 requests every ~60 seconds, indefinitely.

## What We Found

| Property | Value |
|----------|-------|
| API key | **"Test Framework Runner"** (created 2026-03-09 22:13 UTC) |
| Auth method | `api_key` |
| User-agent | `node` |
| Source IP | `3.234.209.239` (AWS EC2, us-east-1 / Ashburn VA) |
| Call IDs used | `test-skills-fire-001`, `test-sheets-004`, `test-session-sim-002` |
| Last seen | 2026-03-09 22:58 UTC |

The requests were POST calls to `get-call` with hardcoded string IDs (not UUIDs). Because `call_records.id` is a UUID column, these never match any row — hence the perpetual 404.

## Root Cause

During the test framework build (2026-03-09), Claude was instructed to test the feature using agents/tools. It:

1. Created an API key named "Test Framework Runner"
2. Wrote a Node.js script that polled `get-call` every ~60s to check test scenario results
3. Deployed or ran the script on Vercel (Vercel uses AWS Lambda in us-east-1, matching the source IP)
4. The script used named scenario IDs (`test-skills-fire-001` etc.) instead of real UUIDs, so it always 404'd

The script was not committed to this repo. No matching code was found in:
- `src/` (frontend)
- `supabase/functions/` (edge functions)
- `scripts/` (local scripts)
- `agents/` (Python voice agent)
- `.github/` (CI workflows)
- `vercel.json` (no `crons` key)
- Render (no Magpipe cron jobs — only the voice agent web service)

## Fix Applied (2026-03-10)

Deactivated the "Test Framework Runner" API key in the `api_keys` table:

```sql
UPDATE api_keys SET is_active = false WHERE id = 'd5028306-ec18-42c6-8b8b-bfa2a852cc70';
```

Any further requests from the script now receive **401 Unauthorized** rather than hitting the database.

## Where the Script Is Running — Unknown

Searched exhaustively:

| Location | Result |
|----------|--------|
| `src/` frontend | No `get-call` references |
| `supabase/functions/` | No cross-calls to `get-call` |
| `scripts/` | No matching script |
| `agents/` Python agent | No `get-call` or API calls |
| `.github/workflows/` | Only `sync-area-codes.yml` |
| `vercel.json` | No `crons` key |
| Vercel dashboard → Crons | No crons (dashboard shows "create" prompt when empty — confirmed no crons) |
| Render | No Magpipe cron jobs (only voice agent web service) |
| All `*.json` files in repo | Only hit: `docs/mint.json` nav entry — not relevant |

Source IP (`3.234.209.239`, AWS us-east-1) and `node` user-agent point to a Node.js script running on some AWS-backed service — but not Vercel (no crons configured there) and not Render. Likely created by Claude in a previous session and run as a one-off on a service not tracked in this repo (e.g. Railway, Fly.io, AWS Lambda/EventBridge, or a cloud shell).

Since the API key is revoked, the script cannot access any data regardless of where it runs.

## Lessons

- When asking Claude to "test" a new feature using agents, it may create API keys and polling scripts that outlive the session
- Named test scenario IDs (non-UUIDs) will always 404 against UUID-typed DB columns
- The "Test Framework Runner" key name is a reliable signal — future sessions should check for and clean up keys with this naming pattern after test framework work
