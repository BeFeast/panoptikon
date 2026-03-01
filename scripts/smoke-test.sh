#!/usr/bin/env bash
#
# smoke-test.sh — Post-deploy smoke test for Panoptikon.
#
# Runs:
#   1. curl health check (server responds on /login)
#   2. Playwright smoke suite (key pages load, no crashes)
#
# Usage:
#   scripts/smoke-test.sh [URL]
#
# Arguments:
#   URL — base URL of the Panoptikon instance (default: http://10.10.0.22:8080)
#
# Exit codes:
#   0 — all checks passed
#   1 — health check failed (server not responding)
#   2 — Playwright smoke tests failed
#
set -euo pipefail

PANOPTIKON_URL="${1:-http://10.10.0.22:8080}"
REPO_ROOT="${REPO_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
BUN="${BUN:-$HOME/.bun/bin/bun}"

echo "=== Smoke Test: $PANOPTIKON_URL ==="

# ── Step 1: Health check ──────────────────────────────────────────────
echo ""
echo "--- Step 1/2: Health check (curl) ---"

HEALTH_OK=false
for i in $(seq 1 10); do
  if curl -sf "${PANOPTIKON_URL}/login" > /dev/null 2>&1; then
    echo "Health check passed after ${i}s"
    HEALTH_OK=true
    break
  fi
  echo "  Waiting for server... (${i}/10)"
  sleep 2
done

if [ "$HEALTH_OK" = false ]; then
  echo ""
  echo "SMOKE TEST FAILED: Server not responding at ${PANOPTIKON_URL}/login"
  echo "Deploy should NOT be marked as success."
  exit 1
fi

# ── Step 2: Playwright smoke suite ────────────────────────────────────
echo ""
echo "--- Step 2/2: Playwright smoke suite ---"

cd "$REPO_ROOT/web"

# Install browsers if not present (CI may need this)
"$BUN" x playwright install chromium --with-deps 2>/dev/null || true

if PANOPTIKON_URL="$PANOPTIKON_URL" "$BUN" x playwright test smoke; then
  echo ""
  echo "ALL SMOKE TESTS PASSED"
  exit 0
else
  echo ""
  echo "SMOKE TEST FAILED: Playwright smoke suite had failures."
  echo "Deploy should NOT be marked as success."
  exit 2
fi
