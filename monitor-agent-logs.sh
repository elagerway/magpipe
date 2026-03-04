#!/bin/bash

SERVICE_ID="srv-d3g2gvmr433s738si3j0"
RENDER_API_KEY="${RENDER_API_KEY:?Set RENDER_API_KEY in .env}"

echo "🔍 Monitoring LiveKit Agent Logs (Render)"
echo "Service: https://dashboard.render.com/web/$SERVICE_ID/logs"
echo "---"
echo ""

# Fetch recent logs
curl -s "https://api.render.com/v1/services/$SERVICE_ID/logs?limit=100" \
  -H "Authorization: Bearer $RENDER_API_KEY" | \
  jq -r '.[] | "\(.timestamp) | \(.message)"' | tail -50

echo ""
echo "---"
echo "💡 Watching for new logs (refresh every 3 seconds)..."
echo "   Press Ctrl+C to stop"
echo ""

while true; do
  sleep 3
  curl -s "https://api.render.com/v1/services/$SERVICE_ID/logs?limit=10" \
    -H "Authorization: Bearer $RENDER_API_KEY" | \
    jq -r '.[] | "\(.timestamp) | \(.message)"'
done
