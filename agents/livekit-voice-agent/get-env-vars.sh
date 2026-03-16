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
echo "LIVEKIT_URL=$LIVEKIT_URL"
echo "LIVEKIT_API_KEY=$LIVEKIT_API_KEY"
echo "LIVEKIT_API_SECRET=$LIVEKIT_API_SECRET"
echo "SUPABASE_URL=$SUPABASE_URL"
echo "SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_ROLE_KEY"
echo "SIGNALWIRE_SPACE=$SIGNALWIRE_SPACE"
echo "SIGNALWIRE_PROJECT_ID=$SIGNALWIRE_PROJECT_ID"
echo "SIGNALWIRE_API_TOKEN=$SIGNALWIRE_API_TOKEN"
echo "OPENAI_API_KEY=$OPENAI_API_KEY"
echo "DEEPGRAM_API_KEY=$DEEPGRAM_API_KEY"
echo "ELEVENLABS_API_KEY=$ELEVENLABS_API_KEY"
echo ""
echo "=========================================="
