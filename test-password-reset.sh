#!/bin/bash

# Load anon key from .env
source .env

curl -X POST "https://api.magpipe.ai/functions/v1/send-password-reset" \
  -H "Content-Type: application/json" \
  -H "apikey: $VITE_SUPABASE_ANON_KEY" \
  -d '{"email": "elagerway@gmail.com"}'
