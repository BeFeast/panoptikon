#!/usr/bin/env bash
#
# deploy-worker.sh — Local artifact-driven deploy worker for Panoptikon.
#
# Decouples production deploys from GitHub Actions. Polls for successful
# CI builds on main, downloads the binary artifact, deploys to LXC 115,
# runs health checks, and sends Telegram notifications.
#
# Modes:
#   deploy-worker.sh                — One-shot: deploy latest undeployed build
#   deploy-worker.sh --watch        — Continuous: poll for new builds
#   deploy-worker.sh --rollback     — Rollback to previous version
#
# Environment:
#   TELEGRAM_BOT_TOKEN  — Bot token (optional, enables Telegram)
#   TELEGRAM_CHAT_ID    — Chat ID (optional)
#   DEPLOY_STATE_DIR    — State dir (default: ~/.panoptikon-deploy)
#   POLL_INTERVAL       — Seconds between polls in --watch (default: 60)
#   REPO                — GitHub repo (default: BeFeast/panoptikon)
#
# State directory layout:
#   ~/.panoptikon-deploy/
#   ├── deploy.lock             — flock-based single-flight lock
#   ├── last-deployed-run       — Run ID of last successful deploy
#   ├── logs/
#   │   └── deploy-<timestamp>.log
#   └── rollback/
#       └── panoptikon-server   — Previous binary for rollback
#
set -euo pipefail

# ── Configuration ─────────────────────────────────────────────────────────────

REPO="${REPO:-BeFeast/panoptikon}"
DEPLOY_STATE_DIR="${DEPLOY_STATE_DIR:-$HOME/.panoptikon-deploy}"
POLL_INTERVAL="${POLL_INTERVAL:-60}"

LOCK_FILE="$DEPLOY_STATE_DIR/deploy.lock"
LAST_RUN_FILE="$DEPLOY_STATE_DIR/last-deployed-run"
LOG_DIR="$DEPLOY_STATE_DIR/logs"
ROLLBACK_DIR="$DEPLOY_STATE_DIR/rollback"

DEVBOX="root@10.10.0.11"
LXC_ID="115"
LXC_HOST="10.10.0.22"
PANOPTIKON_URL="http://${LXC_HOST}:8080"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# ── Helpers ───────────────────────────────────────────────────────────────────

log() {
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"
}

die() {
  log "FATAL: $*"
  exit 1
}

ensure_dirs() {
  mkdir -p "$DEPLOY_STATE_DIR" "$LOG_DIR" "$ROLLBACK_DIR"
}

# ── Lock ──────────────────────────────────────────────────────────────────────

acquire_lock() {
  exec 200>"$LOCK_FILE"
  if ! flock -n 200; then
    die "Another deploy is in progress (lock: $LOCK_FILE). Exiting."
  fi
  log "Deploy lock acquired"
}

release_lock() {
  flock -u 200 2>/dev/null || true
}

# ── GitHub Actions ────────────────────────────────────────────────────────────

get_latest_successful_run() {
  # Get the latest successful CI run on main
  gh run list \
    --repo "$REPO" \
    --branch main \
    --workflow ci.yml \
    --status completed \
    --json databaseId,headSha,conclusion,createdAt \
    --limit 5 \
    --jq '[.[] | select(.conclusion == "success")] | .[0]'
}

get_last_deployed_run() {
  if [[ -f "$LAST_RUN_FILE" ]]; then
    cat "$LAST_RUN_FILE"
  else
    echo ""
  fi
}

save_last_deployed_run() {
  echo "$1" > "$LAST_RUN_FILE"
}

download_artifact() {
  local run_id="$1"
  local dest_dir="$2"

  log "Downloading artifact from run $run_id..."
  gh run download "$run_id" \
    --repo "$REPO" \
    --name deploy-server-amd64 \
    --dir "$dest_dir"

  if [[ ! -f "$dest_dir/target/release/panoptikon-server" ]]; then
    # artifact might flatten paths — check alternate locations
    if [[ -f "$dest_dir/panoptikon-server" ]]; then
      return 0
    fi
    die "Downloaded artifact does not contain panoptikon-server binary"
  fi

  # Move binary to top level for consistency
  mv "$dest_dir/target/release/panoptikon-server" "$dest_dir/panoptikon-server"
}

# ── Backup / Rollback ────────────────────────────────────────────────────────

