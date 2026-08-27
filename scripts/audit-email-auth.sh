#!/bin/bash
# audit-email-auth.sh — audit SPF / DKIM / DMARC for a sending domain.
#
# Usage:  ./scripts/audit-email-auth.sh [domain]        (default: magpipe.ai)
#
# Exits non-zero if any required record is missing, so it can gate CI or a cron
# watchdog. See docs/EMAIL-AUTH-AND-DOMAIN-REPUTATION.md for the fix procedure.

set -uo pipefail

DOMAIN="${1:-magpipe.ai}"
FAIL=0

green() { printf "  \033[32mPASS\033[0m  %s\n" "$1"; }
red()   { printf "  \033[31mFAIL\033[0m  %s\n" "$1"; FAIL=1; }
warn()  { printf "  \033[33mWARN\033[0m  %s\n" "$1"; }

echo
echo "Email authentication audit — $DOMAIN"
echo "======================================================"

# ── Wildcard detection ────────────────────────────────────────────────────
# A wildcard record makes every undefined subdomain resolve, so _dmarc /
# *._domainkey / pm-bounces lookups return an answer that only *looks*
# configured. Detect it up front or the whole audit is untrustworthy.
WILDCARD=$(dig +short "wildcard-probe-$$.$DOMAIN" CNAME A 2>/dev/null | tr '\n' ' ')
if [ -n "$WILDCARD" ]; then
  echo
  warn "wildcard DNS detected: *.$DOMAIN → $WILDCARD"
  warn "subdomain results below (DMARC, DKIM, pm-bounces) may be FALSE POSITIVES"
fi

# ── SPF ───────────────────────────────────────────────────────────────────
echo
echo "SPF"
SPF=$(dig +short "$DOMAIN" TXT | tr -d '"' | grep -i "^v=spf1" || true)
SPF_COUNT=$(printf "%s" "$SPF" | grep -ci "v=spf1" || true)

if [ -z "$SPF" ]; then
  red "no SPF record at apex — mail from your mail host authenticates as spf=none"
elif [ "$SPF_COUNT" -gt 1 ]; then
  red "multiple SPF records ($SPF_COUNT) — this is a permerror, worse than none"
else
  green "$SPF"
  # Which mail host should be authorized depends on where MX points.
  # dig returns "<priority> <host>." — strip the priority or the provider
  # match tests the number instead of the hostname.
  MXHOST=$(dig +short "$DOMAIN" MX | awk '{print $2}' | sed 's/\.$//' | tr 'A-Z' 'a-z' | tr '\n' ' ')
  case "$MXHOST" in
    *google*)
      case "$SPF" in
        *_spf.google.com*) green "  authorizes Google Workspace (matches MX)" ;;
        *)                 red  "  MX is Google but SPF has no include:_spf.google.com" ;;
      esac ;;
    *mailspamprotection*|*siteground*)
      case "$SPF" in
        *_spf.mailspamprotection.com*) green "  authorizes SiteGround (matches MX)" ;;
        *)  red "  MX is SiteGround but SPF has no include:_spf.mailspamprotection.com" ;;
      esac ;;
    "") warn "  no MX record — domain receives no mail" ;;
    *)
      # Self-hosted mail host (e.g. mail.<domain>). Its IP must be authorized
      # explicitly — a provider include won't cover a per-account server IP.
      host="${MXHOST%% *}"
      mxip=$(dig +short "$host" A | head -1)
      if [ -z "$mxip" ]; then
        warn "  MX is $host — no A record resolves for it"
      elif printf '%s' "$SPF" | grep -qE "(^|[[:space:]])(a:$host|mx|ip4:$mxip)([[:space:]]|$)"; then
        green "  authorizes $host ($mxip) via a:/mx/ip4"
      else
        red "  MX $host resolves to $mxip, which SPF does not authorize"
        red "  add 'a:$host' — provider includes do not cover your server IP"
      fi ;;
  esac
  case "$SPF" in
    *spf.mtasv.net*) green "  authorizes Postmark directly" ;;
    *)               warn  "  no include:spf.mtasv.net (OK if custom Return-Path is live)" ;;
  esac
  case "$SPF" in
    *"-all") green "  strict (-all)" ;;
    *"~all") warn  "  softfail (~all) — tighten to -all once DMARC reports are clean" ;;
    *)       warn  "  no all mechanism — SPF will not fail unauthorized senders" ;;
  esac
