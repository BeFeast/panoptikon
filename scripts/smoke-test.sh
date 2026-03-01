#!/usr/bin/env bash
#
# smoke-test.sh — Post-deploy smoke test for panoptikon on LXC 115.
#
# Runs:
#   1. curl health check against the deployed instance
#   2. Playwright smoke suite (key pages load, no crashes)
#
# If any check fails, exits non-zero so the caller can alert.
#
# Usage:
#   scripts/smoke-test.sh [URL]
#   Default URL: http://10.10.0.22:8080
#
set -euo pipefail

PANOPTIKON_URL="${1:-http://10.10.0.22:8080}"
REPO_ROOT="${REPO_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
BUN="${BUN:-$HOME/.bun/bin/bun}"

echo "=== Smoke Test: $PANOPTIKON_URL ==="

# --- Step 1: Health check ---
echo ""
echo "--- Step 1/2: Health check ---"
HEALTH_RESPONSE=$(curl -sf --max-time 10 "$PANOPTIKON_URL/health" 2>&1) || {
  echo "FAIL: Health check failed — server at $PANOPTIKON_URL is not responding."
  echo "Response: $HEALTH_RESPONSE"
  exit 1
}

if [ "$HEALTH_RESPONSE" != "ok" ]; then
  echo "FAIL: Health check returned unexpected response: $HEALTH_RESPONSE"
  exit 1
fi
echo "PASS: Health check returned 'ok'"

# --- Step 2: Playwright smoke suite ---
echo ""
echo "--- Step 2/2: Playwright smoke suite ---"
cd "$REPO_ROOT/web"

# Install deps if needed (CI may have them cached)
if [ ! -d "node_modules" ]; then
  "$BUN" install --frozen-lockfile
fi

# Run only smoke-tagged tests
PANOPTIKON_URL="$PANOPTIKON_URL" "$BUN" x playwright test --grep @smoke 2>&1 || {
  echo ""
  echo "FAIL: Playwright smoke tests failed against $PANOPTIKON_URL"
  echo "Deploy should NOT be marked as successful."
  exit 1
}

echo ""
echo "=== All smoke tests passed ==="
