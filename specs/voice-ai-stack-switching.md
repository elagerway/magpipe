# Feature Spec: Voice AI Stack Switching (Retell ↔ LiveKit)

**Status**: Planned
**Priority**: High
**Owner**: Engineering
**Created**: 2025-10-03

---

## Overview

Enable admin to switch between Voice AI providers (Retell vs LiveKit) to unlock custom voice cloning while maintaining existing Retell functionality.

### Problem Statement

**Current State:**
- Pat uses Retell AI for voice agent functionality
- Retell does NOT support programmatic creation of custom ElevenLabs voices
- Users cannot use voice cloning feature because Retell API returns 404 for custom voices
- Voice cloning UI is visible but non-functional

**Desired State:**
- Admin can choose Voice AI stack per user (Retell OR LiveKit)
- Retell stack: Hide voice cloning UI (limitation acknowledged)
- LiveKit stack: Enable voice cloning UI (full ElevenLabs integration)
- Seamless switching without data loss

---

## Requirements

### Functional Requirements

#### FR-1: Database Schema
- [ ] Create `voice_ai_stacks` enum: `retell`, `livekit`
- [ ] Add `active_voice_stack` column to `users` or `agent_configs` table
- [ ] Add `livekit_room_id` column to `agent_configs` (for LiveKit users)
- [ ] Maintain `retell_agent_id` column (for Retell users)

#### FR-2: Stack Detection
- [ ] UI must detect user's active Voice AI stack from database
- [ ] Show/hide voice cloning feature based on active stack
- [ ] Show stack indicator in agent config UI (badge or label)

#### FR-3: Retell Stack Behavior
- [ ] Hide voice cloning UI entirely when `active_voice_stack = 'retell'`
- [ ] Show only preset voices (29 ElevenLabs + OpenAI)
- [ ] Hide "Clone Your Voice" button
- [ ] Hide voice preview generator for custom voices

#### FR-4: LiveKit Stack Behavior
- [ ] Show voice cloning UI when `active_voice_stack = 'livekit'`
- [ ] Enable all voice features (preset + custom/cloned)
- [ ] Show voice preview generator
- [ ] Enable programmatic voice management

#### FR-5: Admin Stack Switching
- [ ] Admin page to switch user's active stack
- [ ] Confirmation dialog: "Switching stacks will recreate agent. Continue?"
- [ ] On switch: Create agent on new stack, preserve settings
- [ ] Optional: Delete old agent OR keep for rollback

#### FR-6: LiveKit Implementation
- [ ] LiveKit Cloud connection (URL, API key, secret)
- [ ] Create LiveKit room for incoming calls
- [ ] STT: Integrate Deepgram for real-time transcription
- [ ] LLM: OpenAI GPT-4o-mini with system prompt from database
- [ ] TTS: ElevenLabs with support for ALL voices (preset + custom)
- [ ] Tools: Transfer, voicemail, callback (same as Retell)
- [ ] Webhooks: Send call events to Supabase

### Non-Functional Requirements

#### NFR-1: Performance
- LiveKit latency must be ≤ Retell (target: <500ms response time)
- No audio quality degradation

#### NFR-2: Reliability
- 99.9% uptime for both stacks
- Graceful fallback if stack is unavailable

#### NFR-3: Cost
- Track usage per stack
- LiveKit should be cheaper than Retell (~56% savings)

---

## Technical Design

### Database Schema

```sql
-- Migration 056: Add Voice AI Stack Support
CREATE TYPE voice_ai_stack AS ENUM ('retell', 'livekit');

ALTER TABLE agent_configs
  ADD COLUMN active_voice_stack voice_ai_stack DEFAULT 'retell',
  ADD COLUMN livekit_room_id TEXT,
  ADD COLUMN stack_config JSONB DEFAULT '{}'::jsonb;

-- Index for filtering by stack
CREATE INDEX idx_agent_configs_voice_stack ON agent_configs(active_voice_stack);

-- Comment
COMMENT ON COLUMN agent_configs.active_voice_stack IS 'Active Voice AI provider (retell or livekit)';
COMMENT ON COLUMN agent_configs.livekit_room_id IS 'LiveKit room ID (only used when stack is livekit)';
COMMENT ON COLUMN agent_configs.stack_config IS 'Stack-specific configuration (JSON)';
```

### Architecture

```
┌─────────────────┐
│  SignalWire SIP │
└────────┬────────┘
         │
    ┌────▼────┐
    │  Router │ (Check active_voice_stack)
    └────┬────┘
         │
    ┌────┴────────────┐
    │                 │
┌───▼──────┐   ┌──────▼───────┐
│  Retell  │   │   LiveKit    │
│ Provider │   │   Provider   │
└───┬──────┘   └──────┬───────┘
    │                 │
    └────────┬────────┘
             │
      ┌──────▼──────┐
      │  Supabase   │
      │  (Webhooks) │
      └─────────────┘
```

