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
echo "Deploy complete — panoptikon is running on LXC $LXC_ID"

echo ""
echo "=== Step 5/5: Post-deploy smoke test ==="
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if REPO_ROOT="$REPO_ROOT" "$SCRIPT_DIR/smoke-test.sh" "http://10.10.0.22:8080"; then
  echo "Smoke test passed — deploy is verified."
else
  echo "SMOKE TEST FAILED — deploy is NOT verified."
  echo "Alerting Oleg..."
  # Send alert via GitHub issue comment if gh is available
  if command -v gh &>/dev/null; then
    gh issue comment 428 --repo BeFeast/panoptikon --body "Smoke test failed after deploy to LXC $LXC_ID. Manual verification needed." 2>/dev/null || true
  fi
  exit 1
fi
