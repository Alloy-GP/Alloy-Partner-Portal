#!/usr/bin/env bash
# One-command authenticated QA: mints a fresh session, opens the headless
# browser to a path, screenshots it. Token is always fresh — never times out.
#
#   scripts/qa.sh /leads                 # live site (partner.alloygp.co)
#   scripts/qa.sh /leads local           # local vite preview on :4789
#   scripts/qa.sh /leads local /tmp/x.png
set -euo pipefail
cd "$(dirname "$0")/.."

PATH_=${1:-/leads}
WHERE=${2:-live}
OUT=${3:-/tmp/qa.png}
BROWSE="$HOME/.claude/skills/gstack/browse/dist/browse"
REF="aryttfcmleukwstknvio"

if [ "$WHERE" = "local" ]; then BASE="http://localhost:4789"; else BASE="https://partner.alloygp.co"; fi

B64=$(node scripts/qa-login.mjs)   # fresh session, base64

"$BROWSE" viewport 1440x900 >/dev/null 2>&1
"$BROWSE" goto "$BASE/" >/dev/null 2>&1
"$BROWSE" js "localStorage.setItem('sb-${REF}-auth-token', atob('$B64')); 'set'" >/dev/null 2>&1
"$BROWSE" goto "$BASE$PATH_" >/dev/null 2>&1
"$BROWSE" wait --networkidle >/dev/null 2>&1 || true
sleep 1
"$BROWSE" screenshot "$OUT" >/dev/null 2>&1
echo "shot: $OUT  ($BASE$PATH_)"