fi

# ── DMARC ─────────────────────────────────────────────────────────────────
echo
echo "DMARC"
DMARC=$(dig +short "_dmarc.$DOMAIN" TXT | tr -d '"' | grep -i "^v=DMARC1" || true)
if [ -z "$DMARC" ]; then
  red "no DMARC record — Gmail/Yahoo/Microsoft bulk-sender rules require one"
else
  green "$DMARC"
  case "$DMARC" in
    *p=reject*)     green "  policy: reject (strongest)" ;;
    *p=quarantine*) warn  "  policy: quarantine — ramp to reject when reports are clean" ;;
    *p=none*)       warn  "  policy: none (monitor only) — satisfies the rules, ramp up next" ;;
  esac
  case "$DMARC" in
    *rua=*) green "  aggregate reporting configured" ;;
    *)      warn  "  no rua= — you get no visibility into failures" ;;
  esac
fi

# ── DKIM ──────────────────────────────────────────────────────────────────
echo
echo "DKIM"
found_dkim=0
for sel in default google pm pm1 pm2 postmark s1 s2 k1 selector1 selector2; do
  rec=$(dig +short "$sel._domainkey.$DOMAIN" TXT 2>/dev/null | tr -d '"' | tr -d '\n')
  cname=$(dig +short "$sel._domainkey.$DOMAIN" CNAME 2>/dev/null)
  if [ -n "$rec" ]; then
    green "selector '$sel' present (${#rec} bytes)"
    found_dkim=1
  elif [ -n "$cname" ]; then
    green "selector '$sel' → CNAME $cname"
    found_dkim=1
  fi
done
[ "$found_dkim" -eq 0 ] && red "no DKIM selector found among common names"

# Postmark specifics
echo
echo "Postmark"
# Postmark issues either the plain "pm" selector or a rotated, date-stamped one
# (e.g. 20260213063717pm._domainkey). The rotated form can't be guessed, so if
# the plain one is absent, take the selector from PM_DKIM_SELECTOR when set.
PM_DKIM=$(dig +short "pm._domainkey.$DOMAIN" TXT 2>/dev/null | tr -d '"')
PM_SELECTOR="pm"
if [ -z "$PM_DKIM" ] && [ -n "${PM_DKIM_SELECTOR:-}" ]; then
  PM_DKIM=$(dig +short "${PM_DKIM_SELECTOR}._domainkey.$DOMAIN" TXT 2>/dev/null | tr -d '"')
  PM_SELECTOR="$PM_DKIM_SELECTOR"
fi
PM_BOUNCE=$(dig +short "pm-bounces.$DOMAIN" CNAME 2>/dev/null)
if [ -n "$PM_DKIM" ]; then
  green "${PM_SELECTOR}._domainkey present (${#PM_DKIM} bytes)"
else
  red "no Postmark DKIM found at pm._domainkey"
  warn "  Postmark may have issued a rotated selector (e.g. 20260213063717pm)."
  warn "  Check Postmark → Sender Signatures → $DOMAIN → DNS Settings, then re-run:"
  warn "    PM_DKIM_SELECTOR=<selector-without-._domainkey> $0 $DOMAIN"
fi
if [ -n "$PM_BOUNCE" ]; then
  green "custom Return-Path pm-bounces → $PM_BOUNCE"
else
  warn "no pm-bounces CNAME — Postmark SPF alignment relies on the apex include"
fi

# ── Context ───────────────────────────────────────────────────────────────
echo
echo "Context"
MX=$(dig +short "$DOMAIN" MX | sort -n | head -3 | tr '\n' ' ')
echo "  MX:  ${MX:-<none>}"
CAA=$(dig +short "$DOMAIN" CAA | tr '\n' ' ')
[ -n "$CAA" ] && green "CAA: $CAA" || warn "no CAA record (optional hardening)"

echo
echo "======================================================"
if [ "$FAIL" -eq 0 ]; then
  printf "\033[32mAll required records present.\033[0m\n"
else
  printf "\033[31mMissing records — see docs/EMAIL-AUTH-AND-DOMAIN-REPUTATION.md\033[0m\n"
fi
echo
exit "$FAIL"
