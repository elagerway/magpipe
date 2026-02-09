# SMS vs Call Communication Type Design

## Problem Statement

The LiveKit voice agent doesn't know whether it's handling a **voice call** or **SMS text message**. This causes the agent to respond inappropriately:

- **SMS context**: Agent might reference "calling" or "speaking" when user is texting
- **Call context**: N/A - currently only used for voice calls via SIP
- **System prompt**: Single prompt used for both contexts without adaptation

## Current Architecture

### Voice Calls (LiveKit Agent)
- **Entry point**: `webhook-inbound-call` → LiveKit SIP → `agent.py`
- **Communication**: Real-time voice via SIP/WebRTC
- **Agent behavior**: Voice conversation with transfer tools, voicemail, etc.
- **Data storage**: `call_records` table
- **Prompt source**: `agent_configs.system_prompt`

### SMS Messages
- **Entry point**: `webhook-inbound-sms` → OpenAI API (direct)
- **Communication**: Asynchronous text messages
- **Agent behavior**: Brief text responses (1-2 sentences)
- **Data storage**: `sms_messages` table
- **Prompt adaptation**: Line 210-212 of `webhook-inbound-sms/index.ts`
  ```typescript
  const smsPrompt = agentConfig.system_prompt
    ? `${agentConfig.system_prompt}\n\nYou are responding to an SMS text message (not a phone call). Keep your response brief, friendly, and conversational. Limit responses to 1-2 sentences. Do not reference phone calls or calling - this is a text message conversation.`
    : "You are Maggie, a helpful AI assistant. You are responding to an SMS text message. Reply in a friendly and concise way. Keep responses brief (1-2 sentences max). Do not reference phone calls - this is a text message conversation."
  ```

## Key Differences

| Aspect | Voice Call | SMS Text |
|--------|-----------|----------|
| **Medium** | Real-time voice | Asynchronous text |
| **Response length** | Natural conversation length | 1-2 sentences max |
| **Tools available** | Transfer, voicemail, callback | None (just conversational) |
| **Interrupt handling** | VAD detects user speech | N/A (turn-based) |
| **Context window** | Full conversation in session | Recent message history from DB |
| **Response style** | Conversational, can ask clarifying questions | Direct, concise answers |
| **References** | Can mention "calling back", "transferring" | Should NOT mention calls/voice |

## Solution Design

### Option 1: Room Metadata Flag (RECOMMENDED)

**How it works:**
- Add `communication_type` field to LiveKit room metadata
- LiveKit agent only handles voice calls (SMS keeps using OpenAI direct)
- Agent reads `communication_type` from room metadata at session start
- Adapts behavior based on type

**Pros:**
- Clean separation: LiveKit = voice only, webhook-inbound-sms = text only
- No database schema changes needed
- Simple implementation

**Cons:**
- LiveKit agent never used for SMS (but this is already the case)

**Implementation:**
```python
# agent.py - around line 280-290
room_metadata = json.loads(ctx.room.metadata) if ctx.room.metadata else {}
communication_type = room_metadata.get("communication_type", "voice")  # "voice" or "sms"

logger.info(f"Communication type: {communication_type}")

# Later, when building system prompt (around line 361):
if communication_type == "sms":
    sms_suffix = "\n\nYou are responding to an SMS text message (not a phone call). Keep your response brief, friendly, and conversational. Limit responses to 1-2 sentences. Do not reference phone calls or calling - this is a text message conversation."
    system_prompt = f"{system_prompt}{sms_suffix}"
else:
    # Voice call - use prompt as-is
    pass
```

### Option 2: Separate Agent Configurations

**How it works:**
- Add `sms_system_prompt` field to `agent_configs` table
- SMS webhook uses `sms_system_prompt` if available, falls back to adapted `system_prompt`
- Voice agent uses `system_prompt` as-is

**Pros:**
- User can customize SMS vs voice behavior independently
- Better UX for users who want different personalities/tones

**Cons:**
- Requires database migration
- More complex configuration UI needed

