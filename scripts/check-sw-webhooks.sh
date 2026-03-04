#!/bin/bash
curl -s "https://erik.signalwire.com/api/laml/2010-04-01/Accounts/fb9ea15e-cf87-4de2-8be2-0f619b8e956e/IncomingPhoneNumbers.json" \
  -u "fb9ea15e-cf87-4de2-8be2-0f619b8e956e:PTb99247e211706a7195122196aaa1281f97f93bbe64b24f28" | \
  jq '.incoming_phone_numbers[] | select(.phone_number == "+16282954811") | {phone_number, voice_url, sms_url, sid}'
