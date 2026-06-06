#!/bin/bash
# Block commits that ADD hardcoded secrets. Override a false positive with:
#   ALLOW_SECRET=1 git commit ...
set -u
[ "${ALLOW_SECRET:-0}" = "1" ] && exit 0
added=$(git diff --cached -U0 --no-color --diff-filter=ACM | grep -E '^\+' | grep -vE '^\+\+\+')
[ -z "$added" ] && exit 0
patterns='sk_(test|live)_[A-Za-z0-9]{20,}|AC[0-9a-f]{32}|AIza[0-9A-Za-z_-]{30,}|sbp_[A-Za-z0-9]{20,}|PT[a-f0-9]{40,}|sk-[A-Za-z0-9_-]{20,}|sk_live_[A-Za-z0-9]{20,}|rk_live_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{30,}|gh[pousr]_[A-Za-z0-9]{30,}|xox[baprs]-[0-9A-Za-z-]{10,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|EAA[A-Za-z0-9]{60,}|eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}'
hits=$(printf '%s\n' "$added" | grep -nIE "$patterns" | grep -viE 'YOUR_|placeholder|example|REDACTED|xxxx|<your|555555')
if [ -n "$hits" ]; then
  echo "🛑 pre-commit: possible hardcoded secret in staged changes:" >&2
  printf '%s\n' "$hits" | head -20 >&2
  echo "→ Use env vars / Vault, not literals. False positive? ALLOW_SECRET=1 git commit ..." >&2
  exit 1
fi
exit 0
