#!/bin/bash

# Helper script to display environment variables for Render deployment
# Run this from the pat root directory

echo "=========================================="
echo "Environment Variables for Render"
echo "=========================================="
echo ""

# Source the root .env file
if [ -f "../../.env" ]; then
  source ../../.env
elif [ -f ".env" ]; then
  source .env
else
  echo "Error: .env file not found"
  exit 1
fi

echo "Copy these into Render's Environment Variables:"
echo ""
echo "LIVEKIT_URL=wss://plug-bq7kgzpt.livekit.cloud"
echo "LIVEKIT_API_KEY=APIJrWftyj6qS8w"
echo "LIVEKIT_API_SECRET=9oafeK3kiHb8vAN0rlJrnmsCPpgQqLFhfekBAmfr6pzH"
echo "SUPABASE_URL=$SUPABASE_URL"
echo "SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_ROLE_KEY"
echo "SIGNALWIRE_SPACE=erik.signalwire.com"
echo "SIGNALWIRE_PROJECT_ID=fb9ea15e-cf87-4de2-8be2-0f619b8e956e"
echo "SIGNALWIRE_API_TOKEN=PTb99247e211706a7195122196aaa1281f97f93bbe64b24f28"
echo "OPENAI_API_KEY=$OPENAI_API_KEY"
echo "DEEPGRAM_API_KEY=479a76e06d455eef2dbf02ff6c2b68173215ee17"
echo "ELEVENLABS_API_KEY=$ELEVENLABS_API_KEY"
echo ""
echo "=========================================="
