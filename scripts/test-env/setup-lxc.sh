#!/usr/bin/env bash
#
# setup-lxc.sh — Create LXC test containers on Proxmox DevBox
# This is current MikroTik Controller test infrastructure, not the planned
# isolated Proxmox Gateway fabric.
#
# Run this script ON the Proxmox host (10.10.0.11) as root.
# It creates 3 lightweight containers that act as real DHCP clients
# on vmbr0, visible to MikroTik and Panoptikon for device discovery testing.
#
# Usage:
#   scp scripts/test-env/setup-lxc.sh root@10.10.0.11:/tmp/
#   ssh root@10.10.0.11 bash /tmp/setup-lxc.sh
#
set -euo pipefail

# ── Configuration ────────────────────────────────────────────────────────────
BRIDGE="vmbr0"
STORAGE="local-lvm"

# Container definitions: CT_ID|OS_TEMPLATE|HOSTNAME|MEMORY_MB|PURPOSE
CONTAINERS=(
  "201|alpine|test-alpine|128|minimal Linux test device"
  "202|ubuntu-22.04|test-ubuntu|512|mDNS via avahi-daemon"
  "203|debian-12|test-debian|512|different vendor fingerprint"
)

# ── Helpers ──────────────────────────────────────────────────────────────────
log() { printf '\033[1;32m[test-env]\033[0m %s\n' "$*"; }
err() { printf '\033[1;31m[test-env]\033[0m %s\n' "$*" >&2; }

template_for() {
  local os="$1"
  # Find the most recent matching template already downloaded
  local tpl
  case "$os" in
    alpine)
      tpl=$(pveam list "$STORAGE" 2>/dev/null | awk '/alpine/ {print $1}' | sort -V | tail -1) ;;
    ubuntu-22.04)
      tpl=$(pveam list "$STORAGE" 2>/dev/null | awk '/ubuntu-22.04/ {print $1}' | sort -V | tail -1) ;;
    debian-12)
      tpl=$(pveam list "$STORAGE" 2>/dev/null | awk '/debian-12/ {print $1}' | sort -V | tail -1) ;;
    *)
      err "Unknown OS: $os"; return 1 ;;
  esac

  if [ -z "$tpl" ]; then
    log "Template for $os not found locally, downloading..."
    pveam update
    case "$os" in
      alpine)
        tpl=$(pveam available --section system | awk '/alpine/ {print $2}' | sort -V | tail -1) ;;
      ubuntu-22.04)
        tpl=$(pveam available --section system | awk '/ubuntu-22.04/ {print $2}' | sort -V | tail -1) ;;
      debian-12)
        tpl=$(pveam available --section system | awk '/debian-12/ {print $2}' | sort -V | tail -1) ;;
    esac
    [ -z "$tpl" ] && { err "No template available for $os"; return 1; }
    pveam download "$STORAGE" "$tpl"
    tpl="${STORAGE}:vztmpl/${tpl}"
  fi

  echo "$tpl"
}

# ── Main ─────────────────────────────────────────────────────────────────────
log "Setting up Panoptikon LXC test environment"

for entry in "${CONTAINERS[@]}"; do
  IFS='|' read -r ct_id os hostname mem_mb purpose <<< "$entry"

  if pct status "$ct_id" &>/dev/null; then
    log "CT $ct_id ($hostname) already exists, skipping creation"
    # Ensure it's running
    if ! pct status "$ct_id" | grep -q running; then
      pct start "$ct_id"
      log "CT $ct_id started"
    fi
    continue
  fi

  log "Creating CT $ct_id: $hostname ($os, ${mem_mb}MB) — $purpose"

  tpl=$(template_for "$os")

  pct create "$ct_id" "$tpl" \
    --hostname "$hostname" \
    --memory "$mem_mb" \
    --swap 0 \
    --cores 1 \
    --rootfs "${STORAGE}:2" \
    --net0 "name=eth0,bridge=${BRIDGE},ip=dhcp" \
    --unprivileged 1 \
    --start 0 \
    --onboot 1 \
    --password "panoptikon-test"

  log "Starting CT $ct_id..."
  pct start "$ct_id"

  # Wait for container to boot and get an IP
  log "Waiting for CT $ct_id to get a DHCP lease..."
  for i in $(seq 1 30); do
    ip=$(pct exec "$ct_id" -- sh -c "ip -4 addr show eth0 2>/dev/null | grep -oP 'inet \K[0-9.]+'") || true
    if [ -n "$ip" ] && [ "$ip" != "127.0.0.1" ]; then
      log "CT $ct_id ($hostname) got IP: $ip"
      break
    fi
    sleep 2
  done

  # ── Per-OS post-setup ────────────────────────────────────────────────────
  case "$os" in
    alpine)
      log "CT $ct_id: Installing avahi on Alpine..."
      pct exec "$ct_id" -- sh -c "
        apk update && apk add --no-cache avahi dbus
        rc-update add dbus default
        rc-update add avahi-daemon default
        rc-service dbus start
        rc-service avahi-daemon start
      " || log "CT $ct_id: avahi setup had warnings (may be normal for Alpine)"
      ;;

    ubuntu-22.04)
      log "CT $ct_id: Installing avahi on Ubuntu..."
      pct exec "$ct_id" -- bash -c "
        export DEBIAN_FRONTEND=noninteractive
        apt-get update -qq
        apt-get install -y -qq avahi-daemon avahi-utils >/dev/null
        systemctl enable avahi-daemon
        systemctl start avahi-daemon
      "
      ;;

    debian-12)
      log "CT $ct_id: Installing avahi on Debian..."
      pct exec "$ct_id" -- bash -c "
        export DEBIAN_FRONTEND=noninteractive
        apt-get update -qq
        apt-get install -y -qq avahi-daemon avahi-utils >/dev/null
        systemctl enable avahi-daemon
        systemctl start avahi-daemon
      "
      ;;
  esac

  log "CT $ct_id ($hostname) ready"
done

log ""
log "Test environment ready. Container summary:"
log "──────────────────────────────────────────"
for entry in "${CONTAINERS[@]}"; do
  IFS='|' read -r ct_id os hostname mem_mb purpose <<< "$entry"
  ip=$(pct exec "$ct_id" -- sh -c "ip -4 addr show eth0 2>/dev/null | grep -oP 'inet \K[0-9.]+'") || ip="(no IP yet)"
  status=$(pct status "$ct_id" 2>/dev/null | awk '{print $2}')
  printf '  CT %-4s  %-14s  %-16s  %s  %s\n' "$ct_id" "$hostname" "$ip" "$status" "($purpose)"
done
log ""
log "Next steps:"
log "  1. Verify containers appear in MikroTik DHCP leases"
log "  2. Check Panoptikon Devices page for the 3 new devices"
log "  3. Run: bash /tmp/verify-lxc.sh  (to verify mDNS and DHCP)"