backup_current_binary() {
  log "Backing up current binary from LXC $LXC_ID..."
  # Pull current binary from LXC via DevBox
  ssh "$DEVBOX" "pct pull $LXC_ID /usr/local/bin/panoptikon-server /tmp/panoptikon-server-backup" 2>/dev/null || true
  scp "$DEVBOX":/tmp/panoptikon-server-backup "$ROLLBACK_DIR/panoptikon-server" 2>/dev/null || {
    log "WARNING: Could not backup current binary (first deploy?)"
    return 0
  }
  log "Backup saved to $ROLLBACK_DIR/panoptikon-server"
}

do_rollback() {
  if [[ ! -f "$ROLLBACK_DIR/panoptikon-server" ]]; then
    die "No rollback binary found at $ROLLBACK_DIR/panoptikon-server"
  fi

  log "=== ROLLBACK: Restoring previous binary ==="
  deploy_binary "$ROLLBACK_DIR/panoptikon-server"

  if health_check; then
    log "Rollback successful — server is healthy"
    notify_telegram "rollback_success" "" "" ""
  else
    log "CRITICAL: Rollback also failed! Manual intervention required."
    notify_telegram "rollback_failed" "" "" ""
    exit 1
  fi
}

# ── Deploy ────────────────────────────────────────────────────────────────────

deploy_binary() {
  local binary_path="$1"

  log "Deploying binary to LXC $LXC_ID..."
  log "  Binary: $binary_path ($(ls -lh "$binary_path" | awk '{print $5}'))"

  # Copy to DevBox
  scp "$binary_path" "$DEVBOX":/tmp/panoptikon-server

  # Stop service, push binary, start service
  ssh "$DEVBOX" bash -s "$LXC_ID" <<'REMOTE_SCRIPT'
    LXC_ID="$1"
    pct exec "$LXC_ID" -- systemctl stop panoptikon || true
    pct push "$LXC_ID" /tmp/panoptikon-server /usr/local/bin/panoptikon-server
    pct exec "$LXC_ID" -- chmod +x /usr/local/bin/panoptikon-server
    pct exec "$LXC_ID" -- systemctl start panoptikon
REMOTE_SCRIPT

  log "Binary deployed and service restarted"
}

# ── Health Check ──────────────────────────────────────────────────────────────

health_check() {
  log "Running health checks against $PANOPTIKON_URL..."

  local ok=false
  for i in $(seq 1 15); do
    if curl -sf "${PANOPTIKON_URL}/login" > /dev/null 2>&1; then
      log "Health check passed after ${i}s"
      ok=true
      break
    fi
    log "  Waiting for server... (${i}/15)"
    sleep 2
  done

  if [[ "$ok" == "false" ]]; then
    log "HEALTH CHECK FAILED: Server not responding at ${PANOPTIKON_URL}/login"
    return 1
  fi

  # Verify we can reach the API
  if curl -sf "${PANOPTIKON_URL}/api/v1/settings" > /dev/null 2>&1; then
    log "API health check passed"
  else
    log "WARNING: /login responds but /api/v1/settings does not (may need auth)"
  fi

  return 0
}

# ── Telegram ──────────────────────────────────────────────────────────────────

notify_telegram() {
  local status="$1"    # success, failure, rollback_success, rollback_failed
  local version="$2"
  local commit="$3"
  local run_id="$4"

  if [[ -z "${TELEGRAM_BOT_TOKEN:-}" || -z "${TELEGRAM_CHAT_ID:-}" ]]; then
    log "Telegram not configured — skipping notification"
    return 0
  fi

  local emoji
  local body
  case "$status" in
    success)
      emoji="✅"
      body="*Panoptikon deployed*

${emoji} Deploy successful

