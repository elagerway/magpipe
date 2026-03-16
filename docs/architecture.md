# Magpipe Architecture

## System Overview

```
User → Frontend (Vite SPA) → Supabase Edge Functions → Supabase DB
                           ↘ LiveKit SIP → Voice Agent (Python/Render)
                           ↘ SignalWire (telephony/SMS)
                           ↘ ElevenLabs / OpenAI (TTS/LLM)
```

## Frontend (Vanilla JS SPA)

- **Framework**: Vanilla JavaScript ES6+, no UI framework
- **Build**: Vite, deployed to Vercel
- **Routing**: Custom client-side `Router` class in `src/router.js`
- **PWA**: Service Worker (`public/sw.js`) — navigation requests always network-first; `/assets/*` cache-first (content-hashed, immutable). Cache name: `magpipe-v3`.
- **Cache headers**: `vercel.json` sets `no-cache` on `index.html`, `immutable` on `/assets/*`
- **Layout**: Pages inside the main nav use `with-bottom-nav` CSS class for 240px left sidebar offset

### Page Structure
```
src/
  pages/          # One class per route, render() → getElementById('app').innerHTML
  components/     # Reusable components (BottomNav, ConfirmModal, etc.)
  lib/            # Utilities (supabase.js, toast.js, formatters.js)
  models/         # Data models (AgentConfig.js)
```

### Navigation
- `BottomNav.js` renders both desktop sidebar and mobile bottom nav
- Profile menu contains: Chat with us, Tests, Status, Upgrade, Admin (admin only)
- `window.navigateTo(path)` for programmatic navigation

## Backend (Supabase Edge Functions)

- **Runtime**: Deno (TypeScript)
- **Deployment**: `./scripts/deploy-functions.sh <name>` — NEVER bare `npx supabase functions deploy`
- **Auth**: `resolveUser()` in `_shared/api-auth.ts` — accepts JWT or API key
- **Admin auth**: `requireAdmin()` in `_shared/admin-auth.ts` — accepts user JWT or service role key (for CLI/internal use)
- **JWT rule**: Functions accepting API keys or webhooks MUST use `--no-verify-jwt`
- **Project ref**: `mtxbiyilvgwhbdptysex`

### Key Edge Functions
| Function | Purpose |
|----------|---------|
| `webhook-inbound-call` | Receives SignalWire inbound call webhook, fires agent dispatch |
| `webhook-inbound-sms` | Receives SMS, routes to text agent |
| `initiate-bridged-call` | Places outbound call via conference bridge |
| `batch-call-cxml` | CXML handler for both legs of conference bridge calls |
| `batch-conf-status` | Webhook for conference status events |
| `get-call` | Fetch call record by ID (API + internal) |
| `sync-recording` | Polls SignalWire for recordings, updates call_records |
| `execute-skill` | Runs agent skills (Cal.com, HubSpot, etc.) |
| `assign-phone-number` | Assign an existing number to an agent (inbound/outbound/sms slot) |
| `mcp-execute` | MCP server tool execution |
| `status-subscribe` | Status page subscription lifecycle (subscribe, confirm, unsubscribe, resend link, unsubscribe by phone) |
| `support-tickets-api` | Support ticket CRUD, reply sending, AI drafts, GitHub issue creation |
| `manage-call-whitelist` | CRUD for per-agent call whitelist entries (GET list, POST create, DELETE) |
| `whitelist-call-complete` | SignalWire `<Dial action>` webhook — marks call complete, sends notifications |
| `send-whatsapp-template` | Send a pre-approved WhatsApp template message via agent_id + E.164 recipient |
| `send-notification-sms` | Send SMS notification to agent owner (CORS-enabled for frontend test button) |
| `send-notification-email` | Send email notification to agent owner (CORS-enabled for frontend test button) |
| `send-notification-push` | Send web push notification to agent owner (CORS-enabled for frontend test button) |

## Voice Call Architecture

### Inbound Calls
```
Caller → SignalWire number → webhook-inbound-call
  → LiveKit room created
  → SIP leg joins room
  → Python voice agent (Render) picks up via dispatch rule
  → agent.py handles conversation
  → sip-recording-callback syncs recording on hang up
```

### Outbound Calls (Conference Bridge)
```
initiate-bridged-call
  → Creates call_record
  → Agent SIP leg (batch-call-cxml) fires FIRST → joins LiveKit room
  → PSTN leg dials customer (batch-call-cxml) → joins same conference
  → batch-conf-status handles event webhooks: stamps pstn_joined_at on PSTN answer; closes call_record when conference empties
  → Both legs: no hold music (waitUrl=""), timeLimit=5400 (90 min hard cap)
```

