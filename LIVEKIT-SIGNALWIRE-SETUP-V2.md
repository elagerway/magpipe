# LiveKit ↔ SignalWire Integration Setup

## Understanding the Architecture

There are TWO different call flows we need to support:

### 1. Outbound Calls (LiveKit → SignalWire → PSTN)
```
Browser → LiveKit Room → [LiveKit SIP Client] → SignalWire → Phone Number
```
- **Purpose:** Pat makes calls OUT to phone numbers
- **Configuration:** LiveKit outbound trunk points to SignalWire's regular SIP endpoint

### 2. Inbound Calls (PSTN → SignalWire → LiveKit)
```
Phone Number → SignalWire → [SIP Gateway] → LiveKit Room → Browser
```
- **Purpose:** Phone numbers receive calls that route to Pat
- **Configuration:** SignalWire SIP Gateway points to LiveKit's SIP endpoint

---

## Part 1: Outbound Calls Setup (CURRENT ISSUE)

### Problem
The error `transport<TLS> dial err=dial tcp <nil>->34.102.146.73:5061: connect: connection timed out` means LiveKit can't connect to SignalWire because we're using the wrong endpoint.

### Solution: Use SignalWire's Standard SIP Endpoint

SignalWire provides a regional SIP endpoint for standard SIP trunk connections:

**Correct endpoint for LiveKit outbound trunk:**
- **Address:** `erik.signalwire.com` (NO PORT - LiveKit will use default 5060 or 5061 based on transport)
- **Transport:** TLS
- **Port:** 5061 (automatically used with TLS)
- **Auth Username:** `your-signalwire-project-id` (SignalWire Project ID)
- **Auth Password:** `your-signalwire-api-token` (SignalWire API Token)

### Steps to Fix LiveKit Trunk

1. **Go to LiveKit Dashboard:**
   - https://cloud.livekit.io/
   - Project: `plug-bq7kgzpt`
   - Click "SIP" → Find trunk `ST_3DmaaWbHL9QT`

2. **Update Trunk Configuration:**
   ```
   Name: SignalWire Outbound Trunk
   Address: erik.signalwire.com
   Transport: TLS
   Auth Username: your-signalwire-project-id
   Auth Password: your-signalwire-api-token
   Numbers: +14152518686, +16042566768, +16042101966, +12013040992, +16042431596
   ```

3. **Save and Test:**
   - Run: `./test-and-monitor.sh`
   - LiveKit should now successfully connect to SignalWire
   - Phone should ring!

### Alternative: UDP Transport (if TLS fails)

If TLS continues to fail, try UDP:
```
Address: erik.signalwire.com
Transport: UDP
Auth Username: your-signalwire-project-id
Auth Password: your-signalwire-api-token
```

---

## Part 2: Inbound Calls Setup (FUTURE)

### When You Need This
- When external phone numbers need to receive calls through Pat
- When SignalWire phone numbers should route to LiveKit rooms

### Steps to Configure SIP Gateway (SignalWire → LiveKit)

1. **Get LiveKit SIP Endpoint:**
   - Go to LiveKit Dashboard → Settings
   - Find "SIP URI" (looks like: `xxxxxx.sip.livekit.cloud`)
   - Copy this address

2. **Create SIP Gateway in SignalWire:**
   - Dashboard → Resources → Add New → SIP Gateway
   - **Name:** `LiveKit Inbound`
   - **External URI:** `sip:xxxxxx@xxxxxx.sip.livekit.cloud` (your LiveKit SIP URI)
   - **Encryption:** Required
   - **Codecs:** Check PCMU and PCMA
   - **Ciphers:** Check AES_256_CM_HMAC_SHA1_80
   - Click "Create"

3. **Configure Phone Number Routing:**
   - Go to Phone Numbers in SignalWire
   - Select a phone number (e.g., +16042566768)
   - Set "Accept Incoming Calls As:" to "Voice Calls"
   - Set "Handle Calls Using:" to the SIP Gateway you just created
   - Save

4. **Create Inbound Trunk in LiveKit:**
   - LiveKit Dashboard → SIP → Create Inbound Trunk
   - Configure to accept calls from SignalWire's IP ranges
   - Set routing rules to direct calls to appropriate rooms

---

## Testing

### Test Outbound Call (Part 1)
```bash
./test-and-monitor.sh
```

Expected flow:
1. ✅ Browser joins LiveKit room
2. ✅ Edge Function creates SIP participant
3. ✅ LiveKit connects to erik.signalwire.com via TLS
4. ✅ SignalWire places PSTN call to phone number
5. ✅ Phone rings!
6. ✅ Answer phone and hear AI agent
7. ✅ Speak and verify two-way audio

### Test Inbound Call (Part 2 - Future)
```bash
# Call one of your SignalWire numbers from any phone
# Should route through SIP Gateway to LiveKit room
```

---

## Troubleshooting

### Outbound calls still timing out:
- Check SignalWire dashboard → Call Logs for rejection reasons
- Verify Project ID and API Token are correct
- Try UDP transport instead of TLS
- Check if service numbers are verified/active in SignalWire

### Outbound calls connect but no audio:
- Verify codec settings (PCMU/PCMA)
- Check NAT/firewall isn't blocking RTP
- Ensure browser has microphone permissions
- Check LiveKit agent logs for audio track errors

### Inbound calls not routing:
- Verify SIP Gateway external URI is correct LiveKit endpoint
- Check phone number is assigned to SIP Gateway
- Check LiveKit inbound trunk allows SignalWire IPs
- Check Call Fabric logs in SignalWire dashboard

---

## Current Status

✅ **Completed:**
- LiveKit outbound trunk created
- Edge Function for outbound calls
- Browser WebRTC integration
- Database schema for call records

⏳ **In Progress:**
- Fixing LiveKit trunk address to use `erik.signalwire.com`

❌ **Not Started:**
- Inbound call routing (Part 2)
- SIP Gateway for inbound calls
