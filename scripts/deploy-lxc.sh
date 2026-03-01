#!/usr/bin/env bash
#
# deploy-lxc.sh — Build and deploy panoptikon to LXC 115 via DevBox (10.10.0.11).
#
# Used by:
#   - GitHub Actions self-hosted runner (deploy.yml)
#   - Maestro deploy hook (maestro-panoptikon.yaml)
#
# Topology:
#   shtrudel (10.10.0.14) → scp binary → DevBox (10.10.0.11) → pct push → LXC 115 (10.10.0.22)
#
set -euo pipefail

REPO_ROOT="${REPO_ROOT:-/home/shtrudel/src/panoptikon}"
DEVBOX="root@10.10.0.11"
LXC_ID="115"
BUN="${BUN:-$HOME/.bun/bin/bun}"
CARGO="${CARGO:-$HOME/.cargo/bin/cargo}"

cd "$REPO_ROOT"

echo "=== Step 1/4: Pulling latest main ==="
git checkout main
git pull origin main

echo "=== Step 2/4: Building web frontend ==="
cd web
"$BUN" install --frozen-lockfile
"$BUN" run build
cd "$REPO_ROOT"

echo "=== Step 3/4: Building Rust server ==="
"$CARGO" build --release -p panoptikon-server

echo "=== Step 4/5: Deploying to LXC $LXC_ID ==="
scp target/release/panoptikon-server "$DEVBOX":/tmp/panoptikon-server
ssh "$DEVBOX" "pct exec $LXC_ID -- systemctl stop panoptikon; pct push $LXC_ID /tmp/panoptikon-server /usr/local/bin/panoptikon-server; pct exec $LXC_ID -- systemctl start panoptikon"

echo ""
echo "=== Step 5/5: Running smoke tests ==="
if "$REPO_ROOT/scripts/smoke-test.sh" "http://10.10.0.22:8080"; then
  echo ""
  echo "Deploy complete — panoptikon is running on LXC $LXC_ID (smoke tests passed)"
else
  SMOKE_EXIT=$?
  echo ""
  echo "DEPLOY WARNING: Smoke tests FAILED (exit code $SMOKE_EXIT)"
  echo "Server is running but may not be fully functional."
  echo "Alerting Oleg..."
  # Send webhook/notification if configured
  if command -v curl &> /dev/null; then
    curl -sf "http://10.10.0.22:8080/api/v1/webhooks/notify" \
      -H 'Content-Type: application/json' \
      -d "{\"event\":\"deploy_smoke_failed\",\"message\":\"Smoke tests failed after deploy to LXC $LXC_ID (exit $SMOKE_EXIT)\"}" \
      2>/dev/null || true
  fi
  exit 1
fi
