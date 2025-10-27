#!/bin/bash

source .env

echo "📞 Creating SignalWire SWML DAPP for LiveKit Outbound Calls"
echo "============================================================"
echo ""

# SWML script for bridging LiveKit SIP calls to PSTN
SWML_SCRIPT='version: 1.0.0
sections:
  main:
    - connect:
        answer_on_bridge: true
        from: "%{call.from.replace(/^sip:\\+?/i, '\''+\''). replace(/@.*/, '\'''\'')}"
        to: "%{call.to.replace(/^sip:/i, '\'''\'').replace(/@.*/, '\'''\'')}"'

# Create JSON payload
PAYLOAD=$(cat <<EOF
{
  "name": "livekit-outbound",
  "swml_script": $(echo "$SWML_SCRIPT" | python3 -c 'import sys, json; print(json.dumps(sys.stdin.read()))')
}
EOF
)

echo "Creating SWML webhook..."
echo ""

RESPONSE=$(curl -s -X POST "https://$SIGNALWIRE_SPACE.signalwire.com/resources/swml_webhooks" \
  -u "$SIGNALWIRE_PROJECT_ID:$SIGNALWIRE_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD")

echo "$RESPONSE" | python3 -m json.tool

echo ""
echo "============================================================"
