#!/bin/bash

SERVICE_ID="your-render-service-id"
RENDER_API_KEY="your-render-api-key"

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
