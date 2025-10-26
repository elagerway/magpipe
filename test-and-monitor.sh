#!/bin/bash

echo "🧪 Testing Outbound Call with Full Monitoring"
echo "=============================================="
echo ""

# Test call
echo "1️⃣ Initiating test call..."
node test-with-real-user.js &
TEST_PID=$!

echo ""
echo "2️⃣ Waiting 2 seconds for call to initiate..."
sleep 2

echo ""
echo "3️⃣ Checking LiveKit rooms..."
node check-livekit-status.js

echo ""
echo "4️⃣ Recent call records (last 2)..."
node check-recent-calls.js

echo ""
echo "=============================================="
echo "✅ Test complete. Check output above for details."
echo ""
echo "💡 To view live agent logs, run:"
echo "   ./monitor-agent-logs.sh"
