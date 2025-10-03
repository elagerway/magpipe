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
echo "LIVEKIT_API_KEY=your-livekit-api-key"
echo "LIVEKIT_API_SECRET=your-livekit-api-secret"
echo "SUPABASE_URL=$SUPABASE_URL"
echo "SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_ROLE_KEY"
echo "SIGNALWIRE_SPACE=erik.signalwire.com"
echo "SIGNALWIRE_PROJECT_ID=your-signalwire-project-id"
echo "SIGNALWIRE_API_TOKEN=your-signalwire-api-token"
echo "OPENAI_API_KEY=$OPENAI_API_KEY"
echo "DEEPGRAM_API_KEY=your-deepgram-api-key"
echo "ELEVENLABS_API_KEY=$ELEVENLABS_API_KEY"
echo ""
echo "=========================================="
