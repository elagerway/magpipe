# Code Review: Outbound Call API + Agent Number Assignment
**Date**: 2026-03-13
**Reviewer**: feature-dev:code-reviewer (automated)
**Scope**: `initiate-bridged-call`, `provision-phone-number`, `deployment-tab.js`, `agent.py`

---

## Context

Bug report from SiteSuper (erik@snapsonic.com) identified four issues with `initiate-bridged-call`:
1. `agent_id` in request body silently ignored — routing by service_numbers only
2. `outbound_system_prompt` in request body silently ignored
3. `metadata` not stored on call record
4. Silent failure (no agent, no error) when `caller_id` has no service_numbers assignment

Additionally: outbound voice agents could not be assigned phone numbers from the deployment tab UI.

---

## Round 1 — `initiate-bridged-call` rewrite + `agent.py` prompt override

### Issues Found

**1. Orphaned `call_record` on SIP leg failure** *(Confidence: 90 — Fixed)*
When agent SIP or PSTN leg failed, the function returned 500 immediately but left `call_record` at `status: 'in-progress'` indefinitely. The LiveKit room pre-creation (new) also leaked.
**Fix**: Added `update({ status: 'completed', disposition: 'failed', ended_at })` before returning on both leg failure paths.

**2. `bodyAgentId` silently overridden in slow-path fallback** *(Confidence: 85 — Fixed)*
If LiveKit room pre-creation failed (catch treated as non-fatal), agent.py took the slow path which injects `outbound_agent_id` from `service_numbers`, completely ignoring the caller-supplied `agent_id`. The `outbound_agent_id` override block in agent.py then fires unconditionally.
**Fix**: If `bodyAgentId` or `outbound_system_prompt` are provided and room creation fails, return 500 and close the call_record rather than silently degrading. Plain service_numbers calls (no overrides) still fall back gracefully.

### Outcome
- Commits: `978d730`, `6ae6570`
- All changes deployed to production

---

## Round 2 — `deployment-tab.js` outbound agent column fix

### Issues Found

**1. "Buy a Number" provisioning always writes to `agent_id`** *(Confidence: 95 — Fixed)*
The `provision-phone-number` edge function was called with a hardcoded `agent_id` key, always inserting into `agent_id` (inbound slot) regardless of agent type. Outbound voice agents provisioning a new number would get `agent_id` set instead of `outbound_agent_id` — appearing unassigned.
**Fix**: Frontend now passes `agent_type` in the provision request body. Edge function resolves the correct column (`text_agent_id`, `outbound_agent_id`, or `agent_id`) before insert.

### All 5 Instances Consistent
`assignNumber`, `detachNumber`, `showAssignNumbersModal`, `assignMultipleNumbers`, and `renderDeploymentTab` — all correctly updated.

### Outcome
- Commits: `dbec58a`, `147eaa7`
- All changes deployed to production

---

## Round 3 — `provision-phone-number` fallback bug

### Issues Found

**1. `body.agent_id` used raw instead of `assignAgentId` in text/outbound branches** *(Confidence: 90 — Fixed)*
The `text` and `outbound_voice` branches used `body.agent_id` directly rather than `assignAgentId` (which falls back to `SYSTEM_AGENT_ID`). If `agent_id` was falsy, `text_agent_id`/`outbound_agent_id` would be `null` but `agent_id` would still be `SYSTEM_AGENT_ID` — silently provisioning a number that routes nowhere for the stated agent type.
**Fix**: All three branches now use `assignAgentId` consistently.

### Outcome
- Commit: `df0d39f`
- Deployed to production

---

## Summary

| Issue | Severity | Status |
|-------|----------|--------|
| Orphaned call_record on leg failure | High | Fixed |
| bodyAgentId ignored when room creation fails | High | Fixed |
| Buy-a-Number always writes to agent_id | High | Fixed |
| text/outbound provision branches use raw body.agent_id | Medium | Fixed |

**Total commits**: 5
**Functions deployed**: `initiate-bridged-call`, `provision-phone-number`
**Agent deployed**: `agent.py` (Render auto-deploy on push to master)
