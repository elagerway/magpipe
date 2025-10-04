# Session Notes

**Last Updated:** 2025-10-03
**Active Branch:** Pat-AI

---

## Current Session (2025-10-03)

### Active Work: LiveKit Agent PSTN Call Issues on Render

**Problem:**
- Calls from PSTN → SignalWire → LiveKit Agent failing with import error
- Agent crashing on startup with `AttributeError: module 'livekit.rtc' has no attribute 'VAD'`

**Root Cause:**
- Deployed version on Render had wrong import: `rtc.VAD.load()`
- Should be: `silero.VAD.load()`
- Local file had correct code but wasn't deployed

**Fix Applied:** ✅
- Added `silero` to imports from livekit.plugins
- Changed `vad=rtc.VAD.load()` to `vad=silero.VAD.load()`
- Committed and pushed (5184a87)
- **Additional fix:** Added `livekit-plugins-silero>=0.6.0` to requirements.txt (59e728e)
- **Deployment Status:** LIVE ✅ (22:35:19 UTC)

**Next Steps:**
1. ✅ ~~Monitor Render logs to confirm successful deployment~~ - DONE
2. Test PSTN call to verify agent connects and responds properly
3. If calls work, tune VAD parameters if needed (cutting off users, not detecting end of speech, etc.)

**Recent Related Commits:**
- `59e728e` - Add livekit-plugins-silero to requirements ✅ LIVE
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
