#\!/bin/bash

curl -X POST "https://mtxbiyilvgwhbdptysex.supabase.co/functions/v1/send-password-reset" \
  -H "Content-Type: application/json" \
  -H "apikey: YOUR_SUPABASE_KEY" \
  -d '{"email": "elagerway@gmail.com"}'
