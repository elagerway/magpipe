# Setting Up LiveKit → SignalWire Integration

## Problem
LiveKit outbound calls are timing out because the trunk is pointing to the wrong SignalWire endpoint. We need to create a SignalWire DAPP (SIP application) specifically for LiveKit.

## Solution Steps

### Step 1: Create SWML Script in SignalWire

1. **Log in to SignalWire Dashboard:**
   - Go to: https://signalwire.com/signin
   - Space: erik.signalwire.com

2. **Create New SWML Script:**
   - Navigate to **Resources** in the left menu
   - Click **"Create New Resource"**
   - Select **"Script"** → **"SWML Application"**

3. **Configure the Script:**
   - **Name:** `LiveKit Outbound Bridge`
   - **Description:** `Routes outbound calls from LiveKit to phone numbers`
   - Copy the contents of `livekit-swml-script.yaml` into the script editor
   - Click **"Save"**

### Step 2: Get SIP Domain

4. **Add SIP Address:**
   - In the script you just created, go to **"Addresses & Phone Numbers"**
   - Click **"Add"**
   - Select **"SIP Address"**
   - Create a new SIP domain or use existing one
   - Your SIP domain will be: `erik-livekit.dapp.signalwire.com` (or similar)
   - **Copy this exact domain name** - you'll need it for LiveKit

### Step 3: Configure LiveKit Trunk

5. **Update LiveKit Outbound Trunk:**
   - Go to: https://cloud.livekit.io/
   - Select project: `plug-bq7kgzpt`
   - Click **"SIP"** in left menu
   - Find trunk: `ST_3DmaaWbHL9QT`
   - Click **"Edit"**

6. **Update Trunk Settings:**
   ```
   Address: erik-livekit.dapp.signalwire.com
   Transport: TLS
   Auth Username: fb9ea15e-cf87-4de2-8be2-0f619b8e956e
   Auth Password: PTb99247e211706a7195122196aaa1281f97f93bbe64b24f28
   Numbers: +14152518686, +16042566768, +16042101966, +12013040992, +16042431596
   ```
   - **Important:** Use the exact SIP domain from Step 4
   - Click **"Save"**

### Step 4: Test the Connection

7. **Make a Test Call:**
   - Run: `./test-and-monitor.sh`
   - Or make a call from the Pat web interface
   - Check the browser console and Edge Function logs

8. **Verify Call Flow:**
   - ✅ Browser joins LiveKit room
   - ✅ LiveKit creates SIP participant
   - ✅ SignalWire receives call and bridges to phone number
   - ✅ Phone rings!
   - ✅ AI agent joins and audio routes correctly

## What This Setup Does

```
┌─────────────┐         ┌──────────────┐         ┌──────────────┐         ┌───────────┐
│   Browser   │ ◄─────► │   LiveKit    │ ◄─────► │  SignalWire  │ ◄─────► │   Phone   │
│  (WebRTC)   │         │  (SIP/WebRTC)│         │  (PSTN/SIP)  │         │  Number   │
└─────────────┘         └──────────────┘         └──────────────┘         └───────────┘
                               ▲
                               │
                        ┌──────┴──────┐
                        │  AI Agent   │
                        │ (LiveKit)   │
                        └─────────────┘
```

- **Browser** connects to LiveKit room via WebRTC
- **AI Agent** joins the same LiveKit room
- **LiveKit** creates SIP call to SignalWire DAPP
- **SignalWire DAPP** bridges to actual phone number via PSTN
- Everyone can hear each other, full conversation is recorded

## Troubleshooting

### If phone still doesn't ring:
- Check SignalWire logs: Dashboard → Resources → LiveKit Outbound Bridge → Logs
- Verify SIP domain is attached to the SWML script
- Ensure service numbers are assigned to your SignalWire space
- Check LiveKit logs for SIP errors

### If you get authentication errors:
- Verify Auth Username/Password in LiveKit trunk match your SignalWire Project ID/Token
- Make sure you're using the Project ID, not the Space name

### If calls connect but no audio:
- Check codec compatibility (PCMU/PCMA)
- Verify NAT/firewall settings aren't blocking RTP
- Check browser microphone permissions