### Edge Functions

#### 1. `webhook-inbound-call` (UPDATE)

```typescript
// Add stack routing
const { active_voice_stack } = await getAgentConfig(userId);

if (active_voice_stack === 'retell') {
  return await handleRetellCall(callData);
} else if (active_voice_stack === 'livekit') {
  return await handleLiveKitCall(callData);
}
```

#### 2. `livekit-agent` (NEW)

```typescript
// LiveKit agent runtime
// - Handles incoming calls
// - STT (Deepgram)
// - LLM (OpenAI)
// - TTS (ElevenLabs with custom voices)
// - Tools (transfer, voicemail)
```

#### 3. `switch-voice-stack` (NEW)

```typescript
// Admin function to switch user's stack
async function switchStack(userId: string, newStack: 'retell' | 'livekit') {
  // 1. Validate admin permission
  // 2. Create agent on new stack
  // 3. Update database
  // 4. Optionally delete old agent
  // 5. Return success
}
```

### UI Changes

#### Agent Config Page

```javascript
// Detect stack and show/hide features
const { active_voice_stack } = config;

// Stack indicator
if (active_voice_stack === 'retell') {
  showBadge('Using Retell (Preset voices only)');
  hideElement('#voice-cloning-section');
} else if (active_voice_stack === 'livekit') {
  showBadge('Using LiveKit (Custom voices enabled)');
  showElement('#voice-cloning-section');
}
```

#### Voice Cloning UI

```html
<!-- Only show when active_voice_stack = 'livekit' -->
<div id="voice-cloning-section" style="display: none;">
  <h3>Clone Your Voice</h3>
  <button id="clone-voice-btn">Upload Voice Sample</button>
</div>
```

---

## Implementation Plan

### Phase 1: Database & Routing (Day 1)
- [ ] Create migration for `active_voice_stack` column
- [ ] Deploy migration
- [ ] Update webhook routing logic
- [ ] Add stack detection to UI

### Phase 2: UI Adaptation (Day 1)
- [ ] Hide voice cloning for Retell users
- [ ] Show stack indicator badge
- [ ] Test with existing Retell users

### Phase 3: LiveKit Core (Days 2-4)
- [ ] Set up LiveKit Cloud connection
- [ ] Implement basic room creation
- [ ] STT integration (Deepgram)
- [ ] LLM integration (OpenAI)
- [ ] TTS integration (ElevenLabs)

### Phase 4: LiveKit Features (Days 5-6)
- [ ] Function calling (transfer, voicemail)
- [ ] Call recording
- [ ] Webhooks to Supabase
- [ ] Load user config from database

### Phase 5: Testing (Day 7)
- [ ] End-to-end call test (Retell)
- [ ] End-to-end call test (LiveKit)
- [ ] Test stack switching
- [ ] Test custom voice on LiveKit
- [ ] Performance testing

### Phase 6: Admin Tools (Day 8)
- [ ] Admin page to switch stacks
- [ ] Usage analytics per stack
- [ ] Cost tracking

---

## Testing Strategy

### Unit Tests
- [ ] Stack detection logic
- [ ] UI show/hide logic
- [ ] Stack switching function

### Integration Tests
- [ ] Retell call flow (existing)
- [ ] LiveKit call flow (new)
- [ ] Stack switching preserves settings
- [ ] Custom voice works on LiveKit

### User Acceptance Tests
- [ ] User on Retell cannot see voice cloning
- [ ] User on LiveKit can clone voice
- [ ] Admin can switch user's stack
- [ ] Calls work on both stacks

---

## Success Metrics

- [ ] Voice cloning works for LiveKit users (100% success rate)
- [ ] Retell users see no change (no UI breakage)
- [ ] LiveKit latency ≤ Retell latency
- [ ] Cost per minute on LiveKit < Retell
- [ ] Zero downtime during stack switches

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| LiveKit latency higher than Retell | High | Optimize STT/TTS streaming, use Deepgram Nova-2 |
| Stack switching breaks user config | High | Preserve all settings in migration, thorough testing |
| LiveKit more expensive than expected | Medium | Monitor costs closely, optimize LLM token usage |
| Users confused by stack differences | Low | Clear UI indicators, help documentation |

---

## Open Questions

1. **Default stack for new users?** → Start with Retell (proven), offer LiveKit upgrade
2. **Allow users to switch stacks themselves?** → No, admin-only initially
3. **Keep both agents active?** → No, only active stack's agent exists
4. **Pricing difference?** → Same price for now, may add premium tier later

---

## Dependencies

- LiveKit Cloud account (already have credentials)
- Deepgram API key (need to obtain)
- ElevenLabs API key (already have)
- OpenAI API key (already have)

---

## Documentation

- [ ] Update CLAUDE.md with stack architecture ✅
- [ ] Create LiveKit setup guide
- [ ] Document stack switching process
- [ ] Update user documentation
