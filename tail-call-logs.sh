#!/bin/bash

# Comprehensive call logging script to track all components of outbound calls
# This script helps debug the call flow from Edge Function → LiveKit → Agent → SignalWire

echo "🔍 Pat Outbound Call Log Tailer"
echo "================================"
echo ""
echo "This script will show you:"
echo "  1. Supabase Edge Function logs (livekit-outbound-call)"
echo "  2. Render agent logs (LiveKit voice agent)"
echo "  3. LiveKit room/SIP status (on demand)"
echo ""
echo "Press Ctrl+C to stop"
echo ""
echo "================================"
echo ""

# Source environment variables
source .env

# Function to tail Render logs
tail_render_logs() {
    echo "📊 RENDER AGENT LOGS"
    echo "--------------------"

    if [ -z "$RENDER_SERVICE_ID" ] || [ -z "$RENDER_API_KEY" ]; then
        echo "⚠️  RENDER_SERVICE_ID or RENDER_API_KEY not set - skipping Render logs"
        echo ""
        return
    fi

    # Get last 20 lines of logs
    curl -s "https://api.render.com/v1/services/$RENDER_SERVICE_ID/logs?limit=20" \
      -H "Authorization: Bearer $RENDER_API_KEY" \
      | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    for log in data:
        if 'message' in log:
            print(log['message'])
except:
    pass
"
    echo ""
}

# Function to tail Supabase Edge Function logs
tail_supabase_logs() {
    echo "📊 SUPABASE EDGE FUNCTION LOGS (livekit-outbound-call)"
    echo "------------------------------------------------------"

    if [ -z "$SUPABASE_ACCESS_TOKEN" ]; then
        echo "⚠️  SUPABASE_ACCESS_TOKEN not set - skipping Supabase logs"
        echo ""
        return
    fi

    # Using the Supabase CLI logs command (requires linked project)
    # Note: This might show help if project not linked, but we'll try anyway
    export SUPABASE_ACCESS_TOKEN="$SUPABASE_ACCESS_TOKEN"
    timeout 5 npx supabase functions logs livekit-outbound-call 2>&1 | head -30 || echo "Note: Supabase CLI logs may require project linking"
    echo ""
}

# Function to check LiveKit room status
check_livekit_rooms() {
    echo "📊 LIVEKIT ACTIVE ROOMS"
    echo "----------------------"

    if [ -z "$LIVEKIT_API_KEY" ] || [ -z "$LIVEKIT_API_SECRET" ]; then
        echo "⚠️  LiveKit credentials not set - skipping room check"
        echo ""
        return
    fi

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
        echo "❌ Failed to generate LiveKit token"
        echo ""
        return
    fi

    # List active rooms
    curl -s "https://plug-bq7kgzpt.livekit.cloud/twirp/livekit.RoomService/ListRooms" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      -d '{}' \
      | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    if 'rooms' in data and len(data['rooms']) > 0:
        print(f\"Found {len(data['rooms'])} active room(s):\")
        for room in data['rooms']:
            print(f\"  → {room['name']} ({room.get('numParticipants', 0)} participants)\")
    else:
        print('No active rooms')
except Exception as e:
    print(f'Error: {e}')
    print(sys.stdin.read())
"
    echo ""
}

# Main loop - show all logs
echo "🔄 Fetching logs..."
echo ""

# Show Render logs
tail_render_logs

# Show Supabase logs
tail_supabase_logs

# Show LiveKit rooms
check_livekit_rooms

echo "================================"
echo ""
echo "💡 TIP: Run this script in a separate terminal while testing calls"
echo "💡 For continuous monitoring, run: watch -n 2 ./tail-call-logs.sh"
echo ""
