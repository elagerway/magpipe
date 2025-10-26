#!/bin/bash

# Direct SignalWire API call to create SIP endpoint
source .env

USER_ID="your-user-id-here"  # We'll get this from database
USER_EMAIL="erik@snapsonic.com"

# Create SIP username from user ID (first 16 chars without dashes)
SIP_USERNAME="pat_$(echo $USER_ID | tr -d '-' | cut -c1-16)"

# Generate secure password
SIP_PASSWORD=$(openssl rand -base64 24 | tr -d '/+=' | cut -c1-32)

echo "Creating SIP endpoint..."
echo "Username: $SIP_USERNAME"

# Create SIP endpoint in SignalWire
RESPONSE=$(curl -s -X POST \
  "https://$SIGNALWIRE_SPACE_URL/api/relay/rest/endpoints" \
  -u "$SIGNALWIRE_PROJECT_ID:$SIGNALWIRE_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"identifier\": \"$SIP_USERNAME\",
    \"password\": \"$SIP_PASSWORD\",
    \"display_name\": \"Pat - $USER_EMAIL\",
    \"codecs\": [\"PCMU\", \"PCMA\", \"OPUS\"],
    \"ciphers\": [\"AES_CM_128_HMAC_SHA1_80\"],
    \"encryption\": \"optional\"
  }")

echo "SignalWire Response:"
echo "$RESPONSE" | python3 -m json.tool

# Extract endpoint ID
ENDPOINT_ID=$(echo "$RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin)['id'])" 2>/dev/null)

if [ -n "$ENDPOINT_ID" ]; then
  echo ""
  echo "SIP Endpoint Created Successfully!"
  echo "Endpoint ID: $ENDPOINT_ID"
  echo "SIP Username: $SIP_USERNAME"
  echo "SIP Password: $SIP_PASSWORD"
  echo "SIP Realm: $SIGNALWIRE_SPACE_URL"
  echo "WebSocket Server: wss://$SIGNALWIRE_SPACE_URL"
  echo ""
  echo "Now update your user record in the database with these credentials."
fi
