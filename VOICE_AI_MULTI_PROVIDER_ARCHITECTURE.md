# Multi-Provider Voice AI Architecture

## Executive Summary

**Goal**: Support multiple Voice AI providers (Retell, LiveKit, Vapi, SignalWire AI) in a single unified architecture.

**Benefits:**
- ✅ Use the right tool for the job (Retell for preset voices, LiveKit for custom)
- ✅ Feature differentiation per provider
- ✅ Easy to add new providers
- ✅ Users can switch providers without migration
- ✅ A/B test different providers
- ✅ Redundancy and failover

---

## Provider Feature Matrix

| Feature | Retell | LiveKit | Vapi | SignalWire AI |
|---------|--------|---------|------|---------------|
| **Preset Voices** | ✅ ElevenLabs, OpenAI | ✅ Any TTS | ✅ ElevenLabs, OpenAI | ✅ Multiple |
| **Custom/Cloned Voices** | ❌ Manual only | ✅ Programmatic | ✅ Programmatic | ✅ Programmatic |
| **LLM Options** | GPT-4, Claude, Custom | Any | GPT-4, Claude | GPT-4, Claude |
| **Function Calling** | ✅ Built-in | ✅ Custom | ✅ Built-in | ✅ Built-in |
| **Call Recording** | ✅ Automatic | ✅ Manual | ✅ Automatic | ✅ Automatic |
| **Post-Call Analysis** | ✅ Built-in | ❌ Custom | ✅ Built-in | ✅ Built-in |
| **WebRTC Support** | ✅ Yes | ✅ Native | ✅ Yes | ✅ Yes |
| **SIP Support** | ✅ Yes | ✅ Native | ✅ Yes | ✅ Native |
| **Cost (per min)** | $0.09 | ~$0.04 | $0.05 | $0.08 |
| **Setup Complexity** | Low | High | Low | Medium |
| **Customization** | Medium | Very High | Medium | High |

---

## Architecture Overview

```
                      ┌─────────────────┐
                      │  SignalWire SIP  │
                      └────────┬─────────┘
                               │
                      ┌────────▼─────────┐
                      │  Router Service   │
                      │  (Edge Function)  │
                      └────────┬─────────┘
                               │
                ┌──────────────┼──────────────┐
                │              │              │
         ┌──────▼──────┐ ┌────▼─────┐ ┌─────▼──────┐
         │   Retell    │ │ LiveKit  │ │    Vapi    │
         │   Provider  │ │ Provider │ │  Provider  │
         └──────┬──────┘ └────┬─────┘ └─────┬──────┘
                │              │              │
                └──────────────┼──────────────┘
                               │
                      ┌────────▼─────────┐
                      │   Supabase DB    │
                      │   (call_records) │
                      └──────────────────┘
```

---

## Database Schema

### New Table: `voice_ai_providers`

```sql
CREATE TABLE voice_ai_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL, -- 'retell', 'livekit', 'vapi', 'signalwire'
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  supports_custom_voices BOOLEAN DEFAULT false,
  supports_preset_voices BOOLEAN DEFAULT true,
  cost_per_minute NUMERIC(5,4),
  setup_instructions TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed data
INSERT INTO voice_ai_providers (code, name, description, supports_custom_voices, cost_per_minute) VALUES
  ('retell', 'Retell AI', 'Managed AI agent with built-in LLM and TTS', false, 0.09),
  ('livekit', 'LiveKit', 'Open-source real-time communication platform', true, 0.04),
  ('vapi', 'Vapi', 'Voice AI platform with enterprise features', true, 0.05),
  ('signalwire', 'SignalWire AI Agent', 'SignalWire native AI agent', true, 0.08);
```

### New Table: `provider_configs`

```sql
CREATE TABLE provider_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  provider_id UUID REFERENCES voice_ai_providers(id),

  -- Provider-specific agent IDs
  agent_id TEXT, -- retell_agent_id, livekit_room_id, vapi_assistant_id, etc.
  llm_id TEXT,   -- provider-specific LLM ID

  -- Provider-specific settings (JSONB for flexibility)
  settings JSONB DEFAULT '{}'::jsonb,

  -- Voice configuration
  voice_id TEXT, -- Can reference voices table or provider's voice ID

  is_active BOOLEAN DEFAULT true,
  is_default BOOLEAN DEFAULT false, -- One provider should be default per user

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, provider_id)
);

CREATE INDEX idx_provider_configs_user_id ON provider_configs(user_id);
CREATE INDEX idx_provider_configs_provider_id ON provider_configs(provider_id);
```