Conference name pattern: `outbound-{call_record_id}`

**Per-call variable injection**: `initiate-bridged-call` accepts `dynamic_variables: { key: value }` in the request body. Also accepts `agent_id` (overrides service_numbers assignment), `outbound_system_prompt` (per-call system prompt override, passed via LiveKit room metadata), and `metadata` (stored on `call_records.metadata` JSONB). Returns `422` with `no_agent_assigned` if neither body `agent_id` nor service_numbers assignment resolves to a valid agent. Values are stored in `call_records.call_variables` (JSONB) and the agent substitutes `{{key}}` placeholders in the system prompt at call time — keeping the agent config as the single source of truth while allowing per-call customisation.

**Instant greeting on answer**: `batch-conf-status` stamps `call_records.pstn_joined_at` when the PSTN callee answers (2 participants in conference). The voice agent polls for this field every 500ms and speaks the configured greeting immediately on detection — eliminating the 2-3s delay from waiting for callee speech + VAD + LLM.

**CXML leg config**:
- Agent leg: `endConferenceOnExit=true` — `delete_room` dropping the agent SIP leg cascades naturally to hang up the PSTN callee
- PSTN leg: `endConferenceOnExit=true` — customer hanging up also ends the conference
- Either side hanging up tears down the full call; no orphaned PSTN legs
- `credit_transactions` has UNIQUE INDEX on `(reference_id, transaction_type)` to prevent double billing

**Outbound call status + notifications**: `outbound-call-status` handles the PSTN leg status callback. On terminal status (completed/busy/failed/no-answer), it runs `backgroundWork` (identical pattern to `webhook-call-status`): polls up to 60s for recording URL + call summary, then dispatches to all 4 notification channels (email, SMS, push, Slack). Batch call recipients are excluded — they use their own per-recipient accounting.

## Voice Agent (Python)

- **File**: `agents/livekit-voice-agent/agent.py`
- **Framework**: livekit-agents
- **Deployment**: Render, auto-deploys on push to `master`
- **LLM**: `gpt-4.1-mini` (default — DB column default set to `'gpt-4.1-mini'`). NEVER use `gpt-4.1-nano`.
- **TTS**: ElevenLabs `eleven_flash_v2_5` (premade) / `eleven_multilingual_v2` (cloned). `VoiceSettings` (stability, similarity_boost, style, use_speaker_boost) read from `voices` table and passed to TTS. `streaming_latency=3` for lower time-to-first-audio. `auto_mode=True` (persistent streaming WebSocket). **Outbound calls**: agent fires `session.say(".")` immediately at session start to warm the WebSocket — the conference discards audio before the PSTN callee joins so callee never hears it; prevents "connection closed" on first real response after ringing period. **Voice ID fallback**: `DEPRECATED_VOICE_IDS = {"21m00Tcm4TlvDq8ikWAM"}` (Rachel, ElevenLabs v1 — removed); any agent still storing Rachel's ID falls back to Sarah automatically.
- **Config**: Reads from `agent_configs` + `service_numbers` DB tables
- **Custom functions**: Registered with `raw_schema`, HTTP webhook calls, injects `session_id` + `channel_type`
- **Agent name**: Uses `user_config.get("name") or user_config.get("agent_name") or "Assistant"` — no hardcoded names
- **Hang up**: `delete_room` API only — NOT `ctx.room.disconnect()`
- **Turn detection**: `livekit-plugins-turn-detector` `MultilingualModel` — detects end-of-turn semantically (not just silence). Model weights downloaded at Render build time via `snapshot_download('livekit/turn-detector', revision='v0.4.1-intl')` + `python agent.py download-files`. Falls back to silence-based endpointing if model unavailable.
- **HuggingFace cache**: `HF_HOME=/opt/render/project/src/hf_cache` — set in Render dashboard env vars and via `os.environ.setdefault` at top of `agent.py` so the inference subprocess inherits it. Non-hidden dir required (Render may exclude dotfiles).
- **Render plan**: Standard (2 GB RAM) — ONNX inference subprocess requires >512 MB; Starter plan OOMs.
- **Responsiveness** (`agent_configs.responsiveness`, 0–1): drives `min_endpointing_delay` (1.0s→0.1s), `max_endpointing_delay` (1.0s→0.4s fallback if turn detector uncertain), and STT `endpointing_ms` (500→100ms)
- **Interrupt sensitivity** (`agent_configs.interrupt_sensitivity`, 0–1): drives `min_interruption_duration` (0.7s→0.1s)

## Database (Supabase / PostgreSQL)

