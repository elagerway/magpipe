# LiveKit SIP Integration Specification

**Last Updated:** 2025-10-24
**Status:** Active
**Owner:** Maggie AI Platform

---

## Overview

This document specifies the LiveKit SIP integration for handling inbound PSTN calls through SignalWire → LiveKit → AI Agent workflow.

## Architecture

```
PSTN Caller
    ↓
SignalWire (SIP Provider)
    ↓ SIP INVITE
LiveKit SIP Trunk (ST_eDVUAafvDeF6)
    ↓ Dispatch Rule
LiveKit Room (call-{unique_id})
    ↓ Agent Assignment
LiveKit Agent Worker (Render)
    ↓ Voice Pipeline
STT (Deepgram) → LLM (OpenAI) → TTS (ElevenLabs)
```

## Critical Components

### 1. LiveKit SIP Trunk

**Location:** LiveKit Cloud Dashboard → SIP → Trunks
**Current Trunk ID:** `ST_eDVUAafvDeF6`
**Name:** SignalWire Inbound
**Type:** TRUNK_INBOUND
**Transport:** SIP_TRANSPORT_AUTO

**Inbound Numbers Configuration:**
- **CRITICAL DISCOVERY:** Set `allowedNumbers` to empty array `[]` to accept ALL numbers
- **DO NOT use wildcards:** Wildcards like `+1` do NOT work and will break incoming calls
- **DO NOT set specific numbers:** Setting specific numbers will restrict to only those numbers
- **Correct configuration:** `"allowedNumbers": []` (empty array = unrestricted)
- **Example working config:**
  ```json
  {
    "allowedAddresses": ["0.0.0.0/0"],
    "allowedNumbers": []
  }
  ```
- **Why this matters:** Users can add new phone numbers without updating the trunk configuration

### 2. LiveKit SIP Dispatch Rule

**Location:** LiveKit Cloud Dashboard → SIP → Dispatch Rules
**Current Rule ID:** `SDR_yFiprRssooJC`
**Name:** Sw-calls

**Configuration:**
```json
{
  "trunkIds": ["ST_eDVUAafvDeF6"],
  "hidePhoneNumber": false,
  "name": "Sw-calls",
  "inboundNumbers": ["+1"],
  "rule": {
    "dispatchRuleIndividual": {
      "roomPrefix": "call-",
      "pin": ""
    }
  },
  "roomConfig": {
    "agents": [
      {
        "agentName": "SW Telephony Agent",
        "metadata": ""
      }
    ]
  }
}
```

**Critical Fields:**
- `trunkIds`: MUST match the SIP trunk ID
- `inboundNumbers`: MUST be populated (empty array = no calls accepted)
- `rule.dispatchRuleIndividual`: Creates unique room per call
- `roomConfig.agents[0].agentName`: MUST match agent registration name in code

### 3. LiveKit Agent Worker

**Location:** `agents/livekit-voice-agent/agent.py`
**Deployment:** Render.com (auto-deploy from git push)
**Service:** https://pat-livekit-agent.onrender.com
**Health Check:** HTTP server on port 10000

**Agent Registration (line 411):**
```python
cli.run_app(
    WorkerOptions(
        entrypoint_fnc=entrypoint,
        agent_name="SW Telephony Agent"  # MUST match dispatch rule
    )
)
```

**Entry Point (line 248):**
```python
async def entrypoint(ctx: JobContext):
    """Called for each new LiveKit room created by dispatch rule"""
```

### 4. Voice ID Mapping

**Critical Requirement:** Voice IDs MUST be real ElevenLabs voice IDs, NOT friendly names.

**Valid Format:** `"21m00Tcm4TlvDq8ikWAM"` (20-character alphanumeric)
**Invalid Format:** `"11labs-Kate"` or `"Kate"` (friendly name)

**Locations Using Voice IDs:**

1. **UI Dropdown** (`src/pages/agent-config.js` lines 95-116)
   ```javascript
   <option value="21m00Tcm4TlvDq8ikWAM">Rachel (Default)</option>
   ```

2. **Default Voice** (`src/pages/verify-phone.js` line 440)
   ```javascript
   voice_id: '21m00Tcm4TlvDq8ikWAM'
   ```

3. **Agent Creation** (`src/pages/agent-config.js` line 1198)
   ```javascript
   voice_id: '21m00Tcm4TlvDq8ikWAM'
   ```

4. **Database** (`agent_configs` table)
   - Column: `voice_id`
   - Type: `text`
   - Must contain real ElevenLabs voice ID

5. **Agent Code** (`agents/livekit-voice-agent/agent.py` line 330)
   ```python
   def get_voice_config(voice_id: str, user_id: str):
       clean_voice_id = voice_id.replace("11labs-", "")
       # Returns clean_voice_id for use with ElevenLabs API
   ```

**Why This Matters:**
- Agent strips `"11labs-"` prefix if present
- `"11labs-Kate"` → `"Kate"` → NOT a valid ElevenLabs voice ID
- `"21m00Tcm4TlvDq8ikWAM"` → `"21m00Tcm4TlvDq8ikWAM"` → Valid!