### Update Existing `agent_configs` Table

```sql
-- Add provider tracking
ALTER TABLE agent_configs ADD COLUMN active_provider_id UUID REFERENCES voice_ai_providers(id);

-- Migrate existing Retell configs
UPDATE agent_configs SET active_provider_id = (
  SELECT id FROM voice_ai_providers WHERE code = 'retell'
);

-- Keep retell_agent_id for backward compatibility
-- Later we'll move this to provider_configs
```

### Update `call_records` Table

```sql
ALTER TABLE call_records ADD COLUMN provider_id UUID REFERENCES voice_ai_providers(id);

-- Backfill existing records
UPDATE call_records SET provider_id = (
  SELECT id FROM voice_ai_providers WHERE code = 'retell'
);
```

---

## Provider Abstraction Layer

### Interface: `VoiceAIProvider`

All providers must implement this interface:

```typescript
interface VoiceAIProvider {
  // Provider info
  code: string; // 'retell', 'livekit', 'vapi', 'signalwire'
  name: string;

  // Lifecycle
  initialize(config: ProviderConfig): Promise<void>;
  createAgent(userConfig: AgentConfig): Promise<AgentInfo>;
  updateAgent(agentId: string, updates: Partial<AgentConfig>): Promise<void>;
  deleteAgent(agentId: string): Promise<void>;

  // Calls
  createCall(agentId: string, toNumber: string): Promise<CallInfo>;
  endCall(callId: string): Promise<void>;

  // Features
  supportsCustomVoices(): boolean;
  supportsRecording(): boolean;
  supportsAnalysis(): boolean;

  // Webhooks
  handleWebhook(event: WebhookEvent): Promise<void>;
}
```

### Provider Implementations

```
providers/
├── retell/
│   ├── index.ts          # RetellProvider implementation
│   ├── agent.ts          # Agent management
│   ├── calls.ts          # Call handling
│   └── webhooks.ts       # Webhook processing
├── livekit/
│   ├── index.ts          # LiveKitProvider implementation
│   ├── agent.ts
│   ├── calls.ts
│   └── webhooks.ts
├── vapi/
│   ├── index.ts          # VapiProvider implementation
│   └── ...
└── signalwire/
    ├── index.ts          # SignalWireProvider implementation
    └── ...
```

---

## Edge Functions

### New: `voice-ai-router`

Routes incoming calls to the appropriate provider based on user config.

```typescript
// Pseudo-code
async function routeCall(incomingCall) {
  const user = await getUserByNumber(incomingCall.to);
  const activeProvider = await getActiveProvider(user.id);

  switch (activeProvider.code) {
    case 'retell':
      return await providers.retell.handleCall(incomingCall);
    case 'livekit':
      return await providers.livekit.handleCall(incomingCall);
    case 'vapi':
      return await providers.vapi.handleCall(incomingCall);
    case 'signalwire':
      return await providers.signalwire.handleCall(incomingCall);
  }
}
```

### New: `provider-webhook-router`

Routes webhooks to the appropriate provider handler.

```typescript
async function routeWebhook(request) {
  const provider = identifyProvider(request.headers, request.path);
  return await providers[provider].handleWebhook(request.body);
}
```

### Update: `webhook-inbound-call`

```typescript
// Add provider routing logic
const provider = await getActiveProvider(userId);
const providerInstance = providers[provider.code];
await providerInstance.createInboundCall(callData);
```

---

## UI Changes

### Agent Config Page

Add provider selector:

```html
<div class="form-group">
  <label>Voice AI Provider</label>
  <select id="provider-select">
    <option value="retell">Retell AI (Preset voices only)</option>
    <option value="livekit">LiveKit (Custom voices supported)</option>
    <option value="vapi">Vapi (Coming soon)</option>
    <option value="signalwire">SignalWire AI (Coming soon)</option>
  </select>
</div>

<!-- Show/hide voice options based on provider -->
<div id="voice-options">
  <!-- For Retell: Only preset voices -->
  <!-- For LiveKit/Vapi/SignalWire: Preset + Custom -->
</div>
```

### Provider Settings Modal

Per-provider advanced settings:

