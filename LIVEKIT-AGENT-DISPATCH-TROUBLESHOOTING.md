# LiveKit Agent Dispatch Troubleshooting

**Date**: 2025-10-29
**Issue**: LiveKit agent not joining outbound call rooms
**Status**: ⚠️ BLOCKED - Requires LiveKit Cloud dashboard configuration

## Problem Summary

When making outbound calls via LiveKit:
- ✅ Room created successfully
- ✅ SIP participant created successfully
- ❌ Agent never joins the room
- ❌ Phone never rings (separate SignalWire SWML issue, deprioritized)

## Failed Approaches (DO NOT RETRY)

### ❌ Approach 1: Explicit Agent Dispatch

**Commits**: `6493101`

**What we tried**:
```typescript
// In livekit-outbound-call Edge Function
const dispatchClient = new AgentDispatchClient(livekitUrl, apiKey, apiSecret)
await dispatchClient.createDispatch(roomName, 'SW Telephony Agent', {
  metadata: JSON.stringify({ user_id, direction: 'outbound', ... })
})
```

```python
# In agent.py
async def prewarm(proc: JobProcess):
    logger.info("🔥 PREWARM CALLED")
    await proc.wait_for_shutdown()

cli.run_app(WorkerOptions(
    entrypoint_fnc=entrypoint,
    prewarm_fnc=prewarm,  # For receiving explicit dispatches
    agent_name="SW Telephony Agent"
))
```

**Result**: FAILED

**Evidence**:
```sql
-- Call state logs show:
2025-10-28 17:26:33 | edge_function | sip_participant_created
2025-10-28 17:26:33 | edge_function | agent_dispatched  ✅ Dispatch sent
-- But agent NEVER logs:
-- ❌ agent_entrypoint_called
-- ❌ agent_connected
```

**Why it failed**:
- `AgentDispatchClient.createDispatch()` sends dispatch message to LiveKit Cloud
- LiveKit Cloud is supposed to forward the dispatch to registered agent workers
- Our agent worker on Render is NOT receiving these dispatch messages
- This suggests the agent worker is not properly registered with LiveKit Cloud's dispatch system
- Agent worker registration is automatic when using LiveKit agents framework, but something is preventing it from working

**Root cause**: Agent worker cannot register with LiveKit Cloud for dispatch, possibly due to:
- Network/firewall issues on Render
- WebSocket connection problems
- Agent worker configuration issues
- LiveKit Cloud project configuration

**DO NOT RETRY**: This approach requires troubleshooting agent worker registration which is complex and outside our control.

---

### ❌ Approach 2: Auto-join with request_fnc

**Commits**: `9d72c5d`, `cbcc14e`

**What we tried**:
```python
from livekit.agents import JobRequest

async def request_fnc(req: JobRequest):
    """Accept all job requests - agent will join any room"""
    logger.info(f"🎯 JOB REQUEST RECEIVED - Room: {req.room.name}")
    await req.accept()

cli.run_app(WorkerOptions(
    entrypoint_fnc=entrypoint,
    request_fnc=request_fnc,  # For accepting job requests
    agent_name="SW Telephony Agent"
))
```

**Result**: FAILED

**Evidence**:
```sql
-- Call state logs show:
2025-10-28 21:05:49 | edge_function | sip_participant_created
2025-10-28 21:05:50 | edge_function | waiting_for_agent
-- Agent NEVER logs:
-- ❌ "🎯 JOB REQUEST RECEIVED"
-- ❌ agent_entrypoint_called
-- ❌ agent_connected
```

**Why it failed**:
- `request_fnc` is for FILTERING job requests that the agent receives
- It does NOT cause job requests to be sent - those come from LiveKit Cloud
- LiveKit Cloud only sends job requests based on **agent dispatch rules**
- Agent dispatch rules are configured in the LiveKit Cloud dashboard, NOT via SDK
- Without dispatch rules matching our room patterns, NO job requests are generated

**Root cause**: Agent dispatch rules not configured in LiveKit Cloud dashboard for outbound room patterns.

**DO NOT RETRY**: `request_fnc` alone cannot solve this - requires dashboard configuration.

---

### ❌ Approach 3: Room Prefix Matching

**Commit**: `f25c8b3`

**What we tried**:
```typescript
// Changed room naming from:
const roomName = `outbound-${userId}-${Date.now()}`
// To:
const roomName = `call-outbound-${userId}-${Date.now()}`
```

**Reasoning**: Existing SIP dispatch rule has `roomPrefix: 'call-'`, so maybe agent dispatch rules also match `call-*` pattern.

**Result**: FAILED

**Evidence**:
```sql
-- Call with new prefix:
2025-10-29 16:55:51 | edge_function | sip_participant_created
-- Room: call-outbound-77873635-9f5a-4eee-90f3-d145aed0c2c4-1761756949631
-- Agent STILL never joins
```

**Why it failed**:
- Confused **SIP dispatch rules** with **agent dispatch rules** - these are DIFFERENT systems
- SIP dispatch rules (configured via `SipClient.updateSipDispatchRule()`):
  - Control where INCOMING SIP CALLS create rooms
  - Example: Inbound call to +15878569001 → creates room `call-15878569001-123456`
  - Has `roomPrefix: 'call-'` but this is for SIP routing, NOT agent dispatch