### Core Tables
| Table | Purpose |
|-------|---------|
| `users` | User profiles, plan, billing |
| `agent_configs` | Agent settings, prompt, voice, schedule |
| `status_subscribers` | Status page notification subscribers (email/SMS/webhook) |
| `service_numbers` | Phone numbers, 3-slot agent assignment (agent_id / outbound_agent_id / text_agent_id) |
| `call_records` | Call history, recording, transcript, sentiment |
| `sms_messages` | SMS threads |
| `contacts` | Contact book |
| `knowledge_sources` | KB source metadata + auth_headers |
| `knowledge_chunks` | Vectorized KB content (pgvector) |
| `custom_functions` | Webhook definitions per agent |
| `dynamic_variables` | Extraction config with Slack routing |
| `call_whitelist` | Per-agent whitelist entries: caller_number → forward_to blind-forward rules |

### Agent Columns (agent_configs)
| Column | Notes |
|--------|-------|
| `llm_model` | NOT `ai_model` (renamed 2026-02-26) |
| `voice_id` | ElevenLabs/OpenAI voice ID (NOT `voice`) |
| `recording_enabled` | boolean, default true |
| `system_prompt` | Single unified prompt (replaces old inbound/outbound split) |
| `greeting` | Opening line spoken by agent when it first picks up an inbound call (optional) |
| `vocabulary` | Custom terms/brand names for speech recognition |

### Phone Number Agent Slots (service_numbers)
- `agent_id` — inbound voice calls
- `outbound_agent_id` — outbound voice calls (nullable, falls back to agent_id)
- `text_agent_id` — SMS/text (nullable, falls back to agent_id)

## Multi-Channel Agent Assignment

Three independent agent slots per phone number:
- **Inbound**: answers incoming calls
- **Outbound**: used when placing calls from this number
- **SMS**: responds to text messages

UI: `src/pages/agent-detail/number-management.js` — shows "In:" / "Out:" / "Text:" badges

**API**: `POST /functions/v1/assign-phone-number` — assigns an existing number to an agent; auto-detects channel from agent type or accepts explicit `channel` param (`inbound`/`outbound`/`sms`).

**MCP tools** (`packages/mcp-server`): `assign_phone_number`, `initiate_call` (now supports `agent_id`, `outbound_system_prompt`, `metadata` params). Version `0.2.0`.

## Knowledge Base Pipeline

```
Add source → fetchPageContent (direct + JS fallback cascade)
  JS fallbacks: Firecrawl → Jina Reader → Microlink
  → chunkText (paragraph-based)
  → embed (OpenAI text-embedding-3-small)
  → store in knowledge_chunks (pgvector)

On call/SMS → semantic search knowledge_chunks → inject into prompt
```

Auth headers stored in `knowledge_sources.auth_headers` JSONB; forwarded to Firecrawl.

## Billing

- **Stripe**: subscription + credits model
- **Call billing**: `sip-recording-callback` (label=main only, dedup checked)
- **TTS billing**: per-character ElevenLabs, `ttsMinutes = chars/900` stored in `call_records`
- **Card details**: `users.card_brand` + `users.card_last4` set by Stripe webhook `setup_intent.succeeded`

## PWA / Service Worker

See `public/sw.js`. Key rules:
- Navigation (HTML pages): network-first, fallback to cached for offline
- `/assets/*`: cache-first (hashed filenames = immutable)
- Never pre-cache `index.html` — Vercel sends `no-cache` and SW must not override
- Bump `CACHE_NAME` on cache-busting changes

## Agent Skills Framework

Status: Branch `007-magpipe-agent-skills` — NOT merged to master as of 2026-03-10.
DB tables live in production: `skill_definitions`, `agent_skills`, `skill_executions`
Edge functions deployed: `execute-skill`, `process-scheduled-actions`, `mcp-execute`
Frontend NOT deployed to production.

## External Integrations

| Integration | Purpose | Notes |
|-------------|---------|-------|
| SignalWire | Telephony + SMS | Webhooks: inbound-call, inbound-sms |
| LiveKit | Voice AI infrastructure | SIP trunk ST_wTNU9hLWs9GD |
| ElevenLabs | TTS voices | 24 premade voices + voice cloning |
| OpenAI | LLM (gpt-4.1) + TTS (6 voices) + embeddings | |
| Stripe | Billing | Webhook: stripe-webhook edge function |
| Cal.com | Appointment booking (skills) | OAuth per user |
| HubSpot | CRM integration (skills) | Field mapping UI |
| Slack | Notifications + extracted data routing | Per-channel per-variable |
| Meta/WhatsApp | WhatsApp Business messaging | |
| LinkedIn | Blog post publishing | Personal posts only (no org scope) |
| Postmark | Transactional email (auth, notifications) | |
