#!/bin/bash

# Check SIP trunk configuration and recent SIP call attempts
# This helps debug why calls aren't reaching SignalWire

source .env

echo "📞 LiveKit SIP Status Check"
echo "============================"
echo ""

# Generate JWT token
TOKEN=$(node -e "
const jwt = require('jsonwebtoken');
const token = jwt.sign(
  { video: { roomAdmin: true, room: '*' } },
  '$LIVEKIT_API_SECRET',
  {
    issuer: '$LIVEKIT_API_KEY',
    expiresIn: '1h',
    algorithm: 'HS256'
  }
);
console.log(token);
" 2>/dev/null)

if [ -z "$TOKEN" ]; then
  echo "❌ Failed to generate token"
  exit 1
fi

echo "1️⃣ OUTBOUND SIP TRUNK CONFIGURATION"
echo "-----------------------------------"
curl -s "https://plug-bq7kgzpt.livekit.cloud/twirp/livekit.SIP/ListSIPOutboundTrunk" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}' | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    if 'items' in data:
        for trunk in data['items']:
            print(f\"\\nTrunk ID: {trunk.get('sipTrunkId', 'N/A')}\")
            print(f\"  Name: {trunk.get('name', 'N/A')}\")
            print(f\"  Address: {trunk.get('address', 'N/A')}\")
            print(f\"  Numbers: {trunk.get('numbers', [])}\")
            print(f\"  Metadata: {trunk.get('metadata', {})}\")
    else:
        print('No trunks found or error in response')
        print(json.dumps(data, indent=2))
except Exception as e:
    print(f'Error: {e}')
"

echo ""
echo ""
echo "2️⃣ RECENT OUTBOUND SIP CALLS (Last 10)"
echo "--------------------------------------"
curl -s "https://plug-bq7kgzpt.livekit.cloud/twirp/livekit.SIP/ListSIPOutboundTrunk" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}' | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    if 'items' in data and len(data['items']) > 0:
        trunk_id = data['items'][0].get('sipTrunkId')
        print(f\"Fetching calls for trunk: {trunk_id}\")
except:
    pass
"

# Get recent SIP calls
curl -s "https://plug-bq7kgzpt.livekit.cloud/twirp/livekit.SIP/ListSIPDispatchRule" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}' | python3 -c "
import sys, json
from datetime import datetime
try:
    data = json.load(sys.stdin)
    if 'items' in data:
        print(f\"\\nFound {len(data['items'])} dispatch rules\")
        for rule in data['items']:
            print(f\"  → Rule ID: {rule.get('sipDispatchRuleId', 'N/A')}\")
    else:
        print('No dispatch rules or different API response')
        print(json.dumps(data, indent=2))
except Exception as e:
    print(f'Error: {e}')
"

echo ""
echo ""
echo "3️⃣ SIGNALWIRE SIP ENDPOINT CHECK"
echo "--------------------------------"
echo "Expected endpoint: erik-plug.dapp.signalwire.com"
echo ""
echo "Checking DNS resolution:"
nslookup erik-plug.dapp.signalwire.com 2>/dev/null || echo "⚠️  Could not resolve domain"

echo ""
echo "============================"
echo ""
echo "💡 If trunk shows old address, update it via LiveKit dashboard:"
echo "   https://cloud.livekit.io/projects/plug-bq7kgzpt/sip"
echo ""
