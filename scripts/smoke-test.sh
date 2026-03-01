#!/usr/bin/env bash
#
# smoke-test.sh — Post-deploy smoke test for panoptikon.
#
# Runs:
#   1. curl health check against the target server
#   2. Playwright smoke suite (key pages load, no crashes)
#
# Usage:
#   scripts/smoke-test.sh [URL]
#
# Arguments:
#   URL   Base URL to test (default: http://10.10.0.22:8080)
#
# Exit codes:
#   0 — all checks passed
#   1 — health check or smoke tests failed
#
set -euo pipefail

PANOPTIKON_URL="${1:-http://10.10.0.22:8080}"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUN="${BUN:-bun}"

echo "=== Smoke Test: $PANOPTIKON_URL ==="
echo ""

# -------------------------------------------------------------------
# Step 1: Health check via curl
# -------------------------------------------------------------------
echo "--- Step 1/2: Health check ---"

HEALTH_OK=false
for i in $(seq 1 30); do
  if curl -sf "${PANOPTIKON_URL}/api/v1/auth/status" > /dev/null 2>&1; then
    echo "Health check passed after ${i}s"
    HEALTH_OK=true
    break
  fi
  sleep 1
done

if [ "$HEALTH_OK" != "true" ]; then
  echo "FAIL: Server at $PANOPTIKON_URL did not respond within 30 seconds"
  exit 1
fi

# -------------------------------------------------------------------
# Step 2: Playwright smoke suite
# -------------------------------------------------------------------
echo ""
echo "--- Step 2/2: Playwright smoke tests ---"

cd "$REPO_ROOT/web"

# Install deps if needed (CI may already have them)
if [ ! -d "node_modules" ]; then
  "$BUN" install
fi

# Run only smoke tests against the target URL
PANOPTIKON_URL="$PANOPTIKON_URL" "$BUN"x playwright test tests/e2e/smoke.spec.ts 2>&1
RESULT=$?

echo ""
if [ $RESULT -eq 0 ]; then
  echo "=== SMOKE TEST PASSED ==="
else
  echo "=== SMOKE TEST FAILED ==="
fi

exit $RESULT
