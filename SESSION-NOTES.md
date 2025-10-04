# Session Notes

**Last Updated:** 2025-10-03
**Active Branch:** Pat-AI

---

## Current Session (2025-10-03)

### ✅ RESOLVED: LiveKit Agent PSTN Call Issues on Render

**Problem:**
- Calls from PSTN → SignalWire → LiveKit Agent failing with multiple errors
- Agent crashing on startup

**Root Causes (Fixed):**
- Wrong VAD import: `rtc.VAD.load()` → should be `silero.VAD.load()`
- Missing silero dependency in requirements.txt
- Wrong TTS parameter names (voice → voice_id, model_id → model)
- Missing explicit API key (plugin expects ELEVEN_API_KEY, we use ELEVENLABS_API_KEY)

**Fixes Applied:** ✅
1. **VAD Import Fix** (5184a87)
   - Added `silero` to imports from livekit.plugins
   - Changed `vad=rtc.VAD.load()` to `vad=silero.VAD.load()`

2. **Missing Dependency** (59e728e)
   - Added `livekit-plugins-silero>=0.6.0` to requirements.txt

3. **ElevenLabs TTS Parameters** (4257ee2)
   - Fixed parameter names: `voice` → `voice_id`, `model` → `model_id`
   - Removed deprecated parameters (stability, similarity_boost, optimize_streaming_latency)
   - **Deployment Status:** ~~LIVE~~ ❌ (Still had wrong param)

4. **ElevenLabs TTS Model Parameter** (d132d94)
   - Fixed parameter name: `model_id` → `model` (correct per LiveKit docs)
   - **Deployment Status:** ~~LIVE~~ ❌ (Missing API key)

5. **ElevenLabs API Key** (8d1e22f)
   - Plugin expects ELEVEN_API_KEY but we use ELEVENLABS_API_KEY
   - Pass explicitly via api_key parameter
   - **Deployment Status:** LIVE ✅ (06:06:39 UTC)

**Next Steps:**
1. ✅ ~~Fix deployment errors~~ - DONE (5 fixes deployed)
2. ✅ ~~Wait for Render deployment to complete (commit 8d1e22f)~~ - LIVE
3. ✅ ~~Test PSTN call to verify agent connects and responds properly~~ - **SUCCESS!** 🎉
4. ✅ ~~Enable voice cloning UI for LiveKit~~ - DONE (commit 35173fa)
5. Monitor for VAD issues (cutting off users, not detecting end of speech, etc.)
6. Optional: Tune VAD parameters if needed

**Recent Related Commits:**
- `8d1e22f` - Pass ELEVENLABS_API_KEY explicitly to TTS ✅ **LIVE**
- `d132d94` - Fix ElevenLabs TTS parameter - use model instead of model_id ✅
- `4257ee2` - Fix ElevenLabs TTS parameter names (voice_id) - model_id still wrong ❌
- `59e728e` - Add livekit-plugins-silero to requirements ✅
- `5184a87` - Fix VAD import - use silero.VAD instead of rtc.VAD ✅
- `211da61` - Update session notes and audits with VAD import fix
- `14dd33f` - Update audits.md with session memory system entry
- `ea00ca4` - Add persistent session memory system

**Uncommitted Changes:**
- Multiple LiveKit debugging scripts added
- agent.py modifications
- Edge function updates for voice stack switching

---

## Session History

### 2025-10-02: Transfer Number Management & Voice Cloning
- Implemented transfer number management with validation
- Added voice cloning feature for LiveKit stack
- Created multiple LiveKit debugging/management scripts

### 2025-10-01: Agent Configuration & Code Audit
- Added advanced agent settings with auto-save
- Complete codebase audit performed
- All systems operational

---

## Technical Context

### LiveKit Agent Architecture
- **Location:** `agents/livekit-voice-agent/agent.py`
- **Pipeline:** Silero VAD → Deepgram STT → OpenAI LLM → ElevenLabs TTS
- **Deployment:** Render.com as background service
- **Health Check:** HTTP server on port 10000
- **Entry Point:** `entrypoint(ctx)` function called for each LiveKit room

### VAD Configuration (Current)
```python
vad=silero.VAD.load()  # Line 352
```

**Available Silero VAD Parameters (not yet configured):**
- `min_speech_duration` - minimum speech length to detect
- `min_silence_duration` - how long silence before end-of-speech
- `activation_threshold` - sensitivity to speech
- `prefix_padding_duration` - include audio before speech starts
- `max_speech_duration` - maximum continuous speech length

### Voice AI Stack
- **Current Active Stack:** LiveKit (custom voice support)
- **Alternative Stack:** Retell (preset voices only)
- **Stack switching:** Admin-controlled via database

---

## Debugging Resources

### LiveKit Scripts (Created)
- `scripts/check-livekit-trunk.js` - Check trunk configuration
- `scripts/debug-livekit-call.js` - Debug active calls
- `scripts/update-livekit-trunk.js` - Update trunk settings
- `scripts/get-livekit-call.js` - Get call details
- `scripts/recreate-livekit-trunk-tls.js` - Recreate TLS trunk
- `agents/livekit-voice-agent/monitor-render.sh` - Monitor Render logs

### Key Environment Variables
- `LIVEKIT_URL` - LiveKit server URL
- `LIVEKIT_API_KEY` - API credentials
- `LIVEKIT_API_SECRET` - API secret
- `ELEVENLABS_API_KEY` - TTS provider
- `OPENAI_API_KEY` - LLM provider
- `DEEPGRAM_API_KEY` - STT provider

---

## Important Reminders

- **Never reset database without explicit request** (see CLAUDE.md)
- **Always update audits.md with commits** (see CLAUDE.md)
- **Test in browser after JavaScript changes** (see CLAUDE.md)
- **Update this file at end of each session** with current state
