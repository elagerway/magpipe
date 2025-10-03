# Migration Plan: Retell → LiveKit

## Executive Summary

**Goal**: Migrate from Retell AI to LiveKit for voice AI agent functionality to support ElevenLabs cloned voices programmatically.

**Timeline**: 2-3 weeks
**Risk Level**: High (complete voice infrastructure replacement)
**Rollback Strategy**: Keep Retell integration in parallel during migration

---

## Current Architecture (Retell)

```
User Call → SignalWire SIP → Retell Agent → Retell LLM → TTS → User
                                    ↓
                              Webhooks → Supabase
```

**What Retell Provides:**
- LLM integration (GPT-4)
- Voice Activity Detection (VAD)
- Turn-taking & interruption handling
- Text-to-Speech (ElevenLabs/OpenAI)
- Custom tools/function calling
- Call recording
- Post-call analysis
- Real-time transcription

**Retell Limitations:**
- ❌ Cannot use ElevenLabs cloned voices programmatically
- ❌ Limited customization of voice parameters
- ❌ No direct control over conversation flow
- ❌ Expensive ($0.09/min)

---

## Target Architecture (LiveKit)

```
User Call → SignalWire SIP → LiveKit SIP → LiveKit Agent → Custom LLM Pipeline → ElevenLabs TTS → User
                                                ↓
                                          Webhooks → Supabase
```

**What We'll Build:**
- ✅ Custom LiveKit Agent (Python/Node.js)
- ✅ Direct ElevenLabs integration (all voices, including cloned)
- ✅ Custom LLM pipeline (OpenAI/Anthropic)
- ✅ Custom voice parameters per user
- ✅ Function calling (transfer, voicemail, etc.)
- ✅ Real-time conversation control
- ✅ Cost reduction (~$0.02/min for LiveKit + $0.11/1K chars ElevenLabs)

---

## Component Breakdown

### 1. LiveKit Infrastructure

**LiveKit Cloud Setup:**
- URL: `wss://plug-bq7kgzpt.livekit.cloud`
- API Key: `your-livekit-api-key`
- API Secret: `your-livekit-api-secret`

**Required Components:**
- LiveKit SIP trunk configuration
- LiveKit Agent runtime
- Webhook endpoints for events

### 2. LiveKit Agent Service

**Technology Choice:** Node.js (to match existing stack)
**SDK:** `@livekit/agents` (official Node.js SDK)

**Agent Responsibilities:**
1. Handle incoming SIP calls
2. Stream audio to/from user
3. Transcribe user speech (Deepgram/AssemblyAI)
4. Send transcription to LLM
5. Generate response
6. Convert response to speech (ElevenLabs)
7. Stream audio back to user
8. Handle interruptions
9. Execute custom tools (transfer, voicemail)
10. Record calls
11. Send webhooks to Supabase

**Deployment:** Supabase Edge Function or dedicated server (Railway/Fly.io)

### 3. LLM Pipeline

**Provider:** OpenAI GPT-4o-mini (existing)
**Integration:** Direct API calls
**Context Management:** Store conversation history in memory
**System Prompt:** Load from `agent_configs.system_prompt`
**Tools/Functions:**
- Transfer call
- Transfer immediate
- Send to voicemail
- Schedule callback

### 4. Speech-to-Text (STT)

**Options:**
- **Deepgram** (recommended): Real-time, low latency, $0.0043/min
- **AssemblyAI**: Real-time, good accuracy, $0.00025/sec
- **Whisper API**: OpenAI, slower but accurate

**Choice:** Deepgram Nova-2 (best for real-time phone calls)

### 5. Text-to-Speech (TTS)

**Provider:** ElevenLabs
**Integration:** Direct API (`/v1/text-to-speech/{voice_id}`)
**Features:**
- ✅ Support all voices (preset + cloned)
- ✅ Custom voice parameters from `voices` table
- ✅ Streaming for low latency
- ✅ WebSocket streaming for real-time

**Voice Selection:**
```javascript
const voiceSettings = {
  stability: userVoice.stability,
  similarity_boost: userVoice.similarity_boost,
  style: userVoice.style,
  use_speaker_boost: userVoice.use_speaker_boost
};
```

### 6. SignalWire SIP Integration

**Current:** SignalWire → Retell
**New:** SignalWire → LiveKit SIP

**Changes Required:**
1. Update SignalWire SIP trunk to point to LiveKit SIP endpoint
2. Configure LiveKit SIP to accept SignalWire calls
3. Pass metadata (caller_id, to_number, user_id) through SIP headers

**LiveKit SIP Configuration:**
```json
{
  "trunk": {
    "inbound_addresses": ["signalwire.livekit.cloud"],
    "outbound_address": "sip.signalwire.com",
    "auth_username": "{SIGNALWIRE_USERNAME}",
    "auth_password": "{SIGNALWIRE_PASSWORD}"
  }
}
```

---

## Database Schema Changes

### New Tables