```html
<dialog id="provider-settings">
  <h3>LiveKit Settings</h3>
  <div>
    <label>STT Provider</label>
    <select>
      <option>Deepgram</option>
      <option>AssemblyAI</option>
    </select>
  </div>
  <div>
    <label>LLM Model</label>
    <select>
      <option>GPT-4o-mini</option>
      <option>Claude 3.5 Sonnet</option>
    </select>
  </div>
</dialog>
```

---

## Implementation Phases

### Phase 1: Architecture Setup (Week 1)
- [ ] Create database migrations
- [ ] Create provider abstraction interface
- [ ] Refactor Retell code into provider structure
- [ ] Create router edge functions
- [ ] Update UI with provider selector

### Phase 2: LiveKit Provider (Week 2-3)
- [ ] Implement LiveKitProvider class
- [ ] Set up LiveKit Cloud
- [ ] Create LiveKit agent
- [ ] Test with custom voices
- [ ] Deploy and enable for testing

### Phase 3: Additional Providers (Future)
- [ ] Implement VapiProvider
- [ ] Implement SignalWireProvider
- [ ] Add provider comparison tool
- [ ] Cost analytics per provider

---

## Provider Selection Logic

### Automatic Recommendation

```javascript
function recommendProvider(userNeeds) {
  if (userNeeds.hasCustomVoice) {
    return 'livekit'; // or 'vapi' or 'signalwire'
  }

  if (userNeeds.wantsLowestCost) {
    return 'livekit'; // $0.04/min
  }

  if (userNeeds.wantsEasySetup) {
    return 'retell'; // or 'vapi'
  }

  if (userNeeds.wantsMaxCustomization) {
    return 'livekit';
  }

  return 'retell'; // Default
}
```

### User Decision Matrix

| Use Case | Recommended Provider | Why |
|----------|---------------------|-----|
| Just starting, want simple setup | Retell | Easiest to configure |
| Need custom/cloned voices | LiveKit, Vapi, SignalWire | Programmatic voice support |
| High call volume, cost-conscious | LiveKit | Lowest cost per minute |
| Enterprise features needed | Vapi | Built-in analytics, compliance |
| Already using SignalWire | SignalWire AI | Native integration |

---

## Migration Strategy

### For Existing Users (Currently on Retell)

1. **No forced migration** - Keep using Retell
2. **Optional opt-in** - "Enable custom voices (switch to LiveKit)"
3. **Gradual rollout** - Start with new users
4. **Side-by-side testing** - Run both providers for 1 month

### For New Users

1. **Onboarding flow** - Ask: "Do you want to use a custom voice?"
2. **Auto-select provider** - Based on answer
3. **Easy switching** - Can change provider anytime

---

## Cost Tracking

### New Table: `provider_usage`

```sql
CREATE TABLE provider_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  provider_id UUID REFERENCES voice_ai_providers(id),
  call_id UUID REFERENCES call_records(id),

  duration_seconds INTEGER,
  cost_amount NUMERIC(10,4),

  -- Provider-specific metrics
  stt_cost NUMERIC(10,4),
  llm_cost NUMERIC(10,4),
  tts_cost NUMERIC(10,4),
  platform_cost NUMERIC(10,4),

  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Cost Analytics Dashboard

Show users:
- Cost per provider
- Total spend this month
- Cost breakdown (STT, LLM, TTS, platform)
- Recommendations to save money

---

## Code Structure

```
pat/
├── supabase/
│   ├── migrations/
│   │   ├── 056_create_voice_ai_providers.sql
│   │   ├── 057_create_provider_configs.sql
│   │   └── 058_update_call_records_provider.sql
│   └── functions/
│       ├── voice-ai-router/
│       ├── provider-webhook-router/
│       └── providers/
│           ├── retell/
│           ├── livekit/
│           ├── vapi/
│           └── signalwire/
├── src/
│   ├── lib/
│   │   └── providers/
│   │       ├── base.js           # Provider interface
│   │       ├── retell.js
│   │       ├── livekit.js
│   │       ├── vapi.js
│   │       └── signalwire.js
│   └── pages/
│       └── agent-config.js       # Updated with provider selector
```

---

## Next Steps

1. **Approve multi-provider architecture**
2. **Create database migrations**
3. **Refactor Retell into provider structure**
4. **Implement LiveKit provider**
5. **Test with custom voices**
6. **Deploy alongside Retell**
7. **Add Vapi and SignalWire later**

---

## Questions

1. Should we charge different prices for different providers?
2. Which provider should be the default for new users?
3. Should we allow users to switch providers mid-subscription?
4. Should we support multiple active providers per user? (for redundancy)
