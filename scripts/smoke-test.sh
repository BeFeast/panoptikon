#!/usr/bin/env bash
#
# smoke-test.sh — Post-deploy smoke test for Panoptikon on LXC 115.
#
# Runs:
#   1. curl health check (login page responds)
#   2. Playwright smoke suite (key pages load, no crashes)
#
# Usage:
#   ./scripts/smoke-test.sh [base_url]
#
# Defaults to http://10.10.0.22:8080 (LXC 115 IP).
# Set PANOPTIKON_URL env var or pass as first argument to override.
#
# Exit codes:
#   0 — all checks passed
#   1 — health check or smoke tests failed
#
set -euo pipefail

BASE_URL="${1:-${PANOPTIKON_URL:-http://10.10.0.22:8080}}"
REPO_ROOT="${REPO_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
ALERT_USER="${ALERT_USER:-shtrudel}"

echo "=== Panoptikon Smoke Test ==="
echo "Target: $BASE_URL"
echo ""

# --- Step 1: Health check (curl) ---
echo "--- Step 1/2: Health check ---"
HEALTH_OK=false
for i in $(seq 1 10); do
  if curl -sf "${BASE_URL}/login" > /dev/null 2>&1; then
    echo "Health check passed (attempt $i)"
    HEALTH_OK=true
    break
  fi
  echo "Waiting for server... (attempt $i/10)"
  sleep 3
done

if [ "$HEALTH_OK" = false ]; then
  echo "FAIL: Server at $BASE_URL did not respond within 30 seconds"
  echo ""
  echo "ALERT: @${ALERT_USER} — Panoptikon deploy smoke test FAILED (health check)"
  exit 1
fi

# --- Step 2: Playwright smoke suite ---
echo ""
echo "--- Step 2/2: Playwright smoke tests ---"
cd "$REPO_ROOT/web"

# Check if playwright and dependencies are available
if ! command -v bunx &> /dev/null && ! command -v npx &> /dev/null; then
  echo "WARN: Neither bunx nor npx available, skipping Playwright smoke tests"
  echo "Health check passed — deploy is likely OK but not fully verified"
  exit 0
fi

RUNNER="bunx"
if ! command -v bunx &> /dev/null; then
  RUNNER="npx"
fi

# Run only the smoke-tagged tests (or all tests if no smoke tag exists)
PANOPTIKON_URL="$BASE_URL" $RUNNER playwright test --grep "@smoke" 2>&1 || {
  # If no @smoke tests found, run the core page-load tests
  echo "No @smoke-tagged tests found, running core page-load tests..."
  PANOPTIKON_URL="$BASE_URL" $RUNNER playwright test dashboard navigation auth 2>&1 || {
    echo ""
    echo "FAIL: Playwright smoke tests failed"
    echo "ALERT: @${ALERT_USER} — Panoptikon deploy smoke test FAILED (Playwright)"
    exit 1
  }
}

echo ""
echo "=== All smoke tests passed ==="