## Common ElevenLabs Voice IDs

| Name | Voice ID |
|------|----------|
| Rachel | `21m00Tcm4TlvDq8ikWAM` |
| Adam | `pNInz6obpgDQGcFmaJgB` |
| Sarah | `EXAVITQu4vr4xnSDxMaL` |
| Elli | `MF3mGyEYCl7XYWbV9V6O` |
| Josh | `TxGEqnHWrfWFTfGW9XjX` |
| Lily | `pFZP5JQG7iQjIQuC4Bku` |
| Brian | `nPczCjzI2devNBz1zQrb` |

## Troubleshooting

### "Service Unavailable" Error

**Symptom:** Calls fail immediately with SIP error "Service Unavailable"

**Possible Causes:**

1. **Number not in SIP trunk's inbound numbers**
   - Check: LiveKit Dashboard → SIP → Trunks → ST_eDVUAafvDeF6 → Inbound Numbers
   - Fix: Add the phone number or use `+1` wildcard

2. **Dispatch rule missing or misconfigured**
   - Check: LiveKit Dashboard → SIP → Dispatch Rules
   - Verify: Rule exists and has `trunkIds: ["ST_eDVUAafvDeF6"]`

3. **Empty inboundNumbers array in dispatch rule**
   - Check: Dispatch rule configuration
   - Fix: Set `inboundNumbers: ["+1"]` to accept all US/Canada calls

4. **Agent worker not running**
   - Check: https://dashboard.render.com/web/your-render-service-id
   - Verify: Service is "Live" and no recent errors in logs

### "Connection Closed" / No Audio

**Symptom:** Call connects but no audio, agent logs show "connection closed"

**Possible Causes:**

1. **Invalid ElevenLabs voice ID**
   - Check: Database `agent_configs` table, column `voice_id`
   - Verify: Value is 20-character alphanumeric (e.g., `21m00Tcm4TlvDq8ikWAM`)
   - Fix: Update to valid voice ID from table above

2. **Missing API keys**
   - Check: Render environment variables
   - Required: `ELEVENLABS_API_KEY`, `OPENAI_API_KEY`, `DEEPGRAM_API_KEY`

3. **Agent crash on startup**
   - Check: Render logs for Python errors
   - Common: Missing dependencies, import errors

### Agent Name Mismatch

**Symptom:** Calls create rooms but agent never joins

**Cause:** Agent name in dispatch rule doesn't match agent registration

**Check:**
- Dispatch rule: `roomConfig.agents[0].agentName`
- Agent code: `agent_name` parameter in `cli.run_app()`

**Must Match:** Both must be `"SW Telephony Agent"` (exact, case-sensitive)

## Management Scripts

### Check Current Configuration
```bash
node scripts/check-livekit-trunk.js
```

### Update Dispatch Rule (Deprecated - Use Dashboard)
```bash
# NOTE: LiveKit SDK requires full object for updates
# Safer to use LiveKit Dashboard for changes
node scripts/update-livekit-dispatch.js
```

### List Active Rooms
```bash
node -e "
import { RoomServiceClient } from 'livekit-server-sdk';
const client = new RoomServiceClient(
  process.env.LIVEKIT_URL,
  process.env.LIVEKIT_API_KEY,
  process.env.LIVEKIT_API_SECRET
);
console.log(await client.listRooms());
"
```

## Emergency Recovery

### If Dispatch Rule is Deleted

1. **DO NOT attempt programmatic recreation** - LiveKit SDK is unreliable for complex objects
2. **Go to LiveKit Dashboard:**
   - Navigate to SIP → Dispatch Rules
   - Click "Create Rule"
   - Fill in configuration (see section 2 above)
   - Save

3. **Verify Configuration:**
   ```bash
   node scripts/check-livekit-trunk.js
   ```

4. **Test with actual call** to verify functionality

### If Voice IDs are Wrong

1. **Update UI dropdowns** in `src/pages/agent-config.js`
2. **Update database:**
   - Go to Supabase Dashboard → Table Editor → agent_configs
   - Find affected users
   - Update `voice_id` column to valid ElevenLabs voice ID
3. **Update default values** in `src/pages/verify-phone.js` and `src/pages/agent-config.js`
4. **Test voice preview** in UI to verify

## Best Practices

1. ✅ **Always test end-to-end** after configuration changes (actual phone call)
2. ✅ **Use LiveKit Dashboard** for SIP infrastructure changes (not SDK)
3. ✅ **Document all changes** in SESSION-NOTES.md and audits.md
4. ✅ **Verify agent logs** after deployment (Render dashboard)
5. ✅ **Keep voice IDs real** - never use friendly names in database/UI
6. ❌ **NEVER delete dispatch rules** without 100% certainty of recreation
7. ❌ **NEVER assume deployment = working** - always test actual calls

## References

- [LiveKit SIP Documentation](https://docs.livekit.io/realtime/client/sip/)
- [ElevenLabs API Documentation](https://elevenlabs.io/docs/api-reference)
- [SignalWire SIP Trunking](https://developer.signalwire.com/guides/sip-trunking/)

---

**Maintainers:** Update this document when making changes to SIP integration.
