# Session Notes

**Last Updated:** 2025-10-03
**Active Branch:** Pat-AI

---

## Current Session (2025-10-03)

### Active Work: LiveKit Agent VAD Issues on Render

**Problem:**
- LiveKit voice agent experiencing VAD (Voice Activity Detection) issues when deployed on Render
- User lost power mid-session - working on fixing VAD configuration

**Context:**
- Agent is deployed on Render and runs as a background service
- Using Silero VAD for speech detection (agents/livekit-voice-agent/agent.py:352)
- Current VAD config: `vad=silero.VAD.load()` with default parameters

**Known Issues:**
- VAD behavior needs tuning (specific symptoms TBD when user provides details)
- Agent has gone through multiple iterations to stabilize (see commit history)

**Next Steps:**
1. Determine specific VAD symptom (cutting off users? not detecting end of speech? etc.)
2. Add custom VAD parameters to Silero configuration
3. Test and deploy updated config to Render

**Recent Related Commits:**
- `7d4f89f` - Add detailed logging to track agent lifecycle and crashes
- `0aa16a2` - Trigger Render redeploy - restart LiveKit agent
- `c87cc34` - Simplify LiveKit agent - focus on basic calling only

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
