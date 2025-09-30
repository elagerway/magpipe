# STOP Functionality Testing Instructions

## Your Numbers
- **Your Personal US Number:** +16282878440
- **Your Service Number:** +16282851850 (San Francisco)

## Test Sequence

### Test 1: Regular Message (Baseline)
1. Text "Hello, this is a test" from your phone (+16282878440) to your service number (+16282851850)
2. **Expected:** You should receive an AI reply that includes "STOP to opt out" at the end
3. **Verify:** Check Supabase Edge Function logs for `webhook-inbound-sms`

### Test 2: STOP Command
1. Text "STOP" from your phone to your service number
2. **Expected:** You should receive: "You have been unsubscribed from SMS messages. Reply START to opt back in."
3. **Verify:** Check `sms_opt_outs` table - should show `status = 'opted_out'` for +16282878440

### Test 3: Message While Opted Out
1. Text "This should not get a reply" from your phone to your service number
2. **Expected:** NO AI reply (you should not receive any message back)
3. **Verify:** Check Edge Function logs - should show "Sender has opted out from US number"

### Test 4: START Command
1. Text "START" from your phone to your service number
2. **Expected:** You should receive: "You have been subscribed to SMS messages. Reply STOP to unsubscribe."
3. **Verify:** Check `sms_opt_outs` table - should show `status = 'opted_in'` for +16282878440

### Test 5: Message After Opt-In
1. Text "AI should respond now" from your phone to your service number
2. **Expected:** You should receive an AI reply that includes "STOP to opt out" at the end
3. **Verify:** Normal functionality restored

## How to Verify in Supabase Dashboard

### Check Edge Function Logs:
1. Go to https://supabase.com/dashboard/project/mtxbiyilvgwhbdptysex/functions
2. Click on `webhook-inbound-sms`
3. View the logs to see processing

### Check Database Tables:
1. Go to Table Editor
2. Check `sms_opt_outs` table for opt-out status
3. Check `sms_messages` table for logged messages

## Expected Behavior Summary

✅ **US Service Number** (+16282851850):
- STOP messages are processed
- Opt-out blocks AI replies
- "STOP to opt out" text added to all replies
- START messages restore functionality

❌ **Canadian Service Number** (+16043377899):
- STOP messages treated as regular text
- No opt-out processing
- No "STOP to opt out" text
- Full AI functionality regardless of opt-out status

## Test Alternative: Using Inbox

You can also test by texting yourself from the inbox:
1. Go to http://localhost:3000/inbox
2. Send yourself messages
3. Reply from your phone
4. Verify STOP/START behavior
