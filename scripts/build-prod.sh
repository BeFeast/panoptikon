#!/usr/bin/env bash
#
# build-prod.sh — Build Panoptikon production binary with embedded frontend.
#
# rust-embed bakes web/.next/static/ into the binary at compile time.
# Order matters: web MUST be built BEFORE cargo build.
# Running cargo build alone produces a binary with STALE frontend.
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

BUN="${BUN:-$HOME/.bun/bin/bun}"
CARGO="${CARGO:-$HOME/.cargo/bin/cargo}"

echo "=== Step 1/2: Building web frontend ==="
cd web
"$BUN" install --frozen-lockfile
"$BUN" run build
cd "$REPO_ROOT"

echo "=== Step 2/2: Building Rust server (embeds frontend via rust-embed) ==="
"$CARGO" build --release -p panoptikon-server

echo ""
echo "✅ Production binary ready: target/release/panoptikon-server"
echo "   Frontend embedded from: web/.next/static/"
ls -lh target/release/panoptikon-server
