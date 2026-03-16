#!/bin/bash
source .env
curl -s "https://${SIGNALWIRE_SPACE_URL}/api/laml/2010-04-01/Accounts/${SIGNALWIRE_PROJECT_ID}/IncomingPhoneNumbers.json" \
  -u "${SIGNALWIRE_PROJECT_ID}:${SIGNALWIRE_API_TOKEN}" | \
  jq '.incoming_phone_numbers[] | select(.phone_number == "+16282954811") | {phone_number, voice_url, sms_url, sid}'
