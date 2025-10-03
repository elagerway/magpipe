#!/bin/bash

# Render API setup script
SERVICE_ID="srv-d3g2gvmr433s738si3j0"
RENDER_API_KEY="rnd_HxZhDCm9rC3ewtydyCmPZqSBZngT"

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
add_env_var "LIVEKIT_URL" "wss://plug-bq7kgzpt.livekit.cloud"
add_env_var "LIVEKIT_API_KEY" "APIJrWftyj6qS8w"
add_env_var "LIVEKIT_API_SECRET" "9oafeK3kiHb8vAN0rlJrnmsCPpgQqLFhfekBAmfr6pzH"
add_env_var "SUPABASE_URL" "https://mtxbiyilvgwhbdptysex.supabase.co"
add_env_var "SUPABASE_SERVICE_ROLE_KEY" "YOUR_SUPABASE_KEY"
add_env_var "SIGNALWIRE_SPACE" "erik.signalwire.com"
add_env_var "SIGNALWIRE_PROJECT_ID" "fb9ea15e-cf87-4de2-8be2-0f619b8e956e"
add_env_var "SIGNALWIRE_API_TOKEN" "YOUR_SIGNALWIRE_API_TOKEN"
add_env_var "OPENAI_API_KEY" "YOUR_OPENAI_API_KEY"
add_env_var "DEEPGRAM_API_KEY" "479a76e06d455eef2dbf02ff6c2b68173215ee17"
add_env_var "ELEVENLABS_API_KEY" "sk_70a03ee8e93539f64ce7bfbb02ca1e0603aff875baf86f9d"

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
