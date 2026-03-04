#!/bin/bash

SERVICE_ID="srv-d3g2gvmr433s738si3j0"
RENDER_API_KEY="${RENDER_API_KEY:?Set RENDER_API_KEY in .env}"

echo "Monitoring Render deployment status..."
echo "Service: https://dashboard.render.com/web/$SERVICE_ID"
echo ""

while true; do
  # Get latest deploy
  response=$(curl -s "https://api.render.com/v1/services/$SERVICE_ID/deploys?limit=1" \
    -H "Authorization: Bearer $RENDER_API_KEY")

  # Extract status and commit
  status=$(echo "$response" | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4)
  commit=$(echo "$response" | grep -o '"commit":{"id":"[^"]*"' | head -1 | cut -d'"' -f6 | cut -c1-7)
  created=$(echo "$response" | grep -o '"createdAt":"[^"]*"' | head -1 | cut -d'"' -f4)

  timestamp=$(date '+%H:%M:%S')

  case "$status" in
    "live")
      echo "[$timestamp] ✅ Deploy $commit is LIVE"
      exit 0
      ;;
    "build_failed"|"deploy_failed"|"canceled")
      echo "[$timestamp] ❌ Deploy $commit FAILED (status: $status)"
      echo ""
      echo "Check logs: https://dashboard.render.com/web/$SERVICE_ID/logs"
      exit 1
      ;;
    "building"|"deploying")
      echo "[$timestamp] 🔄 Deploy $commit is $status..."
      ;;
    *)
      echo "[$timestamp] ⏳ Status: $status (commit: $commit)"
      ;;
  esac

  sleep 5
done
