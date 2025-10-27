#!/bin/bash

source .env

echo "📞 Checking LiveKit SIP Calls"
echo "=============================="
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

# List recent SIP calls (there's no direct API, but we can check dispatch logs)
curl -s "https://plug-bq7kgzpt.livekit.cloud/twirp/livekit.SIP/ListSIPInboundTrunk" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}' | python3 -m json.tool

echo ""
echo "=============================="
