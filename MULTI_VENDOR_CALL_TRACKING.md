# Multi-Vendor Call ID Tracking Architecture

## Problem Statement

Different telephony and voice AI vendors use different call identifiers:

**Telephony Providers (inbound call handling):**
- **SignalWire**: `CallSid` (e.g., `CA1234567890abcdef`)
- **Twilio**: `CallSid` (e.g., `CA1234567890abcdef`)
- **Vonage**: `uuid` (e.g., `63f61863-4a51-4f6b-86e1-46edebio0391`)
- **Bandwidth**: `callId` (e.g., `c-95ac8d6e-1a31c52e-...`)

**Voice AI Platforms (call handling/routing):**
- **LiveKit SIP**: `sip.callID` (e.g., `SCL_m4wXieiwXFtP`)
- **Retell**: `call_id` (e.g., `123e4567-e89b-12d3-a456-426614174000`)
- **Bland.ai**: `call_id` (e.g., `abc123-def456`)

**The Challenge**: A single call has **TWO identifiers**:
1. One from the telephony vendor (who receives the inbound call)
2. One from the voice platform (who handles the AI conversation)

We need to track BOTH to properly match calls in the database.

## Solution: Dual Call ID Architecture

### Database Schema

```sql
call_records:
  - vendor_call_id: TEXT              -- ID from telephony provider
  - voice_platform_call_id: TEXT      -- ID from voice AI platform
  - telephony_vendor: TEXT            -- 'signalwire', 'twilio', 'vonage', etc.
  - voice_platform: TEXT              -- 'livekit', 'retell', etc.
  - call_sid: TEXT (deprecated)       -- Kept for backward compatibility
```

### Call Flow Example

**Inbound Call via SignalWire → LiveKit:**

1. **Customer calls** → SignalWire receives call
2. **SignalWire** generates `CallSid: CA123...`
3. **webhook-inbound-call** receives SignalWire webhook with `CA123...`
4. **Stores in database**:
   ```
   vendor_call_id: CA123...
   telephony_vendor: signalwire
   voice_platform: livekit
   voice_platform_call_id: NULL (not yet known)
   ```
5. **SignalWire dials** LiveKit SIP trunk
6. **LiveKit** generates SIP `callID: SCL_abc...`
7. **LiveKit agent starts**, receives `SCL_abc...` from participant attributes
8. **Agent updates database**:
   ```
   voice_platform_call_id: SCL_abc...
   ```
9. **When call ends**, agent can look up by either ID:
   - Primary: `voice_platform_call_id = 'SCL_abc...'`
   - Fallback: `service_number + timestamp`

## Implementation Plan

### Phase 1: Database Migration ✅

**File**: `supabase/migrations/055_add_vendor_call_ids.sql`

- Add `vendor_call_id`, `voice_platform_call_id` columns
- Add `telephony_vendor`, `voice_platform` columns
- Create indexes for fast lookups
- Migrate existing `call_sid` values to `vendor_call_id`
- Mark `call_sid` as deprecated

### Phase 2: Update webhook-inbound-call

**File**: `supabase/functions/webhook-inbound-call/index.ts`

```typescript
// Store vendor call ID when call is created
const { error: insertError } = await supabase
  .from('call_records')
  .insert({
    user_id: serviceNumber.user_id,
    caller_number: from,
    contact_phone: from,
    service_number: to,
    vendor_call_id: callSid,              // NEW: SignalWire's CallSid
    telephony_vendor: 'signalwire',       // NEW: Track vendor
    voice_platform: 'livekit',            // NEW: Track platform
    voice_platform_call_id: null,         // NEW: Will be set by agent
    call_sid: callSid,                    // DEPRECATED: Keep for compatibility
    direction: 'inbound',
    status: 'in-progress',
    disposition: 'answered_by_pat',
    started_at: new Date().toISOString(),
  })
```

### Phase 3: Update LiveKit Agent

**File**: `agents/livekit-voice-agent/agent.py`

```python
# When agent starts, get LiveKit's SIP callID
call_sid = participant.attributes.get("sip.callID") or ctx.room.name
logger.info(f"LiveKit SIP callID: {call_sid}")

# Update the call record with voice platform call ID
supabase.table("call_records") \
    .update({"voice_platform_call_id": call_sid}) \
    .eq("service_number", service_number) \
    .eq("status", "in-progress") \
    .gte("started_at", five_minutes_ago) \
    .execute()

# When call ends, look up by voice_platform_call_id
response = supabase.table("call_records") \
    .select("id") \
    .eq("voice_platform_call_id", call_sid) \
    .limit(1) \
    .execute()

if not response.data:
    # Fallback: look up by service_number + timestamp
    response = supabase.table("call_records") \
        .select("id") \
        .eq("service_number", service_number) \
        .eq("user_id", user_id) \
        .eq("status", "in-progress") \
        .gte("started_at", time_window) \
        .order("started_at", desc=True) \
        .limit(1) \
        .execute()
```

### Phase 4: Future Vendor Support

When adding new vendors, only need to update enum constraints:

**Telephony Vendors:**
```sql
ALTER TABLE call_records DROP CONSTRAINT call_records_telephony_vendor_check;
ALTER TABLE call_records ADD CONSTRAINT call_records_telephony_vendor_check
  CHECK (telephony_vendor IN ('signalwire', 'twilio', 'vonage', 'bandwidth', 'NEW_VENDOR'));
```

**Voice Platforms:**
```sql
ALTER TABLE call_records DROP CONSTRAINT call_records_voice_platform_check;
ALTER TABLE call_records ADD CONSTRAINT call_records_voice_platform_check
  CHECK (voice_platform IN ('livekit', 'retell', 'bland', 'NEW_PLATFORM'));
```

## Benefits

✅ **Vendor Agnostic**: Easy to add Twilio, Vonage, Bandwidth, etc.
✅ **Platform Agnostic**: Easy to switch between LiveKit, Retell, Bland.ai
✅ **Reliable Matching**: Two ways to find the same call record
✅ **Backward Compatible**: Keeps existing `call_sid` column
✅ **Auditable**: Can see exactly which vendor/platform handled each call

## Migration Strategy

1. **Deploy database migration** - Adds new columns, migrates existing data
2. **Update webhook-inbound-call** - Start populating vendor_call_id
3. **Update LiveKit agent** - Set voice_platform_call_id, use for lookup
4. **Test thoroughly** - Verify calls match correctly
5. **Eventually deprecate call_sid** - Remove in future version once all code updated

## Testing

**Test Case 1: New Call**
1. Make call → SignalWire CallSid `CA123`
2. Webhook stores: `vendor_call_id=CA123, telephony_vendor=signalwire`
3. LiveKit generates: `SCL_abc`
4. Agent updates: `voice_platform_call_id=SCL_abc`
5. Call ends, agent finds by: `voice_platform_call_id=SCL_abc` ✅

**Test Case 2: Fallback Lookup**
1. Agent's `voice_platform_call_id` lookup returns 0 rows
2. Fallback uses: `service_number + user_id + recent timestamp`
3. Finds correct call_record ✅

**Test Case 3: Future Vendor (Twilio)**
1. Switch to Twilio as telephony provider
2. Update webhook to set: `telephony_vendor=twilio`
3. Rest of code works identically ✅
