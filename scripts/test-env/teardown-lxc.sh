#!/usr/bin/env bash
#
# teardown-lxc.sh — Remove LXC test containers from Proxmox DevBox
# This only tears down current Controller lab clients; it does not manage the
# planned isolated Proxmox Gateway fabric.
#
# Run this script ON the Proxmox host (10.10.0.11) as root.
#
# Usage:
#   ssh root@10.10.0.11 bash /tmp/teardown-lxc.sh
#
set -euo pipefail

CONTAINER_IDS=(201 202 203)

log() { printf '\033[1;32m[test-env]\033[0m %s\n' "$*"; }

log "Tearing down Panoptikon LXC test environment"

for ct_id in "${CONTAINER_IDS[@]}"; do
  if ! pct status "$ct_id" &>/dev/null; then
    log "CT $ct_id does not exist, skipping"
    continue
  fi

  hostname=$(pct config "$ct_id" | grep hostname | awk '{print $2}')

  if pct status "$ct_id" | grep -q running; then
    log "Stopping CT $ct_id ($hostname)..."
    pct stop "$ct_id"
  fi

  log "Destroying CT $ct_id ($hostname)..."
  pct destroy "$ct_id" --purge

  log "CT $ct_id removed"
done

log "Test environment teardown complete"
