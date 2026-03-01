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
LXC_IP="10.10.0.22"
LXC_PORT="8080"
BUN="${BUN:-$HOME/.bun/bin/bun}"
CARGO="${CARGO:-$HOME/.cargo/bin/cargo}"
ALERT_USER="${ALERT_USER:-shtrudel}"

cd "$REPO_ROOT"

echo "=== Step 1/5: Pulling latest main ==="
git checkout main
git pull origin main

echo "=== Step 2/5: Building web frontend ==="
cd web
"$BUN" install --frozen-lockfile
"$BUN" run build
cd "$REPO_ROOT"

echo "=== Step 3/5: Building Rust server ==="
"$CARGO" build --release -p panoptikon-server

echo "=== Step 4/5: Deploying to LXC $LXC_ID ==="
scp target/release/panoptikon-server "$DEVBOX":/tmp/panoptikon-server
ssh "$DEVBOX" "pct exec $LXC_ID -- systemctl stop panoptikon; pct push $LXC_ID /tmp/panoptikon-server /usr/local/bin/panoptikon-server; pct exec $LXC_ID -- systemctl start panoptikon"

echo ""
echo "=== Step 5/5: Post-deploy smoke test ==="

SMOKE_URL="http://${LXC_IP}:${LXC_PORT}"

if "$REPO_ROOT/scripts/smoke-test.sh" "$SMOKE_URL"; then
  echo ""
  echo "Deploy complete — panoptikon is running and healthy on LXC $LXC_ID"
else
  echo ""
  echo "DEPLOY WARNING: Smoke test FAILED on LXC $LXC_ID"
  echo "Alerting $ALERT_USER — deploy is NOT healthy."
  # Send wall message to alert logged-in users
  wall "PANOPTIKON DEPLOY FAILED SMOKE TEST on LXC $LXC_ID — check logs" 2>/dev/null || true
  exit 1
fi
