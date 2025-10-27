#!/bin/bash

ROOM_NAME="outbound-77873635-9f5a-4eee-90f3-d145aed0c2c4-1761596026462"

source .env

echo "🔍 Checking LiveKit Room: $ROOM_NAME"
echo "========================================"
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

# List participants in room
curl -s -X POST "https://plug-bq7kgzpt.livekit.cloud/twirp/livekit.RoomService/ListParticipants" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{\"room\": \"$ROOM_NAME\"}" \
  | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    if 'participants' in data and len(data['participants']) > 0:
        print('Participants in room:')
        for p in data['participants']:
            print(f\"  {p.get('identity', 'N/A')} (SID: {p.get('sid', 'N/A')[:15]}...)\")
            print(f\"    State: {p.get('state', 'N/A')}\")
            print(f\"    Tracks: {len(p.get('tracks', []))}\")
            for track in p.get('tracks', []):
                print(f\"      - {track.get('type', 'N/A')} ({track.get('sid', 'N/A')[:15]}...)\")
    else:
        print('❌ No participants found in room')
        print('   Room may have ended or name is incorrect')
except Exception as e:
    print(f'Error parsing response: {e}')
    print(sys.stdin.read())
"

echo ""
echo "========================================"
