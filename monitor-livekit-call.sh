#!/bin/bash

echo "🔍 LiveKit Call Monitoring"
echo "=========================="
echo ""
echo "Trunk address: erik-0f619b8e956e.sip.signalwire.com"
echo ""
echo "📞 Make your test call now..."
echo ""
echo "Monitoring Edge Function logs (Ctrl+C to stop)..."
echo ""

# Tail both Edge Functions
echo "=== LiveKit Outbound Call Logs ==="
npx supabase functions logs livekit-outbound-call &
PID1=$!

sleep 2

echo ""
echo "=== SignalWire Status Webhook Logs ==="
npx supabase functions logs signalwire-status-webhook &
PID2=$!

sleep 2

echo ""
echo "=== Dynamic SWML Handler Logs ==="
npx supabase functions logs livekit-swml-handler &
PID3=$!

# Wait for user to stop
wait
