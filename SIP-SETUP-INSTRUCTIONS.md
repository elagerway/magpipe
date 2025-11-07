# SIP Setup Instructions

**Date:** 2025-10-31
**Task:** Enable SIP outbound calling via SignalWire

---

## Current Status

✅ **Code Complete** - Commit `694f872`
- inbox.js updated to use SIP instead of LiveKit
- Migration file created: `supabase/migrations/20251031120000_add_sip_credentials.sql`

⏸️ **Blocked** - Need to:
1. Apply database migration (add SIP credential columns)
2. Provision SIP endpoints in SignalWire
3. Update database with SIP credentials

---

## Step 1: Apply Database Migration

### Option A: Via Supabase SQL Editor (Recommended)

1. Open Supabase SQL Editor:
   ```
   https://supabase.com/dashboard/project/mtxbiyilvgwhbdptysex/sql/new
   ```

2. Copy and paste this SQL:
   ```sql
   -- Add SIP credential fields to service_numbers table
   ALTER TABLE service_numbers
   ADD COLUMN IF NOT EXISTS sip_username VARCHAR(255),
   ADD COLUMN IF NOT EXISTS sip_password VARCHAR(255),
   ADD COLUMN IF NOT EXISTS sip_domain VARCHAR(255) DEFAULT 'erik.signalwire.com',
   ADD COLUMN IF NOT EXISTS sip_ws_server VARCHAR(255) DEFAULT 'wss://erik.signalwire.com:7443';

   -- Add comments
   COMMENT ON COLUMN service_numbers.sip_username IS 'SIP username for WebRTC calling';
   COMMENT ON COLUMN service_numbers.sip_password IS 'SIP password (should be encrypted in production)';
   COMMENT ON COLUMN service_numbers.sip_domain IS 'SIP domain (SignalWire space)';
   COMMENT ON COLUMN service_numbers.sip_ws_server IS 'WebSocket server for SIP over WebRTC';
   ```

3. Click "Run" to execute

### Option B: Via Supabase CLI (If connection works)

```bash
export SUPABASE_ACCESS_TOKEN=sbp_17bff30d68c60e941858872853988d63169b2649
npx supabase db push
```

### Verify Migration Applied

Run this command to verify:
```bash
node scripts/check-sip-credentials.js
```

Expected output should show:
```
⚠️  🟢 Active +1XXXXXXXXXX
   ❌ Missing SIP credentials
```

---

## Step 2: Provision SIP Endpoints in SignalWire

### For Each Service Number:

1. **Log in to SignalWire Dashboard**
   ```
   https://erik.signalwire.com
   ```

2. **Navigate to SIP Section**
   - Click "Phone Numbers" in sidebar
   - Click "SIP" tab

3. **Create New SIP Endpoint**
   - Click "+ Add Endpoint" or similar
   - Configure:
     - **Username**: Use phone number without + (e.g., `16042101966`)
     - **Password**: Generate strong password (save it!)
     - **Caller ID**: The phone number (e.g., `+16042101966`)
     - **Domain**: `erik.signalwire.com`
     - **WebSocket**: Enable WebRTC/WebSocket support

4. **Link to Phone Number** (if needed)
   - Some SignalWire interfaces require linking SIP endpoint to phone number
   - Associate the endpoint with the corresponding phone number

### Alternative: SignalWire API

If SignalWire dashboard doesn't have SIP endpoint UI, we may need to:
- Use SignalWire REST API to create SIP credentials
- Check SignalWire documentation for "SIP Endpoints" or "WebRTC Endpoints"
- Or configure via LaML/SWML scripts

---

## Step 3: Update Database with SIP Credentials

Once you have SIP credentials from SignalWire, update the database:

### Method 1: Via Supabase SQL Editor

```sql
-- For each service number, run:
UPDATE service_numbers SET
  sip_username = '16042101966',  -- Phone number without +
  sip_password = 'YOUR_PASSWORD_FROM_SIGNALWIRE',
  sip_domain = 'erik.signalwire.com',
  sip_ws_server = 'wss://erik.signalwire.com:7443'
WHERE phone_number = '+16042101966';

-- Repeat for each number
```

### Method 2: Via Script

Create a script `scripts/update-sip-credentials.js`:

