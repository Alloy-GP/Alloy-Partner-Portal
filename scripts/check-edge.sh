#!/usr/bin/env bash
# Type-check EVERY Supabase edge function with Deno (their real runtime).
#
# Why this exists: edge functions are deployed via the Supabase MCP with inline
# content, so a `npm run build` never touches them. A typo or out-of-scope
# reference (e.g. the `bar is not defined` bug that took invites down) compiles
# fine in a vacuum but throws at runtime. `deno check` catches that class
# (TS2304 "Cannot find name") before anything ships.
#
# RUN THIS before deploying ANY edge function. It is part of `npm run check`.
set -uo pipefail

# Deno is installed via Homebrew; make sure it's on PATH for non-login shells.
export PATH="/opt/homebrew/bin:$PATH"

if ! command -v deno >/dev/null 2>&1; then
  echo "ERROR: deno not found. Install it:  brew install deno" >&2
  exit 127
fi

cd "$(dirname "$0")/../supabase/functions" || exit 1

fail=0
for d in */index.ts; do
  if deno check "$d" >/tmp/check-edge.log 2>&1; then
    echo "ok    $d"
  else
    echo "FAIL  $d"
    grep -iE "error|cannot find|TS[0-9]" /tmp/check-edge.log | head -8
    fail=1
  fi
done

echo "---"
if [ $fail -eq 0 ]; then
  echo "✓ all edge functions type-check"
else
  echo "✗ edge function check FAILED — do not deploy" >&2
fi
exit $fail