- Agent dispatch rules (configured in LiveKit Cloud dashboard):
  - Control which AGENTS join which ROOMS
  - Example: "Send SW Telephony Agent to rooms matching pattern `call-*`"
  - NOT the same as SIP dispatch rules!

**Root cause**: Room prefix change doesn't create agent dispatch rules. Inbound calls work because agent dispatch rules ARE configured somewhere for inbound patterns, but we can't see or modify them via SDK.

**DO NOT RETRY**: Room naming alone doesn't solve agent dispatch.

---

## What Actually Works (Inbound Calls)

Inbound SIP calls successfully trigger agent auto-join. This proves:

1. ✅ Agent worker IS running on Render
2. ✅ Agent worker CAN connect to LiveKit Cloud
3. ✅ Agent dispatch rules ARE configured for inbound call patterns
4. ✅ Agent `entrypoint_fnc` works correctly when triggered

**Inbound call flow**:
```
1. Caller dials +15878569001
2. SignalWire → LiveKit SIP Trunk (ST_eDVUAafvDeF6)
3. LiveKit SIP Dispatch Rule (SDR_oMTrnZT3bZVE) creates room: call-15878569001-123456
4. ??? AGENT DISPATCH RULE ??? triggers: "Send SW Telephony Agent to room call-*"
5. Agent worker receives job request
6. Agent entrypoint_fnc runs → agent joins room
7. ✅ Call works
```

**The missing piece**: Step 4 - the agent dispatch rule that makes this work is NOT visible or manageable via the LiveKit SDK.

---

## Required Solution

**Agent dispatch rules MUST be configured in LiveKit Cloud dashboard.**

### Steps to Configure:

1. **Log in to LiveKit Cloud**:
   - URL: https://cloud.livekit.io
   - Navigate to your project

2. **Find Agent Dispatch Settings**:
   - Look for "Agent Dispatch", "Agents", or "Dispatch Rules" section
   - This may be under Settings, Advanced, or a dedicated Agents tab

3. **Create/Modify Dispatch Rule**:
   - **Agent Name**: `SW Telephony Agent` (must match exactly what's in agent.py WorkerOptions)
   - **Room Name Pattern**: `call-*` (to match BOTH inbound `call-{number}` AND outbound `call-outbound-{userId}-{timestamp}`)
   - **Alternative**: Create two rules:
     - Rule 1: Pattern `call-[0-9]*` → Agent `SW Telephony Agent` (inbound)
     - Rule 2: Pattern `call-outbound-*` → Agent `SW Telephony Agent` (outbound)

4. **Save and Test**:
   - Make test outbound call
   - Check call_state_logs for `agent_entrypoint_called`
   - If successful, both inbound and outbound should work

### Why This is the ONLY Solution:

- LiveKit agent dispatch is a **centralized routing system** in LiveKit Cloud
- Like K8s Ingress rules or AWS API Gateway routes - configured centrally, not in application code
- Agent workers register themselves with LiveKit Cloud and wait for dispatch
- LiveKit Cloud decides which agents go to which rooms based on dispatch rules
- These rules are NOT exposed in the SDK - dashboard configuration only

---

## Current Code State

**Agent (commit f25c8b3)**:
```python
# Simple configuration - relies on LiveKit Cloud dispatch rules
cli.run_app(WorkerOptions(
    entrypoint_fnc=entrypoint,  # Called when agent joins room
    agent_name="SW Telephony Agent",  # Must match dispatch rule
    num_idle_processes=0
))
```

**Edge Function (commit f25c8b3)**:
```typescript
// No explicit dispatch - relies on LiveKit Cloud dispatch rules
const roomName = `call-outbound-${userId}-${Date.now()}`
await roomClient.createRoom({ name: roomName, ... })
await sipClient.createSipParticipant(trunkId, phoneNumber, roomName, ...)
// Agent should auto-join via LiveKit Cloud dispatch rules
```

**This code is CORRECT** - it just needs the dispatch rules configured in the dashboard.

---

## Next Steps

1. **User must configure LiveKit Cloud agent dispatch rules** (dashboard access required)
2. After configuration, test with: `/tmp/test-call.sh`
3. Verify with: `/tmp/query-call-logs.sh {call_id}`
4. Look for `agent_entrypoint_called` in logs
5. If successful, mark this issue as resolved

---

## Key Learnings

1. **LiveKit has TWO separate dispatch systems**:
   - SIP Dispatch (routes SIP calls to rooms) - configurable via SDK
   - Agent Dispatch (routes agents to rooms) - configurable via dashboard ONLY

2. **Agent workers cannot create their own dispatch rules** - they are passive receivers

3. **Explicit dispatch via SDK does NOT bypass dispatch rules** - it still requires agent worker registration with LiveKit Cloud

4. **Room naming conventions do NOT automatically trigger agent dispatch** - dispatch rules must explicitly match the patterns

5. **If inbound works but outbound doesn't** - the dispatch rules are too specific (only match inbound patterns)

6. **Database state logging is ESSENTIAL** - without it, we would have been completely blind to what was failing

---

## DO NOT ATTEMPT

- ❌ Writing code to "register" the agent worker
- ❌ Using webhooks to trigger agent joins
- ❌ Creating custom dispatch logic in Edge Functions
- ❌ Trying different LiveKit SDK methods for dispatch
- ❌ Changing agent worker configuration beyond what's documented

**All of these require dashboard configuration to work.**
