#!/bin/bash

echo "🔍 Checking Active LiveKit SIP Call: SCL_QNLXu7Pm4z2e"
echo "=================================================="
echo ""

echo "1️⃣ Checking SignalWire recent calls..."
curl -s -X GET "https://erik.signalwire.com/api/laml/2010-04-01/Accounts/$SIGNALWIRE_PROJECT_ID/Calls.json?PageSize=5" \
  -u "$SIGNALWIRE_PROJECT_ID:$SIGNALWIRE_API_TOKEN" \
  | jq '.calls[] | {
      sid: .sid,
      from: .from,
      to: .to,
      status: .status,
      direction: .direction,
      start_time: .start_time,
      duration: .duration
    }'

echo ""
echo "=================================================="
echo ""
echo "💡 If no recent calls shown above, the SIP INVITE from LiveKit"
echo "   is not reaching SignalWire or is being rejected."
echo ""
echo "Possible issues:"
echo "  - LiveKit trunk address is still incorrect"
echo "  - SignalWire authentication failing"
echo "  - Service number not configured in SignalWire"
echo ""
echo "Next: Check LiveKit dashboard at https://cloud.livekit.io/"
echo "      Go to SIP → Participants to see call status details"
