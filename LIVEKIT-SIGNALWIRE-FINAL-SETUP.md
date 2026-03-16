# LiveKit + SignalWire Integration - Final Setup Guide

## What We've Built

✅ **Dynamic SWML Handler** - Deployed Edge Function that returns SWML on-demand
✅ **Status Webhook** - Receives real-time call status updates from SignalWire
✅ **LiveKit Integration** - Browser joins rooms, Edge Function creates SIP participants

---

## Setup Steps

### Step 1: Create SIP Address in SignalWire Dashboard

Since the programmatic API isn't available, you need to create a SIP Domain Application in the SignalWire dashboard:

1. **Go to SignalWire Dashboard:** https://signalwire.com/signin
2. **Navigate to Resources** (left sidebar)
3. **Click "Create New Resource"**
4. **Select "Script"** → **"SWML Application"**
5. **Name it:** `LiveKit Outbound Bridge`
6. **For the script content, use "External URL"** option if available, OR paste this minimal SWML:
   ```json
   {
     "version": "1.0.0",
     "sections": {
       "main": [
         {
           "transfer": {
             "dest": "https://mtxbiyilvgwhbdptysex.supabase.co/functions/v1/livekit-swml-handler"
           }
         }
       ]
     }
   }
   ```
   This forwards to our dynamic handler which generates the actual SWML.

7. **Save the script**
8. **Go to "Addresses & Phone Numbers" tab** in the script
9. **Click "Add"** → **"SIP Address"**
10. **You'll get a domain like:** `erik-livekit.dapp.signalwire.com`
11. **Copy this exact domain**

### Step 2: Update LiveKit Trunk

1. **Go to LiveKit Dashboard:** https://cloud.livekit.io/
2. **Select project:** `plug-bq7kgzpt`
3. **Click "SIP"** in left menu
4. **Find trunk:** `ST_3DmaaWbHL9QT`
5. **Click "Edit"**
6. **Update these fields:**
   ```
   Name: SignalWire Outbound Trunk
   Address: [paste the domain from Step 1]
   Transport: TLS
   Auth Username: fb9ea15e-cf87-4de2-8be2-0f619b8e956e
   Auth Password: YOUR_SIGNALWIRE_API_TOKEN
   Numbers: +14152518686, +16042566768, +16042101966, +12013040992, +16042431596
   ```
7. **Save the trunk**

### Step 3: Test the Call Flow

Run a test call:

```bash
./test-and-monitor.sh
```

**Expected Flow:**

1. ✅ Browser calls Edge Function `livekit-outbound-call`
2. ✅ Edge Function creates LiveKit room with metadata
3. ✅ Edge Function creates SIP participant pointing to SignalWire DAPP
4. ✅ Browser joins LiveKit room
5. ✅ LiveKit connects to SignalWire DAPP via SIP/TLS
6. ✅ SignalWire receives SIP INVITE and calls our SWML handler
7. ✅ SWML handler returns script to bridge call to phone number
8. ✅ SignalWire places PSTN call to destination number
9. ✅ **Phone rings!** 📞
10. ✅ Answer and verify two-way audio with AI agent

---

## Deployed Endpoints

### Dynamic SWML Handler
```
https://mtxbiyilvgwhbdptysex.supabase.co/functions/v1/livekit-swml-handler
```
- **Purpose:** Returns SWML script dynamically based on call parameters
- **Called by:** SignalWire when SIP call arrives at DAPP domain
- **Returns:** JSON SWML that bridges call to destination number

### Status Webhook
```
https://mtxbiyilvgwhbdptysex.supabase.co/functions/v1/signalwire-status-webhook
```
- **Purpose:** Receives call status updates (initiated, answered, completed)
- **Called by:** SignalWire SWML script during call lifecycle
- **Updates:** `call_records` table and logs to `webhook_logs`

### LiveKit Outbound Call
```
https://mtxbiyilvgwhbdptysex.supabase.co/functions/v1/livekit-outbound-call
```
- **Purpose:** Initiates outbound calls through LiveKit
- **Called by:** Browser when user clicks "Call"
- **Creates:** LiveKit room + SIP participant

