# LiveKit Agent - Post-Deployment Steps

## Step 1: Verify Deployment Success

Check that the agent deployed successfully:
- Visit: https://dashboard.render.com/web/your-render-service-id
- Look for "Live" status (green)
- Check logs for "Agent started successfully" or similar message

## Step 2: Configure LiveKit SIP Trunk

### A. Get LiveKit SIP Information

1. Go to LiveKit Cloud Dashboard: https://cloud.livekit.io/projects
2. Select your project (`plug-bq7kgzpt`)
3. Navigate to **SIP** section
4. Note your SIP domain (e.g., `5t4n6j0wnrl.sip.livekit.cloud`)

### B. Create SIP Trunk in LiveKit

```bash
# Create a SIP trunk for incoming calls from SignalWire
# This needs to be done via LiveKit CLI or API

livekit-cli sip create-trunk \
  --url wss://plug-bq7kgzpt.livekit.cloud \
  --api-key your-livekit-api-key \
  --api-secret your-livekit-api-secret \
  --name "SignalWire Inbound" \
  --inbound-addresses "erik.signalwire.com"
```

Or via LiveKit Dashboard:
1. Go to SIP Trunks
2. Click "Create SIP Trunk"
3. Name: `SignalWire Inbound`
4. Inbound Addresses: `erik.signalwire.com`
5. Save

### C. Update SignalWire to Point to LiveKit

Instead of updating webhook-inbound-call to dial Retell's SIP, we need to dial LiveKit's SIP domain.

The webhook will need to create a LiveKit room first, then dial into it.

## Step 3: Update Webhook to Support LiveKit SIP

The current webhook-inbound-call already routes by `active_voice_stack`, but the LiveKit path needs to:

1. Call `livekit-create-room` edge function to create a room
2. Get the LiveKit SIP dial string
3. Return TwiML to dial into LiveKit SIP domain

## Step 4: Switch Your User to LiveKit Stack

Run this SQL in Supabase SQL Editor:

```sql
-- Update your user to use LiveKit stack
UPDATE agent_configs
SET active_voice_stack = 'livekit'
WHERE user_id = (
  SELECT id FROM users WHERE email = 'elagerwav@gmail.com'
);
```

Or use a script (see `switch-to-livekit.js` below)

## Step 5: Test Call Flow

1. Call your Maggie number
2. Check Render logs for agent activity
3. Verify conversation works
4. Test custom voice (if configured)

## Step 6: Test Voice Cloning

During a call, ask Maggie to:
- "Can you clone my voice?"
- Provide audio sample URL
- Voice should be cloned and saved to database

## Monitoring & Debugging

### Render Logs
```bash
# View real-time logs
https://dashboard.render.com/web/your-render-service-id/logs
```

### LiveKit Dashboard
```bash
# Monitor active rooms and participants
https://cloud.livekit.io/projects/plug-bq7kgzpt/rooms
```

### Supabase Logs
```bash
# Check edge function logs
https://supabase.com/dashboard/project/mtxbiyilvgwhbdptysex/logs/edge-functions
```

## Common Issues

### Agent Not Connecting to Rooms
- Check LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET are correct
- Verify agent is running (check Render logs)
- Check LiveKit dashboard for active agents

### No Audio in Calls
- Verify Deepgram API key is valid
- Check ElevenLabs API key is valid
- Look for STT/TTS errors in Render logs

### Transfer Not Working
- Verify SignalWire credentials are correct
- Check transfer_numbers table has records for user
- Look for transfer errors in logs

## Success Criteria

✅ Agent shows "Live" in Render
✅ LiveKit dashboard shows active agent
✅ Test call connects and Maggie answers
✅ Conversation is natural (STT → LLM → TTS working)
✅ Custom voice works (if configured)
✅ Voice cloning function is available