#### `livekit_sessions`
```sql
CREATE TABLE livekit_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  room_name TEXT NOT NULL,
  participant_identity TEXT,
  call_id TEXT REFERENCES call_records(id),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  recording_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Modified Tables

#### `agent_configs` (add LiveKit fields)
```sql
ALTER TABLE agent_configs ADD COLUMN livekit_agent_id TEXT;
ALTER TABLE agent_configs ADD COLUMN stt_provider TEXT DEFAULT 'deepgram';
ALTER TABLE agent_configs ADD COLUMN use_livekit BOOLEAN DEFAULT false;
```

---

## Edge Functions to Create/Update

### 1. **`livekit-webhook`** (NEW)
Handle LiveKit events (room created, participant joined, etc.)

### 2. **`livekit-create-room`** (NEW)
Create LiveKit room for incoming call

### 3. **`livekit-create-token`** (NEW)
Generate LiveKit access token for agent

### 4. **Update `webhook-inbound-call`**
Route to LiveKit instead of Retell when `use_livekit = true`

### 5. **Update `webhook-outbound-call`**
Create LiveKit room for outbound calls

### 6. **`livekit-agent-tools`** (NEW)
Handle function calling (transfer, voicemail, etc.) from agent

---

## LiveKit Agent Implementation

### File Structure
```
agents/
├── livekit-agent/
│   ├── index.js              # Main agent entry point
│   ├── stt.js                # Speech-to-text handler
│   ├── llm.js                # LLM pipeline
│   ├── tts.js                # Text-to-speech handler
│   ├── tools.js              # Custom tools (transfer, etc.)
│   ├── conversation.js       # Conversation state management
│   └── package.json
```

### Core Agent Logic (Pseudocode)
```javascript
import { LiveKitAgent } from '@livekit/agents';
import { DeepgramSTT } from './stt.js';
import { OpenAILLM } from './llm.js';
import { ElevenLabsTTS } from './tts.js';
import { CustomTools } from './tools.js';

const agent = new LiveKitAgent({
  stt: new DeepgramSTT(),
  llm: new OpenAILLM(),
  tts: new ElevenLabsTTS(),
  tools: new CustomTools()
});

agent.on('participant_connected', async (participant) => {
  // Load user config from database
  const config = await loadUserConfig(participant.metadata.user_id);

  // Configure voice
  agent.tts.setVoice(config.voice_id, {
    stability: config.voice.stability,
    similarity_boost: config.voice.similarity_boost
  });

  // Start conversation
  await agent.say(config.greeting_template);
});

agent.on('user_speech', async (transcription) => {
  // Send to LLM
  const response = await agent.llm.generate(transcription);

  // Handle tool calls
  if (response.tool_calls) {
    for (const tool of response.tool_calls) {
      await agent.tools.execute(tool.name, tool.parameters);
    }
  }

  // Speak response
  await agent.say(response.text);
});

agent.start();
```

---

## Migration Phases

### Phase 1: Setup (Week 1)
- [ ] Set up LiveKit Cloud project
- [ ] Configure LiveKit SIP trunk
- [ ] Create LiveKit agent boilerplate
- [ ] Test basic audio streaming
- [ ] Create database migrations
- [ ] Deploy edge functions

### Phase 2: Core Agent (Week 1-2)
- [ ] Implement STT (Deepgram)
- [ ] Implement LLM pipeline (OpenAI)
- [ ] Implement TTS (ElevenLabs)
- [ ] Test conversation flow
- [ ] Implement interruption handling
- [ ] Add conversation state management

### Phase 3: Features (Week 2)
- [ ] Implement custom tools (transfer, voicemail)
- [ ] Add call recording
- [ ] Implement webhooks
- [ ] Load user configs dynamically
- [ ] Test with cloned voices
- [ ] Add error handling & logging

### Phase 4: Integration (Week 2-3)
- [ ] Update SignalWire routing
- [ ] Create migration toggle in UI
- [ ] Run parallel testing (Retell vs LiveKit)
- [ ] Performance testing
- [ ] Load testing
- [ ] Fix bugs

### Phase 5: Rollout (Week 3)
- [ ] Enable for test users
- [ ] Monitor for issues
- [ ] Gradual rollout to all users
- [ ] Deprecate Retell
- [ ] Remove Retell code

---

## Cost Comparison

### Current (Retell)
- **Retell**: $0.09/min
- **Monthly (1000 min)**: $90

### New (LiveKit)
- **LiveKit**: $0.02/min (SIP + agent runtime)
- **Deepgram STT**: $0.0043/min
- **ElevenLabs TTS**: ~$0.01/min (avg 150 words/min)
- **OpenAI LLM**: ~$0.005/min (avg 200 tokens/min)
- **Total**: ~$0.04/min
- **Monthly (1000 min)**: $40
- **Savings**: 56%

---

## Risks & Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Latency increase | High | Use Deepgram Nova-2 (fastest STT), ElevenLabs streaming |
| Interruption handling | High | Implement VAD, test extensively |
| Agent crashes | High | Auto-restart, health checks, fallback to voicemail |
| Cost overruns | Medium | Monitor usage, set alerts |
| Voice quality | Medium | Test all voices, tune parameters |
| SIP compatibility | High | Test with SignalWire thoroughly |

---

## Testing Strategy

### Unit Tests
- STT accuracy
- LLM response generation
- TTS quality
- Tool execution

### Integration Tests
- End-to-end call flow
- Interruption handling
- Transfer functionality
- Recording

### Load Tests
- 10 concurrent calls
- 50 concurrent calls
- 100 concurrent calls

### User Acceptance Tests
- Test with real users
- Collect feedback
- Iterate

---

## Rollback Plan

1. Keep Retell integration code intact during migration
2. Add `use_livekit` boolean toggle in database
3. Route calls based on toggle
4. If critical issues, flip toggle back to Retell
5. Gradual rollout to control blast radius

---

## Next Steps

1. **Approve migration plan**
2. **Set up LiveKit Cloud project**
3. **Create proof-of-concept agent**
4. **Test with one phone call**
5. **Build out full implementation**
6. **Deploy and test**
7. **Rollout**

---

## Questions to Answer

1. Should we use Node.js or Python for the agent? (Recommendation: Node.js to match stack)
2. Where to host the agent? (Recommendation: Railway or Fly.io for persistent WebSocket)
3. Should we support both Retell and LiveKit simultaneously? (Recommendation: Yes, during migration)
4. What's the timeline constraint? (User decides)
