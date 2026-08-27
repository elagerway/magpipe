# Maggie AI - LiveKit Voice Agent

Python-based LiveKit agent for handling real-time voice conversations with custom voice support.

## Features

- ✅ Real-time speech-to-text (Deepgram Nova-2)
- ✅ LLM conversation (OpenAI GPT-4o-mini)
- ✅ Text-to-speech with custom/cloned voices (ElevenLabs)
- ✅ Function calling (call transfer via SignalWire, dynamic data collection)
- ✅ Voice cloning during conversation (ElevenLabs API integration)
- ✅ Dynamic user configuration from Supabase
- ✅ Custom voice settings per user

## Deployment architecture: two workers (English vs Multilingual)

The agent runs as **two Render services** in the Magpipe project, split by turn-detector
model footprint (GH #95 / #96):

| Service | Render | agent name | env | turn detector | ~RAM |
|---|---|---|---|---|---|
| **English** | `magpipe` (`srv-d3g2gvmr433s738si3j0`) | `SW Telephony Agent` | (none) | English EOU only | ~0.7GB |
| **Multilingual** | `magpipe-multilingual` (`srv-d8q7svsm0tmc73a3eamg`) | `SW Telephony Agent ML` | `ENABLE_MULTILINGUAL_TURN_DETECTOR=1` | English + Multilingual | ~1.5GB |

**Why:** the LiveKit inference process eagerly loads every *registered* turn-detector
runner's ONNX model at startup. Importing `turn_detector.multilingual` registers it →
loads **~888MB** (vs ~66MB for English) — the bulk of idle RAM, which caused memory-pressure
stalls (`inference is slower than realtime`) on a 2GB dyno. `agent.py` imports Multilingual
**only** when `ENABLE_MULTILINGUAL_TURN_DETECTOR` is set; `_build_turn_detector` then uses it
for non-English agents, else English, else silence-based.

Only multilingual agents (`language ∈ multi/fr/es/de`) need the ML worker (currently just
**John / HelloMD**). Routing multilingual numbers → the ML worker is **WIP (GH #96)** — needs
a dedicated trunk + a DB-driven sync (a specific `inbound_numbers` rule does NOT override an
empty catch-all on the same trunk). Until then, master still has both models, so multilingual
agents work on Service A.

## Prerequisites

1. **LiveKit Cloud Account** (already configured)
2. **Deepgram API Key** - Get from https://console.deepgram.com/
3. **OpenAI API Key** - Already have
4. **ElevenLabs API Key** - Already have
5. **Render Account** - For deployment

## Local Development

### 1. Install Dependencies

```bash
cd agents/livekit-voice-agent
pip install -r requirements.txt
```

### 2. Configure Environment

Copy `.env.example` to `.env` and fill in your credentials:

```bash
cp .env.example .env
```

Edit `.env` with your actual keys.

### 3. Run Agent Locally

```bash
# Fix macOS SSL certificates first
export SSL_CERT_FILE=$(python3 -c "import certifi; print(certifi.where())")

python agent.py dev
```

This starts the agent in development mode, connecting to your LiveKit Cloud.

### 4. Local Testing with Dedicated Number (Recommended)

A separate LiveKit dispatch rule routes a test number to your **local** agent so it
never competes with the production Render agent. Both run in the same LiveKit project
(`wss://plug-bq7kgzpt.livekit.cloud`); they're kept apart purely by **agent name**.

**LiveKit dispatch rules (verified 2026-06-18 via the API):**

| Dispatch rule | Trunk | Agent name | Used by |
|---|---|---|---|
| `SDR_ALV2JP5LqHxi` ("SW Agent Local") | `ST_jKuUnR9Lo5zW` | **`SW Agent Local`** | **local** |
| `SDR_Zy9ZYV5YLNFA` ("SW-calls") | `ST_wTNU9hLWs9GD` | `SW Telephony Agent` | prod |
| `SDR_gn6yBMqXXugT` ("External-Twilio") | `ST_D37mjvGygAuh` | `SW Telephony Agent` | prod |

⚠️ The local agent name is **`SW Agent Local`** — NOT "SW Telephony Agent Local".
The worker's `agent_name` must match the dispatch rule's agent name *exactly* or
LiveKit silently never hands it the job (worker registers fine, no error, no call).

**Test number:** `+16042101966` (inbound routes to the local dispatch).

**Run the local agent:**
```bash
cd agents/livekit-voice-agent
export LIVEKIT_AGENT_NAME="SW Agent Local"     # MUST match the local dispatch rule
export SSL_CERT_FILE=$(python3 -c "import certifi; print(certifi.where())")
export HF_HOME="$HOME/.cache/huggingface"      # else agent.py defaults HF_HOME to a
                                               # Render path → "model_q8.onnx not found"
export LK_LOAD_THRESHOLD="0.99"                # laptops exceed the default 0.7 load
                                               # threshold and flap to "unavailable",
                                               # causing missed dispatches
./venv/bin/python agent.py download-files      # one-time: fetch VAD + turn-detector models
./venv/bin/python agent.py start
```

Confirm it registered under the right name:
```
registered worker ... "agent_name": "SW Agent Local"
```

**Then test:** call `+16042101966` from a phone (or trigger an outbound call from a
number routed to trunk `ST_jKuUnR9Lo5zW`). Watch the local log for the entrypoint and
`✅ Turn detector in use: ...`; query `call_state_logs` for that room to inspect timing.

**Diagnosing "no agent answers" (dead air, no errors in the local log):**
- Worker `agent_name` ≠ dispatch rule agent name (most common — see warning above).
- Worker flapping to "unavailable" on load → raise `LK_LOAD_THRESHOLD`.
- Wrong LiveKit project in `.env` (`LIVEKIT_URL`).
- Verify with the API: `lk.sip.list_dispatch_rule(...)` and `lk.room.list_rooms(...)`
  (an orphan room with `participants=0` = a call that found no agent).

### 5. Sending an outbound test call to a real phone

To ring a real cell from the local agent, POST to `initiate-bridged-call` with the
**local-routed** number as `caller_id`:

```bash
cd agents/livekit-voice-agent
source ./.env        # ⚠️ the AGENT .env has SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
                     # the repo-ROOT .env does NOT — sourcing it leaves $SUPABASE_URL
                     # empty and curl fails "URL malformed" (exit 3). This bit me repeatedly.
curl -s -X POST "$SUPABASE_URL/functions/v1/initiate-bridged-call" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" -H "Content-Type: application/json" \
  -d '{"phone_number":"<your cell>","caller_id":"+16042101966","user_id":"<user uuid>"}'
```

`caller_id: +16042101966` routes the agent leg to trunk `ST_jKuUnR9Lo5zW` → the local
agent. Watch the log for `✅ PSTN picked up — playing greeting`.

**For the greeting to play on pickup, two things are required:**
1. **`outbound-call-status` deployed with the `pstn_joined_at` stamp** — it stamps when the
   PSTN leg reports `answered`/`in-progress` (the "callee connected" signal). The agent
   *cannot* detect pickup itself: the callee is bridged in via SignalWire's conference, so
   it never appears as a LiveKit participant. This edge-function signal is the only way.
2. **A static `greeting` on the outbound agent** (`agent_configs.greeting`). With none, the
   agent falls back to `generate_reply()`, which **400s** ("text content blocks must contain
   non-whitespace text") because there's no conversation to reply to yet — that's the
   `voice_llm_failure` alert. The greeting plays via `session.say(..., allow_interruptions=False)`
   after a ~1s beat so it isn't cut off by the callee's reflexive "hello?".

**Gotchas that cost me time here:**
- After editing `agent.py`, restart the worker and **wait for `registered worker`** before
  dialing — dialing before it's up = dead air. Verify `ps -p <pid>` shows it alive (a
  restart that silently exits will look "started" but isn't registered).
- `service_numbers.outbound_agent_id` must point at the agent you expect — outbound calls
  resolve `outbound_agent_id` first, then fall back to `agent_id`.
- Run the dial `curl` from a shell script file, not inline, if the harness sandbox blocks
  inline network calls.

### 6. Testing prewarm (instant greeting on outbound)

Outbound/scheduled calls support **prewarm**: the agent is fully warmed *before* the
callee's phone rings, so they answer into an instant greeting instead of waiting out
the ~6s session startup.

**How it works:**
1. `initiate-bridged-call` fires the agent SIP leg, then — if `prewarm: true` — **polls
   `call_records.agent_warmed_at`** (keyed on `call_record_id`) for up to 15s before
   dialing the PSTN leg.
2. The agent stamps `call_records.agent_warmed_at` right after `session.start()`
   (STT/LLM/TTS connected) — look for `🔥 Stamped agent_warmed_at` in the agent log.
3. Once stamped (or on timeout), the edge function dials the callee. The ~6s warmup
   thus happens during ring time, not after pickup.

This signal is keyed on `call_record_id` (NOT room name), so it works on any
worker/room/dispatch — unlike the old room-poll prewarm, which was a no-op (it polled
a room the agent never joins). See `prewarm-call-debacle.md`.

**Test it locally:**
```bash
# local agent running as "SW Agent Local"; initiate-bridged-call deployed with the poll.
curl -s -X POST "$SUPABASE_URL/functions/v1/initiate-bridged-call" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" -H "Content-Type: application/json" \
  -d '{"phone_number":"<your cell>","caller_id":"+16042101966","user_id":"<user>","prewarm":true}'
```
Watch the agent log for `🔥 Stamped agent_warmed_at`, then verify `call_records.agent_warmed_at`
is set. The callee's phone rings only *after* that stamp → instant greeting.

⚠️ **Don't test within ~30s of a Render deploy.** During a rolling deploy the old and
new workers both register under the same `agent_name` briefly; a call in that window can
get a **second spurious dispatch** that resolves to "number not assigned" and disconnects
the room (symptom: greeting, then silence). Wait for the deploy to fully settle before testing.

## Deployment on Render

### Option 1: Deploy via Render Dashboard

1. Go to https://dashboard.render.com/
2. Click "New +" → "Web Service"
3. Connect your GitHub repository
4. Select the `agents/livekit-voice-agent` directory as the root
5. Configure:
   - **Name**: `magpipe-livekit-agent`
   - **Environment**: Python 3
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `python agent.py start`
   - **Plan**: Starter ($7/month) or higher

6. Add Environment Variables (from Render dashboard):
   ```
   LIVEKIT_URL=wss://<your-livekit-subdomain>.livekit.cloud
   LIVEKIT_API_KEY=<your_livekit_api_key>
   LIVEKIT_API_SECRET=<your_livekit_api_secret>
   SUPABASE_URL=<your_supabase_url>
   SUPABASE_SERVICE_ROLE_KEY=<your_service_role_key>
   SIGNALWIRE_SPACE=<your_space>.signalwire.com
   SIGNALWIRE_PROJECT_ID=<your_project_id>
   SIGNALWIRE_API_TOKEN=<your_api_token>
   OPENAI_API_KEY=<your_openai_key>
   DEEPGRAM_API_KEY=<get_from_deepgram>
   ELEVENLABS_API_KEY=<your_elevenlabs_key>
   ```

7. Click "Create Web Service"

### Option 2: Deploy via Blueprint (render.yaml)

1. In Render dashboard, click "New +" → "Blueprint"
2. Connect repository and select `agents/livekit-voice-agent/render.yaml`
3. Fill in environment variables when prompted
4. Deploy

## Required API Keys

### Deepgram (STT)

1. Sign up at https://console.deepgram.com/
2. Create a new project
3. Generate API key
4. Free tier includes $200 credits

### Already Have

- OpenAI API Key ✅
- ElevenLabs API Key ✅
- LiveKit credentials ✅
- Supabase credentials ✅

## Testing

Once deployed, the agent will:

1. Listen for LiveKit room connections
2. Load user configuration from Supabase
3. Start voice pipeline when participant joins
4. Handle real-time conversation with:
   - Speech recognition (Deepgram)
   - LLM responses (OpenAI GPT-4o-mini)
   - Voice synthesis with custom/cloned voices (ElevenLabs)
   - Function calling:
     - Call transfer via SignalWire
     - Dynamic data collection (email, phone, name, etc.)
     - Voice cloning from audio samples

## Architecture

```
Incoming Call (SignalWire)
  ↓
webhook-inbound-call (checks active_voice_stack = 'livekit')
  ↓
Create LiveKit Room + SIP Connection
  ↓
LiveKit Agent (on Render)
  ↓
Pipeline: Deepgram STT → OpenAI LLM → ElevenLabs TTS
  ↓
Real-time voice conversation
```

## Monitoring

- **Render Logs**: View at https://dashboard.render.com/ → Your Service → Logs
- **LiveKit Dashboard**: https://cloud.livekit.io/projects
- **Supabase Logs**: Edge function logs for room creation

## Troubleshooting

### Agent not connecting to rooms

- Check LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET are correct
- Verify Render service is running (not sleeping)
- Check Render logs for errors

### No audio in calls

- Verify Deepgram API key is valid and has credits
- Check ElevenLabs API key is valid
- Ensure voice_id exists in ElevenLabs account

### Transfer function not working

- Verify transfer_numbers table has records for user
- Check Supabase connection (SUPABASE_URL, SERVICE_ROLE_KEY)

## Cost Estimate

- **Render**: $7/month (Starter plan)
- **LiveKit**: ~$0.02/min
- **Deepgram**: ~$0.0043/min
- **OpenAI GPT-4o-mini**: ~$0.005/min
- **ElevenLabs**: ~$0.01/min

**Total**: ~$0.04/min + $7/month base

Compare to Retell: $0.09/min (56% savings!)

## Next Steps

After deployment:

1. Get Deepgram API key
2. Deploy to Render
3. Configure LiveKit SIP trunk to point to SignalWire
4. Update user's `active_voice_stack` to 'livekit' in database
5. Test with a call!
# Auto-deploy trigger Fri Oct  3 16:44:30 PDT 2025
