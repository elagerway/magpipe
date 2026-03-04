#!/bin/bash

# Get the current user's auth token from localStorage
# You'll need to copy this from the browser console
echo "Please get your auth token from the browser console:"
echo "1. Open browser DevTools (F12)"
echo "2. Go to Console tab"
echo "3. Run: localStorage.getItem('sb-mtxbiyilvgwhbdptysex-auth-token')"
echo "4. Copy the access_token value from the JSON"
echo ""
read -p "Enter your access token: " AUTH_TOKEN

# Call the Edge Function
curl -X POST \
  "https://api.magpipe.ai/functions/v1/create-user-sip-endpoint" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" | python3 -m json.tool