```javascript
#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const credentials = [
  {
    phone_number: '+16042101966',
    sip_username: '16042101966',
    sip_password: 'YOUR_PASSWORD_HERE',
    sip_domain: 'erik.signalwire.com',
    sip_ws_server: 'wss://erik.signalwire.com:7443'
  },
  // Add more numbers here
];

async function updateCredentials() {
  for (const cred of credentials) {
    const { error } = await supabase
      .from('service_numbers')
      .update({
        sip_username: cred.sip_username,
        sip_password: cred.sip_password,
        sip_domain: cred.sip_domain,
        sip_ws_server: cred.sip_ws_server
      })
      .eq('phone_number', cred.phone_number);

    if (error) {
      console.error(`Failed to update ${cred.phone_number}:`, error);
    } else {
      console.log(`✅ Updated ${cred.phone_number}`);
    }
  }
}

updateCredentials();
```

Then run:
```bash
chmod +x scripts/update-sip-credentials.js
node scripts/update-sip-credentials.js
```

---

## Step 4: Test SIP Calling

1. **Verify SIP Credentials**
   ```bash
   node scripts/check-sip-credentials.js
   ```

   Should show:
   ```
   ✅ 🟢 Active +16042101966
      SIP Username: 16042101966
      SIP Domain: erik.signalwire.com
      WS Server: wss://erik.signalwire.com:7443
   ```

2. **Open Inbox in Browser**
   ```
   http://localhost:3000/inbox
   ```

3. **Make Test Call**
   - Click on a contact or enter a phone number
   - Click the Call button
   - Watch browser console for SIP debug logs:
     ```
     🔧 Initializing SIP client...
     🔌 WebSocket connected successfully
     ✅ SIP registered successfully
     📞 Call ringing...
     ✅ Call connected
     ```

4. **Check for Issues**
   - **SIP registration fails**: Check username/password in database
   - **Call doesn't connect**: Check SignalWire trunk configuration
   - **No audio**: Check browser microphone permissions
   - **WebSocket fails**: Verify wss://erik.signalwire.com:7443 is correct endpoint

---

## Troubleshooting

### Error: "SIP registration failed"
- Verify username/password in database match SignalWire endpoint
- Check SignalWire endpoint is enabled
- Verify domain is correct (`erik.signalwire.com`)

### Error: "Call failed: 403 Forbidden"
- SIP endpoint may not have permission to make outbound calls
- Check SignalWire trunk allows outbound calling
- Verify caller ID is authorized

### Error: "WebSocket connection failed"
- Verify WebSocket server URL is correct
- Check firewall/network allows WSS connections on port 7443
- Try alternative WebSocket endpoint if SignalWire provides one

### No Audio
- Check browser microphone permissions
- Verify STUN/TURN servers in sipClient.js (lines 189-193)
- Check browser console for WebRTC errors

---

## Next Steps After SIP Works

Once basic SIP calling is working:

1. **Phase 2: LiveKit Bridging** (specs/Pat-AI/plan.md)
   - Add CXML/SWML to bridge SIP call to LiveKit room
   - Enable recording by recording LiveKit room
   - Add agent to call via LiveKit agent

2. **Phase 3: Speaker Labeling & Tool Tracking**
   - Label speakers: User, Agent, Guest
   - Track tool invocations in call records
   - Store in call_records table

---

## Files Modified

- ✅ `src/pages/inbox.js:1499-1594` - initiateCall() uses SIP
- ✅ `src/pages/inbox.js:1447-1459` - hangup uses sipClient
- ✅ `supabase/migrations/20251031120000_add_sip_credentials.sql` - Migration
- ✅ `scripts/check-sip-credentials.js` - Helper script
- ✅ `scripts/apply-sip-migration.js` - Helper script (deprecated)
- ✅ `SESSION-NOTES.md` - Updated with current progress

---

## Reference Links

- **Supabase Project**: https://supabase.com/dashboard/project/mtxbiyilvgwhbdptysex
- **SignalWire Dashboard**: https://erik.signalwire.com
- **JsSIP Documentation**: https://jssip.net/documentation/
- **Outbound Calling Design**: specs/Pat-AI/plan.md (search for "Outbound Calling Design Specification")

---

## Questions?

If you encounter issues not covered here, check:
1. Browser console logs (F12 → Console)
2. SignalWire call logs in dashboard
3. Supabase Edge Function logs for any backend errors
4. SESSION-NOTES.md for historical context
