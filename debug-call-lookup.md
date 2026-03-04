# Debug Call Lookup Issue

## Problem
Agent can't find call_record in database after call ends.

## Error Log
```
WARNING: No call_record found with call_sid: SCL_m4wXieiwXFtP
```

## Analysis

### What should happen:
1. **webhook-inbound-call** receives SignalWire `CallSid` (e.g., `CA123...`)
2. Stores `call_sid: CA123...` in database
3. **LiveKit agent** gets SIP `callID` from LiveKit participant attributes
4. Looks up database using this `callID`

### The Mismatch:
- **SignalWire CallSid**: `CA...` format (stored by webhook)
- **LiveKit SIP callID**: `SCL_...` format (used by agent for lookup)
- These are DIFFERENT identifiers!

### Current Fallback Logic:
Agent has fallback to look up by `service_number` + recent timestamp if `call_sid` doesn't match.

## Questions to Answer

1. **What SIP attributes are available?**
   - Added logging: `logger.info(f"🔍 ALL SIP participant attributes: {participant.attributes}")`
   - Need to see if there's a different attribute with SignalWire's CallSid

2. **Did the fallback lookup execute?**
   - Check logs for: "Looking up call by service_number"
   - If yes: why did it fail?
   - If no: why didn't it run?

3. **What values are being used for fallback?**
   - `service_number`: Should be the phone number
   - `user_id`: Should be from database lookup
   - Check if these are populated when fallback runs

## Possible Solutions

### Option 1: Don't use call_sid at all
Remove call_sid matching entirely, always use service_number + timestamp fallback.

**Pros**: Simpler, more reliable
**Cons**: Could match wrong call if multiple calls to same number within time window

### Option 2: Store both identifiers
Have webhook-inbound-call pass SignalWire CallSid to LiveKit via room metadata or SIP headers.

**Pros**: Maintains precise matching
**Cons**: More complex integration

### Option 3: Use service_number as primary key
Make service_number + timestamp the primary lookup method, call_sid as backup.

**Pros**: More reliable since service_number is consistent
**Cons**: Current implementation already has this as fallback

## Next Steps

1. Deploy logging changes to see all SIP attributes
2. Make test call and check logs for:
   - All available SIP attributes
   - Whether fallback lookup executed
   - Values used in fallback (service_number, user_id)
3. Based on findings, implement fix
