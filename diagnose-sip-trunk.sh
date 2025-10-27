#!/bin/bash

echo "🔍 Diagnosing LiveKit SIP Trunk Configuration"
echo "=============================================="
echo ""

echo "📋 Current Configuration:"
echo "  LiveKit URL: wss://plug-bq7kgzpt.livekit.cloud"
echo "  Trunk ID: ST_3DmaaWbHL9QT"
echo "  SignalWire: erik.signalwire.com:5061"
echo ""

echo "1️⃣ Checking LiveKit API credentials..."
if [ -z "$LIVEKIT_API_KEY" ] || [ -z "$LIVEKIT_API_SECRET" ]; then
  echo "❌ Missing LiveKit credentials in environment"
  echo "  Loading from .env..."
  source .env
  export LIVEKIT_API_KEY
  export LIVEKIT_API_SECRET
fi

echo "  API Key: ${LIVEKIT_API_KEY:0:20}..."
echo "  API Secret: ${LIVEKIT_API_SECRET:0:20}..."
echo ""

echo "2️⃣ Listing all SIP trunks..."
curl -s -X GET "https://plug-bq7kgzpt.livekit.cloud/twirp/livekit.SIP/ListSIPTrunk" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $(node -e "
    const jwt = require('jsonwebtoken');
    const token = jwt.sign(
      { video: { roomAdmin: true, room: '*' } },
      process.env.LIVEKIT_API_SECRET,
      {
        issuer: process.env.LIVEKIT_API_KEY,
        expiresIn: '1h',
        algorithm: 'HS256'
      }
    );
    console.log(token);
  ")" | jq '.'

echo ""
echo "3️⃣ Getting specific trunk ST_3DmaaWbHL9QT..."
curl -s -X POST "https://plug-bq7kgzpt.livekit.cloud/twirp/livekit.SIP/ListSIPTrunk" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $(node -e "
    const jwt = require('jsonwebtoken');
    const token = jwt.sign(
      { video: { roomAdmin: true, room: '*' } },
      process.env.LIVEKIT_API_SECRET,
      {
        issuer: process.env.LIVEKIT_API_KEY,
        expiresIn: '1h',
        algorithm: 'HS256'
      }
    );
    console.log(token);
  ")" | jq '.'

echo ""
echo "4️⃣ Testing SignalWire connectivity..."
echo "  Attempting to connect to erik.signalwire.com:5061..."
timeout 3 bash -c "echo > /dev/tcp/erik.signalwire.com/5061" 2>/dev/null
if [ $? -eq 0 ]; then
  echo "  ✅ SignalWire host is reachable"
else
  echo "  ❌ Cannot reach SignalWire host (expected - TLS port)"
fi

echo ""
echo "5️⃣ Checking recent SIP participant creation logs..."
echo "  Run this command to check Supabase Edge Function logs:"
echo "  npx supabase functions logs livekit-outbound-call --tail"

echo ""
echo "=============================================="
echo "💡 Next Steps:"
echo ""
echo "To verify trunk configuration in LiveKit dashboard:"
echo "  1. Go to https://cloud.livekit.io/"
echo "  2. Select your project (plug-bq7kgzpt)"
echo "  3. Click 'SIP' in left menu"
echo "  4. Find trunk ST_3DmaaWbHL9QT"
echo "  5. Verify it has:"
echo "     - Address: erik.signalwire.com:5061"
echo "     - Transport: TLS"
echo "     - Username: $SIGNALWIRE_PROJECT_ID"
echo "     - Password: $SIGNALWIRE_API_TOKEN"
echo "     - Numbers: +14152518686, +16042566768, etc."
echo ""
echo "If trunk is missing these details, the SIP calls will fail silently!"
