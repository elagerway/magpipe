# Migration 060: Multi-Vendor Call ID - Breaking Changes Analysis

## Changes Made

### Database Schema (060_add_vendor_call_ids.sql)
- ✅ Added `vendor_call_id` column (telephony provider's call ID)
- ✅ Added `voice_platform_call_id` column (AI platform's call ID)
- ✅ Added `telephony_vendor` enum column
- ✅ Added `voice_platform` enum column
- ✅ Migrated existing `call_sid` → `vendor_call_id`
- ✅ Created indexes on new columns
- ⚠️ Kept `call_sid` for backward compatibility (marked as DEPRECATED)

## Potentially Affected Code

### ✅ FIXED: webhook-call-status/index.ts
**Issue**: Updated `call_sid` directly
**Fix**: Changed to use `.or()` to match both `vendor_call_id` OR `call_sid`
```typescript
// BEFORE:
.eq('call_sid', callSid)

// AFTER:
.or(`vendor_call_id.eq.${callSid},call_sid.eq.${callSid}`)
```

### ✅ FIXED: CallRecord.js (Frontend Model)
**Issue**: Had two methods using non-existent `signalwire_call_sid` column
**Fix**: Updated to use `vendor_call_id` with fallback to `call_sid`

**Methods Fixed:**
1. `getByCallSid()` - Now tries `vendor_call_id` first, falls back to `call_sid`
2. `updateByCallSid()` - Now updates by either `vendor_call_id` OR `call_sid`

### ✅ UPDATED: webhook-inbound-call/index.ts
**Change**: Now populates new columns when creating call_records
```typescript
vendor_call_id: callSid,              // SignalWire's CallSid
telephony_vendor: 'signalwire',       // Track vendor
voice_platform: 'livekit',            // Track AI platform
voice_platform_call_id: null,         // Set by agent later
call_sid: callSid,                    // DEPRECATED: backward compat
```

### ✅ UPDATED: agent.py (LiveKit Voice Agent)
**Changes:**
1. Updates `voice_platform_call_id` when call starts
2. Looks up by `voice_platform_call_id` when saving transcript
3. Falls back to `service_number` + timestamp if not found

## Backward Compatibility

### What Still Works
✅ **Old code using `call_sid`** - Column still exists and is populated
✅ **Existing call records** - Migrated to `vendor_call_id` automatically
✅ **Frontend CallRecord model** - Updated to support both old and new columns
✅ **Webhooks** - Support lookups by either ID type

### What Breaks
❌ **None** - All breaking changes have been fixed with backward-compatible fallbacks

## Testing Checklist

- [ ] **New call creation** - Verify vendor_call_id is populated
- [ ] **Call status updates** - Verify webhook-call-status finds and updates records
- [ ] **Transcript saving** - Verify agent finds call_record by voice_platform_call_id
- [ ] **Frontend call display** - Verify dashboard/calls pages still work
- [ ] **Call lookups** - Test CallRecord.getByCallSid() with both old and new records

## Rollback Plan

If issues occur:

1. **Revert code changes** (but keep database migration)
2. **Old code will still work** because `call_sid` column exists
3. **New columns** will be ignored but won't break anything

## Future Cleanup

Once confirmed stable (after ~2 weeks):

1. Remove `call_sid` column entirely
2. Remove fallback logic in CallRecord.js
3. Remove fallback logic in webhook-call-status
4. Update all code to use only vendor_call_id/voice_platform_call_id

## Files Changed

**Database:**
- `supabase/migrations/060_add_vendor_call_ids.sql` ✅ Deployed

**Backend:**
- `supabase/functions/webhook-inbound-call/index.ts` ✅ Updated
- `supabase/functions/webhook-call-status/index.ts` ✅ Fixed
- `agents/livekit-voice-agent/agent.py` ✅ Updated

**Frontend:**
- `src/models/CallRecord.js` ✅ Fixed

**Documentation:**
- `MULTI_VENDOR_CALL_TRACKING.md` ✅ Created
- `MIGRATION_060_BREAKING_CHANGES.md` ✅ This file