### Option 3: Context Injection in webhook-inbound-sms (CURRENT STATE)

**How it works:**
- SMS webhook appends context suffix to system prompt before calling OpenAI
- Voice agent uses system prompt as-is
- No changes needed to agent.py

**Pros:**
- Already implemented and working
- No database or agent code changes needed

**Cons:**
- Hardcoded prompt suffix in webhook code
- User can't customize SMS-specific behavior separately

## Recommended Approach

**REVISED: Single User Prompt, Dual Backend Adaptation**

User provides **ONE prompt** that describes their assistant's personality, knowledge, and purpose.

Backend automatically transforms this single prompt into two optimized versions:
1. **Voice prompt**: User's prompt + voice-specific context (conversational, tools available)
2. **SMS prompt**: User's prompt + SMS-specific context (brief, text-only, no call references)

**Example:**
```
User's prompt:
"You are Sarah, a friendly receptionist for ABC Plumbing. You help customers schedule appointments, answer questions about our services, and handle emergencies."

Voice version (auto-generated):
"You are Sarah, a friendly receptionist for ABC Plumbing. You help customers schedule appointments, answer questions about our services, and handle emergencies.

[VOICE CONTEXT]
- You are on a live phone call with the customer
- You can transfer calls, take voicemail, schedule callbacks
- Speak naturally and conversationally
- Ask clarifying questions if needed
- Tools available: transfer_call, take_voicemail, schedule_callback"

SMS version (auto-generated):
"You are Sarah, a friendly receptionist for ABC Plumbing. You help customers schedule appointments, answer questions about our services, and handle emergencies.

[SMS CONTEXT]
- You are responding via SMS text message (not a voice call)
- Keep responses BRIEF: 1-2 sentences maximum
- NEVER mention: 'calling', 'call back', 'speak', 'talk', 'phone call'
- ALWAYS use: 'text', 'message', 'reply', 'send'
- If they want to talk, say: 'I can help via text, or call us at [number]'"
```

## Implementation Tasks

### Phase 1: Document & Validate Current Behavior ✅
- [x] Document how SMS currently works (uses webhook-inbound-sms + OpenAI)
- [x] Document how voice calls work (uses LiveKit agent)
- [x] Confirm LiveKit agent is ONLY used for voice (not SMS)
- [x] Validate SMS prompt adaptation in webhook-inbound-sms

### Phase 2: Strengthen SMS Context Adaptation ✅
- [x] Extract SMS prompt suffix to shared constant (SMS_CONTEXT_SUFFIX)
- [x] Add explicit "NEVER mention" and "ALWAYS use" instructions
- [x] Add logging to confirm SMS suffix is applied
- [x] Test SMS responses to ensure no "call" references

### Phase 3: Add Voice Context Adaptation (TODO)
- [ ] Extract voice prompt suffix to shared constant (VOICE_CONTEXT_SUFFIX)
- [ ] Add voice-specific instructions in agent.py
- [ ] Ensure voice version mentions available tools
- [ ] Test voice responses for natural conversation flow

### Phase 4: UI/UX Polish (FUTURE)
- [ ] UI: Show preview of how prompt will be adapted for SMS vs Voice
- [ ] UI: Add help text: "Write one prompt - we'll optimize it for calls and texts"
- [ ] Docs: Add examples of good single prompts that work for both contexts

## Conclusion

**The agent DOES understand the difference between SMS and calls:**
- SMS goes through `webhook-inbound-sms` → appends SMS context → OpenAI API
- Calls go through `webhook-inbound-call` → LiveKit SIP → agent.py → uses voice prompt

**No immediate changes needed.** The current architecture properly separates SMS and voice handling.

**If the user is experiencing SMS responses that mention "calling", the issue is:**
1. The SMS prompt suffix isn't being applied correctly, OR
2. The base `system_prompt` has strong call-related instructions that override the suffix

**Action items:**
1. Check if `agentConfig.system_prompt` contains call-specific language
2. Consider making SMS suffix stronger/more explicit
3. Add logging to confirm suffix is being applied
