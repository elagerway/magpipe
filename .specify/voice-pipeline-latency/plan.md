# Implementation Plan: Voice Pipeline Latency & Thinking Fillers

**Branch**: `master` | **Date**: 2026-02-27 | **Status**: COMPLETED

## Summary

Two improvements to the voice agent's conversational feel: (1) multiple latency tuning changes that reduce the gap between when a caller stops speaking and when the agent starts responding; (2) function-call-based thinking filler phrases so callers are never left in silence during webhook lookups.

## Technical Context

**Language/Version**: Python 3.12 (LiveKit agent)
**Primary File**: `agents/livekit-voice-agent/agent.py`
**Dependencies**: livekit-agents SDK ≥1.4.0, Deepgram STT, ElevenLabs TTS, Silero VAD
**Testing**: Live voice calls on local agent (`SW Agent Local`)
**Target Platform**: Render (production), LiveKit Cloud

## Latency Changes

### 1. Silero VAD Pre-warm

```python
async def prewarm(proc: JobProcess):
    proc.userdata["vad"] = silero.VAD.load()
    await proc.wait_for_shutdown()
```

The Silero VAD ML model took 200–500ms to load on first use per call. Pre-loading at worker startup means it's already in memory when a call arrives.

### 2. Deepgram STT Tuning

```python
stt=deepgram.STT(
    no_delay=True,       # Send audio immediately, don't buffer
    endpointing_ms=100,  # Finalize transcript after 100ms silence (was SDK default ~300ms)
)
```

`no_delay=True` sends audio to Deepgram as it arrives rather than buffering. `endpointing_ms=100` cuts 200ms+ off the time between the caller finishing and the transcript being finalized.

### 3. AgentSession Latency Parameters

```python
session = AgentSession(
    min_endpointing_delay=0.1,    # Was SDK default ~500ms — saves ~400ms
    max_endpointing_delay=1.5,    # Was 3.0s — prevents long pauses for slow speakers
    preemptive_generation=True,   # Begin LLM generation while user is still finishing
    min_interruption_duration=0.3, # Allow barge-in after 300ms (was 500ms)
)
```

`preemptive_generation=True` is the highest-impact change: the LLM starts generating while the caller is still speaking their last words, overlapping LLM TTFT with the tail end of user speech.

### 4. ElevenLabs Auto Mode

```python
tts=elevenlabs.TTS(
    auto_mode=True,  # Replaces manual chunk_length_schedule=[50, 80, 120, 150]
)
```

ElevenLabs `auto_mode` lets the SDK manage chunk buffering dynamically for lowest time-to-first-audio, rather than the fixed schedule which was tuned by trial-and-error.

### 5. VAD Speech Duration

```python
vad_speech = float(user_config.get("vad_speech_duration", 0.08) or 0.08)
# Reduced from 0.15 → 0.08 (saves ~70ms)
```

## Thinking Filler Phrases

### Problem

When a custom function (webhook tool) is called, the agent is silent for the duration of the HTTP request. For slow or complex lookups, this can be 1–3 seconds of dead air.

### Previous Approach (Removed)

Timer-based: after 800ms of `agent_state_changed → thinking`, speak a filler. This fired too aggressively — every sentence transition triggered it since `thinking` fires between sentences too.

### New Approach

Inject the filler directly inside `_execute_custom_function`, at the exact moment the tool is called:

```python
THINKING_FILLERS = [
    "Let me look that up.",
    "One sec, let me check on that.",
    "Hmm, let me check.",
    "Give me just a moment.",
    "Let me find that for you.",
    "Sure, one sec.",
    "Let me pull that up.",
]

async def _execute_custom_function(params: dict) -> str:
    # Speak a thinking filler so the caller isn't met with silence
    if say_filler_ref and say_filler_ref[0]:
        phrase = random.choice(THINKING_FILLERS)
        asyncio.create_task(say_filler_ref[0](phrase))  # Non-blocking
    # ... then proceed with HTTP call
```

### Wiring via Mutable Ref

Tools are created BEFORE the session exists. A shared mutable list bridges the gap:

```python
say_filler_ref: list = [None]  # Created before tools

# Passed into tool factory:
tool = create_custom_function_tool(func_config, webhook_secret, say_filler_ref=say_filler_ref)

# Set after session creation:
say_filler_ref[0] = session.say
```

`asyncio.create_task(say_filler_ref[0](phrase))` starts the filler speaking in parallel with the HTTP request — no added latency to the lookup itself.

## Files Modified

| File | Change |
|------|--------|
| `agents/livekit-voice-agent/agent.py` | Prewarm, STT/TTS params, AgentSession params, `THINKING_FILLERS`, `say_filler_ref` pattern, removed old timer approach |

## Testing

Tested via live calls to local agent (`SW Agent Local`). Verified:
- Fillers fire on custom function calls, not between sentences
- No filler fires when agent is just thinking without a tool call
- Filler fires in parallel with HTTP call (no additional delay)

## Progress Tracking

- [x] Identify latency sources (endpointing_delay default was 500ms)
- [x] Silero VAD pre-warm
- [x] Deepgram `no_delay` + `endpointing_ms`
- [x] AgentSession latency params
- [x] ElevenLabs `auto_mode`
- [x] Remove timer-based filler (`agent_state_changed` approach)
- [x] Implement function-call-based filler via `say_filler_ref`
- [x] Live call verification

## Commits

- `a64d4ad` — Fix SMS loop + voice agent routing + function-call fillers