*Version:* \`${version}\`
*Commit:* \`${commit:0:8}\`
*Host:* LXC ${LXC_ID} (${LXC_HOST})
*Health:* ${PANOPTIKON_URL}/login ✓
*CI Run:* [#${run_id}](https://github.com/${REPO}/actions/runs/${run_id})"
      ;;
    failure)
      emoji="❌"
      body="*Panoptikon deploy FAILED*

${emoji} Deploy failed — rolling back

*Version:* \`${version}\`
*Commit:* \`${commit:0:8}\`
*CI Run:* [#${run_id}](https://github.com/${REPO}/actions/runs/${run_id})"
      ;;
    rollback_success)
      emoji="⚠️"
      body="*Panoptikon rollback complete*

${emoji} Rolled back to previous version
*Host:* LXC ${LXC_ID} (${LXC_HOST})
*Health:* ${PANOPTIKON_URL}/login ✓"
      ;;
    rollback_failed)
      emoji="🔴"
      body="*Panoptikon CRITICAL*

${emoji} Deploy AND rollback failed!
Manual intervention required on LXC ${LXC_ID}"
      ;;
  esac

  curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
    -d "chat_id=${TELEGRAM_CHAT_ID}" \
    -d "parse_mode=Markdown" \
    -d "text=${body}" > /dev/null 2>&1 || {
    log "WARNING: Failed to send Telegram notification"
  }
}

# ── Main: One-shot deploy ────────────────────────────────────────────────────

do_deploy() {
  log "=== Panoptikon Deploy Worker ==="
  log "Checking for new successful builds..."

  # Get latest successful CI run
  local run_json
  run_json=$(get_latest_successful_run)

  if [[ -z "$run_json" || "$run_json" == "null" ]]; then
    log "No successful CI runs found on main"
    return 1
  fi

  local run_id commit created_at
  run_id=$(echo "$run_json" | jq -r '.databaseId')
  commit=$(echo "$run_json" | jq -r '.headSha')
  created_at=$(echo "$run_json" | jq -r '.createdAt')

  log "Latest successful build: run=$run_id commit=${commit:0:8} at=$created_at"

  # Check if already deployed
  local last_deployed
  last_deployed=$(get_last_deployed_run)

  if [[ "$last_deployed" == "$run_id" ]]; then
    log "Run $run_id already deployed — nothing to do"
    return 0
  fi

  log "New build detected (last deployed: ${last_deployed:-none})"

  # Download artifact
  local tmp_dir
  tmp_dir=$(mktemp -d)
  trap 'rm -rf "$tmp_dir"' EXIT

  download_artifact "$run_id" "$tmp_dir"

  local binary="$tmp_dir/panoptikon-server"
  chmod +x "$binary"

  # Read metadata if present
  local version="unknown"
  if [[ -f "$tmp_dir/deploy-metadata.json" ]]; then
    version=$(jq -r '.version // "unknown"' "$tmp_dir/deploy-metadata.json")
    log "Artifact metadata: version=$version"
  fi

  # Backup current binary
  backup_current_binary

  # Deploy
  log "=== Deploying version $version (commit ${commit:0:8}) ==="
  deploy_binary "$binary"

  # Health check
  if health_check; then
    log "=== Deploy successful ==="
    save_last_deployed_run "$run_id"
    notify_telegram "success" "$version" "$commit" "$run_id"

    # Write state file for this deploy
    cat > "$DEPLOY_STATE_DIR/last-deploy.json" <<EOF
{
  "run_id": "$run_id",
  "commit": "$commit",
  "version": "$version",
  "deployed_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "status": "success"
}
EOF
  else
    log "=== Deploy FAILED — initiating rollback ==="
    notify_telegram "failure" "$version" "$commit" "$run_id"

    # Write state file
    cat > "$DEPLOY_STATE_DIR/last-deploy.json" <<EOF
{
  "run_id": "$run_id",
  "commit": "$commit",
  "version": "$version",
  "deployed_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "status": "failed"
}
EOF

    do_rollback
    return 1
  fi
}

# ── Main: Watch mode ─────────────────────────────────────────────────────────

do_watch() {
  log "=== Panoptikon Deploy Worker (watch mode) ==="
  log "Polling every ${POLL_INTERVAL}s for new builds..."

  while true; do
    if do_deploy; then
      :  # success or nothing to do
    else
      log "Deploy cycle returned non-zero (may be expected)"
    fi
    sleep "$POLL_INTERVAL"
  done
}

# ── Entry point ───────────────────────────────────────────────────────────────

main() {
  ensure_dirs

  local mode="${1:---once}"

  # Set up logging
  local log_file="$LOG_DIR/deploy-$(date -u +%Y%m%dT%H%M%SZ).log"
  exec > >(tee -a "$log_file") 2>&1
  log "Log file: $log_file"

  # Acquire single-flight lock
  acquire_lock

  case "$mode" in
    --watch)
      do_watch
      ;;
    --rollback)
      do_rollback
      ;;
    --once|"")
      do_deploy
      ;;
    *)
      echo "Usage: $0 [--watch | --rollback | --once]"
      exit 1
      ;;
  esac
}

main "$@"