### LiveKit Token Generator
```
https://mtxbiyilvgwhbdptysex.supabase.co/functions/v1/livekit-token
```
- **Purpose:** Generates access tokens for browser to join LiveKit rooms
- **Called by:** Browser after call initiation
- **Returns:** JWT token for WebRTC connection

---

## Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│                         Call Flow                                     │
└──────────────────────────────────────────────────────────────────────┘

1. User clicks "Call" in browser
   │
   ▼
2. Browser → livekit-outbound-call Edge Function
   │
   ├─→ Creates LiveKit room (with metadata)
   ├─→ Creates SIP participant (calls SignalWire DAPP)
   └─→ Inserts call_record in database
   │
   ▼
3. Browser → livekit-token Edge Function
   │
   └─→ Gets JWT token to join room
   │
   ▼
4. Browser connects to LiveKit room via WebRTC
   │
   ├─→ Enables microphone
   └─→ Subscribes to audio tracks
   │
   ▼
5. LiveKit → SignalWire DAPP (erik-livekit.dapp.signalwire.com)
   │
   └─→ SIP INVITE sent over TLS
   │
   ▼
6. SignalWire DAPP → livekit-swml-handler Edge Function
   │
   ├─→ Sends call parameters (From, To, CallSid)
   └─→ Receives dynamic SWML script
   │
   ▼
7. SignalWire executes SWML:
   │
   ├─→ Sends webhook: call_state=initiated
   ├─→ Bridges call to destination phone number
   ├─→ Sends webhook: call_state=answered (when picked up)
   └─→ Sends webhook: call_state=completed (when hung up)
   │
   ▼
8. Phone rings → User answers → Conversation happens
   │
   ├─→ Audio flows: Browser ↔ LiveKit ↔ SignalWire ↔ Phone
   ├─→ AI Agent joins LiveKit room (from metadata)
   └─→ Full conversation recorded by LiveKit
```

---

## Troubleshooting

### If phone doesn't ring:

1. **Check LiveKit trunk address** - Must be exact DAPP domain from SignalWire
2. **Check SignalWire logs:**
   - Dashboard → Resources → LiveKit Outbound Bridge → Logs
   - Look for incoming SIP INVITEs
3. **Check SWML handler logs:**
   ```bash
   npx supabase functions logs livekit-swml-handler
   ```
4. **Check webhook logs:**
   ```bash
   npx supabase functions logs signalwire-status-webhook
   ```

### If LiveKit can't connect to SignalWire:

- Verify trunk transport is **TLS** (not UDP or TCP)
- Verify auth credentials match Project ID and API Token
- Try creating a new trunk with correct settings

### If browser can't join LiveKit room:

- Check `VITE_LIVEKIT_URL` in .env
- Restart dev server after changing .env
- Check browser console for WebRTC errors

### If no audio:

- Check browser microphone permissions
- Verify codecs (PCMU/PCMA) are supported
- Check NAT/firewall isn't blocking RTP ports

---

## Database Schema

### call_records table
- **livekit_room_id** - LiveKit room name for the call
- **contact_phone** - Destination phone number
- **service_number** - Caller ID (service number)
- **status** - Call status (ringing, established, completed, failed)
- **direction** - Always 'outbound' for LiveKit calls
- **started_at, ended_at, duration** - Call timing
- **recording_url** - Link to LiveKit recording (if enabled)

### webhook_logs table
- **source** - 'signalwire' or 'livekit'
- **event_type** - Call state (initiated, answered, completed)
- **payload** - Full JSON payload from webhook
- **created_at** - Timestamp

---

## Next Steps

Once calls are working:
1. ✅ Enable LiveKit egress for automatic recording
2. ✅ Add transcription via LiveKit or external service
3. ✅ Implement call analytics and metrics
4. ✅ Add inbound call routing (SignalWire → LiveKit)
5. ✅ Configure AI agent to join rooms automatically
