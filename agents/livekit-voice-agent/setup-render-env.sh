#!/bin/bash

# Render API setup script
# Replace these with your actual values
SERVICE_ID="your-render-service-id"
RENDER_API_KEY="your-render-api-key"

echo "Adding environment variables to Render service..."

# Function to add environment variable
add_env_var() {
  local key=$1
  local value=$2

  echo "Adding $key..."

  curl -X PUT "https://api.render.com/v1/services/$SERVICE_ID/env-vars/$key" \
    -H "Authorization: Bearer $RENDER_API_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"value\": \"$value\"}" \
    -s -o /dev/null -w "%{http_code}\n"
}

# Add all environment variables
add_env_var "LIVEKIT_URL" "wss://your-project.livekit.cloud"
add_env_var "LIVEKIT_API_KEY" "your-livekit-api-key"
add_env_var "LIVEKIT_API_SECRET" "your-livekit-api-secret"
add_env_var "SUPABASE_URL" "https://your-project.supabase.co"
add_env_var "SUPABASE_SERVICE_ROLE_KEY" "your-supabase-service-role-key"
add_env_var "SIGNALWIRE_SPACE" "your-space.signalwire.com"
add_env_var "SIGNALWIRE_PROJECT_ID" "your-signalwire-project-id"
add_env_var "SIGNALWIRE_API_TOKEN" "your-signalwire-api-token"
add_env_var "OPENAI_API_KEY" "your-openai-api-key"
add_env_var "DEEPGRAM_API_KEY" "your-deepgram-api-key"
add_env_var "ELEVENLABS_API_KEY" "your-elevenlabs-api-key"

echo ""
echo "Environment variables added! Triggering redeploy..."

# Trigger a manual deploy
curl -X POST "https://api.render.com/v1/services/$SERVICE_ID/deploys" \
  -H "Authorization: Bearer $RENDER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{}' \
  -s | jq -r '.id // "Deploy triggered"'

echo ""
echo "Done! Check https://dashboard.render.com/web/$SERVICE_ID for deployment status"
