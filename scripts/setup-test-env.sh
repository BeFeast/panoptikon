#!/usr/bin/env bash
#
# setup-test-env.sh — Create LXC test containers on Proxmox for MikroTik integration testing.
#
# Creates 2-3 lightweight LXC containers that use MikroTik CHR (10.10.0.125) as their
# gateway. These containers simulate a small network for validating:
#   - VLAN assignment and tagging
#   - DHCP lease tracking
#   - Firewall rule application
#   - Per-device traffic monitoring
#
# Prerequisites:
#   - Run on a Proxmox host (or via SSH to one)
#   - MikroTik CHR VM already running at 10.10.0.125
#   - pveam templates available (Debian 12 preferred)
#   - Bridge vmbr0 exists and is on the 10.10.0.0/24 subnet
#
# Usage:
#   sudo bash scripts/setup-test-env.sh [create|destroy|status]
#
set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
MIKROTIK_GW="10.10.0.125"
BRIDGE="vmbr0"
TEMPLATE="local:vztmpl/debian-12-standard_12.7-1_amd64.tar.zst"
STORAGE="local-lvm"
NAMESERVER="1.1.1.1"

# Container definitions: CTID  NAME              IP               RAM(MB)  DISK(GB)  DESCRIPTION
CONTAINERS=(
  "200 pan-test-web    10.10.0.200/24 256 2  'Web server — nginx, generates HTTP traffic'"
  "201 pan-test-db     10.10.0.201/24 256 2  'Database — simulates heavier workload'"
  "202 pan-test-iot    10.10.0.202/24 128 1  'IoT device — minimal, DHCP-only client'"
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
log()  { echo "[$(date '+%H:%M:%S')] $*"; }
die()  { echo "ERROR: $*" >&2; exit 1; }

check_prerequisites() {
  command -v pct >/dev/null 2>&1 || die "pct not found — run this on a Proxmox host"
  [[ $(id -u) -eq 0 ]] || die "Must run as root (sudo)"

  # Check template exists; if not, try to download it
  if ! pveam list local 2>/dev/null | grep -q "debian-12-standard"; then
    log "Downloading Debian 12 template..."
    pveam download local debian-12-standard_12.7-1_amd64.tar.zst || \
      die "Failed to download template. Run: pveam update && pveam download local debian-12-standard_12.7-1_amd64.tar.zst"
  fi
}

# ---------------------------------------------------------------------------
# Create containers
# ---------------------------------------------------------------------------
create_containers() {
  check_prerequisites

  for entry in "${CONTAINERS[@]}"; do
    read -r ctid name ip ram disk desc <<< "$entry"

    if pct status "$ctid" &>/dev/null; then
      log "Container $ctid ($name) already exists — skipping"
      continue
    fi

    log "Creating container $ctid ($name) — $desc"
    pct create "$ctid" "$TEMPLATE" \
      --hostname "$name" \
      --storage "$STORAGE" \
      --rootfs "${STORAGE}:${disk}" \
      --memory "$ram" \
      --swap 0 \
      --cores 1 \
      --net0 "name=eth0,bridge=${BRIDGE},ip=${ip},gw=${MIKROTIK_GW}" \
      --nameserver "$NAMESERVER" \
      --unprivileged 1 \
      --start 0 \
      --ostype debian

    log "Starting container $ctid..."
    pct start "$ctid"

    # Wait for container to boot
    sleep 3

    log "Installing basic tools in $ctid..."
    pct exec "$ctid" -- bash -c "
      apt-get update -qq &&
      apt-get install -y -qq curl iputils-ping net-tools > /dev/null 2>&1
    " || log "Warning: package install in $ctid may have failed (non-fatal)"

    log "Container $ctid ($name) ready at ${ip%%/*}"
  done

  log ""
  log "=== Test environment created ==="
  log "Gateway (MikroTik CHR): $MIKROTIK_GW"
  log ""
  status_containers
}

# ---------------------------------------------------------------------------
# Destroy containers
# ---------------------------------------------------------------------------
destroy_containers() {
  for entry in "${CONTAINERS[@]}"; do
    read -r ctid name _ <<< "$entry"

    if ! pct status "$ctid" &>/dev/null; then
      log "Container $ctid ($name) does not exist — skipping"
      continue
    fi

    log "Stopping and destroying container $ctid ($name)..."
    pct stop "$ctid" 2>/dev/null || true
    sleep 1
    pct destroy "$ctid" --force
    log "Container $ctid destroyed"
  done

  log "Test environment cleaned up."
}

# ---------------------------------------------------------------------------
# Status
# ---------------------------------------------------------------------------
status_containers() {
  echo "CTID  NAME            IP              STATUS    RAM"
  echo "----  ----            --              ------    ---"
  for entry in "${CONTAINERS[@]}"; do
    read -r ctid name ip ram _ <<< "$entry"
    if pct status "$ctid" &>/dev/null; then
      state=$(pct status "$ctid" | awk '{print $2}')
    else
      state="absent"
    fi
    printf "%-5s %-15s %-15s %-9s %sMB\n" "$ctid" "$name" "${ip%%/*}" "$state" "$ram"
  done

  echo ""
  echo "MikroTik CHR gateway: $MIKROTIK_GW"

  # Quick reachability check
  if ping -c1 -W2 "$MIKROTIK_GW" &>/dev/null; then
    echo "Gateway status: reachable"
  else
    echo "Gateway status: UNREACHABLE (check MikroTik CHR)"
  fi
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
case "${1:-create}" in
  create)  create_containers ;;
  destroy) destroy_containers ;;
  status)  status_containers ;;
  *)
    echo "Usage: $0 [create|destroy|status]"
    echo ""
    echo "  create   — Create and start test LXC containers (default)"
    echo "  destroy  — Stop and remove all test containers"
    echo "  status   — Show container status"
    exit 1
    ;;
esac
