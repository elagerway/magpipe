#!/bin/bash
curl -s "https://erik.signalwire.com/api/laml/2010-04-01/Accounts/your-signalwire-project-id/IncomingPhoneNumbers.json" \
  -u "your-signalwire-project-id:your-signalwire-api-token" | \
  jq '.incoming_phone_numbers[] | select(.phone_number == "+16282954811") | {phone_number, voice_url, sms_url, sid}'
