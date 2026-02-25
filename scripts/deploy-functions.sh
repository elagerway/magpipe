#!/bin/bash
# Deploy Supabase Edge Functions with correct JWT verification settings.
#
# IMPORTANT: Functions that accept API key auth (resolveUser) or receive
# webhooks from external services MUST be deployed with --no-verify-jwt.
# Deploying without this flag silently re-enables JWT verification, which
# breaks API key auth and webhook handlers (they get 401 before code runs).
#
# Usage:
#   ./scripts/deploy-functions.sh                  # Deploy ALL functions
#   ./scripts/deploy-functions.sh batch-calls      # Deploy one function
#   ./scripts/deploy-functions.sh batch-calls get-agent list-agents  # Deploy several
#   ./scripts/deploy-functions.sh --dry-run        # Show what would be deployed
#   ./scripts/deploy-functions.sh --check          # Audit deployed JWT settings

set -e

PROJECT_REF="mtxbiyilvgwhbdptysex"

# ─── Functions that MUST have --no-verify-jwt ────────────────────────────
# Reason: resolveUser() API key auth OR external webhook (no JWT sent)
NO_VERIFY_JWT=(
  # ── API/MCP endpoints (resolveUser) ──
  access-code-update
  batch-calls
  cal-com-cancel-booking
  cal-com-create-booking
  cal-com-get-slots
  clone-voice
  create-agent
  create-chat-widget
  create-contact
  custom-functions
  delete-agent
  delete-contact
  delete-voice
  fetch-agent-avatar
  generate-agent-message
  get-agent
  get-call
  get-contact
  get-message
  get-signed-recording-url
  initiate-bridged-call
  initiate-callback-call
  knowledge-source-add
  knowledge-source-delete
  knowledge-source-list
  knowledge-source-manual
  list-agents
  list-calls
  list-chat-sessions
  list-contacts
  list-messages
  list-models
  list-phone-numbers
  list-voices
  lookup-phone-number
  manage-api-keys
  manage-dynamic-variables
  omni-chat
  org-analytics
  process-referral
  provision-phone-number
  release-phone-number
  search-phone-numbers
  semantic-memory-search
  send-user-sms
  stripe-add-credits
  terminate-call
  text-to-speech
  update-agent
  update-contact
  webhook-chat-message

  # ── SignalWire webhooks (no JWT) ──
  callback-call-handler
  callback-call-status
  conference-transfer
  conference-twiml
  forward-to-sip
  outbound-call-status
  outbound-call-swml
  outbound-dial-status
  signalwire-status-webhook
  sip-call-handler
  sip-call-status
  sip-recording-callback
  transfer-cxml
  warm-transfer-callback
  warm-transfer-status
  warm-transfer-twiml
  webhook-call-status
  webhook-campaign-status
  webhook-inbound-call
  webhook-inbound-sms
  webhook-sms-status

  # ── Other external webhooks (no JWT) ──
  cal-com-oauth-callback
  gmail-push-webhook
  integration-oauth-callback
  livekit-swml-handler
  stripe-webhook
  twitter-oauth-callback
  webhook-inbound-email
  webhook-livekit-egress

  # ── Cron/worker functions (service role, no JWT) ──
  process-batch-calls
  process-monthly-fees
  process-review-requests
  process-scheduled-actions
  process-social-listening
  gmail-watch-renew
  poll-gmail-inbox
  poll-gmail-tickets
  reconcile-recordings
  sync-area-codes

  # ── Public endpoints (no auth required) ──
  blog-rss
  notify-signup
  send-contact-email
  send-custom-plan-inquiry
  send-password-reset
)

# ─── Helper ──────────────────────────────────────────────────────────────

is_no_verify() {
  local name="$1"
  for fn in "${NO_VERIFY_JWT[@]}"; do
    [[ "$fn" == "$name" ]] && return 0
  done
  return 1
}

deploy_function() {
  local name="$1"
  local dir="supabase/functions/${name}/index.ts"

  if [[ ! -f "$dir" ]]; then
    echo "  SKIP  $name (no index.ts found)"
    return
  fi

  if is_no_verify "$name"; then
    echo "  DEPLOY  $name  (--no-verify-jwt)"
    if [[ "$DRY_RUN" != "1" ]]; then
      npx supabase functions deploy "$name" --no-verify-jwt --project-ref "$PROJECT_REF" 2>&1 | tail -1
    fi
  else
    echo "  DEPLOY  $name  (JWT verified)"
    if [[ "$DRY_RUN" != "1" ]]; then
      npx supabase functions deploy "$name" --project-ref "$PROJECT_REF" 2>&1 | tail -1
    fi
  fi
}

# ─── --check mode: audit current deployed settings ──────────────────────

if [[ "$1" == "--check" ]]; then
  echo "Auditing deployed JWT settings..."
  echo ""

  MISMATCHES=0
  DEPLOYED=$(curl -s "https://api.supabase.com/v1/projects/${PROJECT_REF}/functions" \
    -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" 2>/dev/null)

  if [[ -z "$DEPLOYED" || "$DEPLOYED" == "null" ]]; then
    echo "ERROR: Could not fetch deployed functions. Set SUPABASE_ACCESS_TOKEN."
    exit 1
  fi

  echo "$DEPLOYED" | python3 -c "
import sys, json

no_verify = set('''$(printf '%s\n' "${NO_VERIFY_JWT[@]}")'''.strip().split('\n'))

funcs = json.load(sys.stdin)
mismatches = []
for f in sorted(funcs, key=lambda x: x['name']):
    name = f['name']
    jwt_on = f.get('verify_jwt', True)
    should_no_verify = name in no_verify

    if jwt_on and should_no_verify:
        mismatches.append(f'  WRONG  {name}  (JWT ON, should be OFF)')
    elif not jwt_on and not should_no_verify:
        mismatches.append(f'  WARN   {name}  (JWT OFF, not in no-verify list)')

if mismatches:
    print(f'Found {len(mismatches)} issue(s):')
    print()
    for m in mismatches:
        print(m)
    print()
    print('Fix with: ./scripts/deploy-functions.sh <function-name>')
    sys.exit(1)
else:
    print('All functions have correct JWT settings.')
" && exit 0 || exit 1
fi

# ─── --dry-run mode ─────────────────────────────────────────────────────

if [[ "$1" == "--dry-run" ]]; then
  DRY_RUN=1
  shift
fi

# ─── Ensure access token ────────────────────────────────────────────────

if [[ -z "$SUPABASE_ACCESS_TOKEN" ]]; then
  export SUPABASE_ACCESS_TOKEN=sbp_17bff30d68c60e941858872853988d63169b2649
fi

# ─── Deploy specific functions or all ────────────────────────────────────

if [[ $# -gt 0 ]]; then
  # Deploy specific functions
  for name in "$@"; do
    deploy_function "$name"
  done
else
  # Deploy ALL functions
  echo "Deploying ALL edge functions..."
  echo ""
  for dir in supabase/functions/*/index.ts; do
    name=$(echo "$dir" | sed 's|supabase/functions/||;s|/index.ts||')
    [[ "$name" == "_shared" ]] && continue
    deploy_function "$name"
  done
fi

echo ""
echo "Done."
