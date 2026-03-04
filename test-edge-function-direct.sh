#!/bin/bash

# Test the Edge Function directly with authentication
# This will show us the actual error message

source .env

echo "Testing admin-agent-chat Edge Function..."
echo ""

# First, get a valid user session token by signing in
echo "Getting auth token..."

AUTH_RESPONSE=$(curl -s -X POST \
  "${VITE_SUPABASE_URL}/auth/v1/token?grant_type=password" \
  -H "apikey: ${VITE_SUPABASE_ANON_KEY}" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"erik@snapsonic.com\",
    \"password\": \"${TEST_PASSWORD:-thisisatest123}\"
  }")

ACCESS_TOKEN=$(echo $AUTH_RESPONSE | grep -o '"access_token":"[^"]*' | cut -d'"' -f4)

if [ -z "$ACCESS_TOKEN" ]; then
  echo "Failed to get access token. Response:"
  echo $AUTH_RESPONSE | jq '.' 2>/dev/null || echo $AUTH_RESPONSE
  echo ""
  echo "Please set TEST_PASSWORD environment variable or update the script with the correct password"
  exit 1
fi

echo "Got access token: ${ACCESS_TOKEN:0:50}..."
echo ""

# Now call the Edge Function with the auth token
echo "Calling Edge Function..."
echo ""

RESPONSE=$(curl -s -X POST \
  "${VITE_SUPABASE_URL}/functions/v1/admin-agent-chat" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "apikey: ${VITE_SUPABASE_ANON_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello, can you help me test this?"}')

echo "Response:"
echo $RESPONSE | jq '.' 2>/dev/null || echo $RESPONSE
echo ""
