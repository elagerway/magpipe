#!/bin/bash

source .env

echo "📞 Checking Recent SignalWire Calls"
echo "===================================="
echo ""

curl -s -X GET \
  "https://erik.signalwire.com/api/laml/2010-04-01/Accounts/$SIGNALWIRE_PROJECT_ID/Calls.json?PageSize=10" \
  -u "$SIGNALWIRE_PROJECT_ID:$SIGNALWIRE_API_TOKEN" \
  | python3 -c "
import sys, json
data = json.load(sys.stdin)
if 'calls' in data and len(data['calls']) > 0:
    print('Recent calls:')
    for call in data['calls'][:5]:
        print(f\"  {call.get('sid', 'N/A')[:15]}... | {call.get('from', 'N/A')} -> {call.get('to', 'N/A')} | {call.get('status', 'N/A')} | {call.get('start_time', 'N/A')}\")
else:
    print('❌ No recent calls found in SignalWire')
    print('   This means the SIP INVITE from LiveKit is not reaching SignalWire')
"

echo ""
echo "===================================="
