#!/bin/bash

source .env

echo "🚀 Creating SWML Application on SignalWire..."

curl -X POST "https://$SIGNALWIRE_SPACE_URL/api/fabric/resources" \
  -u "$SIGNALWIRE_PROJECT_ID:$SIGNALWIRE_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d @livekit-swml-script-with-webhook.json \
  | jq '.'

echo ""
echo "✅ SWML Application created!"
echo ""
echo "📋 Next: Get the SIP domain address"
