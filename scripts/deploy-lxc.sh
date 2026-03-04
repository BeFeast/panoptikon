#!/usr/bin/env bash
#
# deploy-lxc.sh — Deploy a pre-built panoptikon binary to LXC 115 via DevBox.
#
# This script is now artifact-driven: it receives a pre-built binary and
# deploys it. Building is handled by CI; orchestration by deploy-worker.sh.
#
# Usage:
#   scripts/deploy-lxc.sh <binary-path>
#   scripts/deploy-lxc.sh                    # builds locally (legacy fallback)
#
# Topology:
#   shtrudel (10.10.0.14) → scp binary → DevBox (10.10.0.11) → pct push → LXC 115 (10.10.0.22)
#
set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
DEVBOX="root@10.10.0.11"
LXC_ID="115"
LXC_HOST="10.10.0.22"
BUN="${BUN:-$HOME/.bun/bin/bun}"
CARGO="${CARGO:-$HOME/.cargo/bin/cargo}"

BINARY_PATH="${1:-}"

# ── Build locally if no binary provided (legacy fallback) ─────────────────────

if [[ -z "$BINARY_PATH" ]]; then
  echo "No binary path provided — building locally (legacy mode)"
  echo ""

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

  BINARY_PATH="$REPO_ROOT/target/release/panoptikon-server"
fi

# ── Deploy ────────────────────────────────────────────────────────────────────

if [[ ! -f "$BINARY_PATH" ]]; then
  echo "ERROR: Binary not found at $BINARY_PATH" >&2
  exit 1
fi

echo "=== Deploying to LXC $LXC_ID ==="
echo "  Binary: $BINARY_PATH ($(ls -lh "$BINARY_PATH" | awk '{print $5}'))"

scp "$BINARY_PATH" "$DEVBOX":/tmp/panoptikon-server
ssh "$DEVBOX" "pct exec $LXC_ID -- systemctl stop panoptikon; pct push $LXC_ID /tmp/panoptikon-server /usr/local/bin/panoptikon-server; pct exec $LXC_ID -- chmod +x /usr/local/bin/panoptikon-server; pct exec $LXC_ID -- systemctl start panoptikon"

echo ""
echo "=== Running smoke tests ==="
if "$REPO_ROOT/scripts/smoke-test.sh" "http://${LXC_HOST}:8080"; then
  echo ""
  echo "Deploy complete — panoptikon is running on LXC $LXC_ID (smoke tests passed)"
else
  SMOKE_EXIT=$?
  echo ""
  echo "DEPLOY WARNING: Smoke tests FAILED (exit code $SMOKE_EXIT)"
  echo "Server is running but may not be fully functional."
  exit 1
fi
