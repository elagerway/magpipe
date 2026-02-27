# Implementation Plan: SMS Routing Fix & Loop Detection

**Branch**: `master` | **Date**: 2026-02-27 | **Status**: COMPLETED

## Summary

Three related SMS reliability fixes: (1) voice agents can no longer handle inbound SMS — only `agent_type = 'text'` agents are routed; (2) content-based loop detection automatically breaks bot-to-bot reply loops; (3) unassigned numbers send an auto-reply exactly once per sender, then stay silent.

## Technical Context

**Language/Version**: TypeScript (Deno / Supabase Edge Functions)
**Primary File**: `supabase/functions/webhook-inbound-sms/index.ts`
**Storage**: PostgreSQL (Supabase) — `sms_messages`, `agent_configs`, `service_numbers`
**Testing**: Manual webhook simulation via curl (POST to edge function)
**Target Platform**: Supabase Edge Functions (serverless)

## Root Cause Analysis

### Bug 1: Voice Agent Handling SMS
`webhook-inbound-sms` used `serviceNumber.text_agent_id || serviceNumber.agent_id` for agent selection. When no text agent was explicitly assigned, it fell back to the voice agent (`agent_id`). Voice agents (Amy, etc.) then responded to SMS with AI replies — wrong agent type, wrong channel.

### Bug 2: No Loop Protection
When a business number's auto-responder replied to an agent's outbound SMS, the agent would respond again, triggering another auto-reply, creating an infinite loop. 290+ messages were exchanged in one incident before manual intervention. No content or velocity guard existed.

### Bug 3: Unassigned Numbers Reply Repeatedly
Numbers with no text agent configured would send the auto-reply "This number is not currently assigned to an agent" on every inbound message from the same sender, which could itself trigger loops.

## Files Modified

| File | Change |
|------|--------|
| `supabase/functions/webhook-inbound-sms/index.ts` | Agent selection rewrite, `isContentLoop()`, one-time auto-reply guard |

## Implementation Details

### Fix 1: Text-Only Agent Routing

Removed `|| serviceNumber.agent_id` fallback. New three-step selection — all queries filter `agent_type = 'text'`:

```typescript
// 1. Explicit text agent assigned to this number
if (serviceNumber.text_agent_id) { ... .eq('agent_type', 'text') }

// 2. Default text agent for this user
.eq('agent_type', 'text').eq('is_default', true)

// 3. Any text agent for this user
.eq('agent_type', 'text').order('created_at', { ascending: true }).limit(1)
```

If no text agent is found at any level, falls through to the system agent / no-agent path.

### Fix 2: Content-Based Loop Detection

```typescript
async function isContentLoop(supabase, from, to, body): Promise<boolean> {
  const normalized = body.trim().toLowerCase()
  // Query last 20 inbound messages from this sender in this conversation
  // Count how many match the current body exactly
  // If > 2 matches → loop detected
  return matchCount > 2
}
```

Called AFTER logging the inbound message (so count is accurate), BEFORE `processAndReplySMS`. Automatically resumes when sender sends a different message — no manual reset needed.

### Fix 3: One-Time Auto-Reply

```typescript
// Check if we've ever replied to this sender on this number
const { count } = await supabase.from('sms_messages')
  .select('id', { count: 'exact', head: true })
  .eq('sender_number', to)
  .eq('recipient_number', from)
  .eq('direction', 'outbound')

if ((count ?? 0) === 0) {
  sendSMS(..., autoReply, ...)  // Send once
} else {
  // Stay silent — already replied
}
```

## Two Agent Types in Production

| `agent_type` | Handles Calls | Handles SMS |
|---|---|---|
| `inbound_voice` | ✅ | ❌ Never |
| `text` | ❌ | ✅ |

## Testing

```bash
# Test one-time auto-reply (system-agent number: +15878569001)
# Message 1 → auto-reply sent, logged as outbound
# Message 2 → logged as inbound only, no reply
curl -X POST ".../webhook-inbound-sms" \
  -d "To=%2B15878569001&From=%2B16045628647&Body=Hello&MessageSid=TEST_001"
```

Verified via `sms_messages` table: first message creates outbound row, second does not.

## Progress Tracking

- [x] Root cause identified (Amy voice agent responding to SMS)
- [x] Fix 1: Text-only agent routing (remove agent_id fallback)
- [x] Fix 2: Content-based loop detection (`isContentLoop`)
- [x] Fix 3: One-time auto-reply guard
- [x] Deployed and verified

## Commits

- `a64d4ad` — Fix SMS loop + voice agent routing + function-call fillers
