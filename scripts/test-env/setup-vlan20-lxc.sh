#!/usr/bin/env bash
#
# setup-vlan20-lxc.sh — Create LXC test containers on VLAN 20
# This is current MikroTik Controller test infrastructure, not the planned
# isolated Proxmox Gateway fabric.
#
# Run this script ON the Proxmox host (10.10.0.11) as root.
# Creates 2 lightweight containers that act as DHCP clients on VLAN 20,
# visible to MikroTik and Panoptikon for VLAN integration testing.
#
# Prerequisites:
#   - Run on a Proxmox host (or via SSH to one)
#   - MikroTik CHR VLAN 20 already configured (run setup-vlan20.sh first)
#   - pveam templates available (Debian 12, Alpine preferred)
#   - Bridge vmbr0 exists and connects to MikroTik CHR
#
# Usage:
#   scp scripts/test-env/setup-vlan20-lxc.sh root@10.10.0.11:/tmp/
#   ssh root@10.10.0.11 bash /tmp/setup-vlan20-lxc.sh
#
set -euo pipefail

# ── Configuration ────────────────────────────────────────────────────────────
BRIDGE="vmbr0"
VLAN_TAG=20
STORAGE="local-lvm"
MIKROTIK_GW="10.20.0.1"

# Container definitions: CT_ID|OS_TEMPLATE|HOSTNAME|MEMORY_MB|PURPOSE
CONTAINERS=(
  "204|debian-12|test-vlan20-a|256|VLAN 20 client — Debian, DHCP discovery"
  "205|alpine|test-vlan20-b|128|VLAN 20 client — Alpine, minimal footprint"
)

# ── Helpers ──────────────────────────────────────────────────────────────────
log() { printf '\033[1;32m[vlan20-lxc]\033[0m %s\n' "$*"; }
err() { printf '\033[1;31m[vlan20-lxc]\033[0m %s\n' "$*" >&2; }

template_for() {
  local os="$1"
  local tpl

  case "$os" in
    alpine)
      tpl=$(pveam list "$STORAGE" 2>/dev/null | awk '/alpine/ {print $1}' | sort -V | tail -1) ;;
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
log "Setting up VLAN 20 LXC test containers"
log "  Bridge: ${BRIDGE}, VLAN tag: ${VLAN_TAG}"
log "  Gateway: ${MIKROTIK_GW} (MikroTik CHR VLAN 20)"
log ""

command -v pct >/dev/null 2>&1 || { err "pct not found — run this on a Proxmox host"; exit 1; }
[[ $(id -u) -eq 0 ]] || { err "Must run as root (sudo)"; exit 1; }

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

  # VLAN tagging: bridge with tag=20 ensures all container traffic is 802.1Q tagged
  pct create "$ct_id" "$tpl" \
    --hostname "$hostname" \
    --memory "$mem_mb" \
    --swap 0 \
    --cores 1 \
    --rootfs "${STORAGE}:2" \
    --net0 "name=eth0,bridge=${BRIDGE},tag=${VLAN_TAG},ip=dhcp" \
    --unprivileged 1 \
    --start 0 \
    --onboot 1 \
    --password "panoptikon-test"

  log "Starting CT $ct_id..."
  pct start "$ct_id"

  # Wait for container to boot and get a DHCP lease from VLAN 20
  log "Waiting for CT $ct_id to get a DHCP lease on VLAN ${VLAN_TAG}..."
  local got_ip=""
  for i in $(seq 1 30); do
    ip=$(pct exec "$ct_id" -- sh -c "ip -4 addr show eth0 2>/dev/null | grep -oP 'inet \K[0-9.]+'") || true
    if [ -n "$ip" ] && [ "$ip" != "127.0.0.1" ]; then
      log "CT $ct_id ($hostname) got IP: $ip"
      got_ip="$ip"
      break
    fi
    sleep 2
  done

  if [ -z "$got_ip" ]; then
    err "CT $ct_id ($hostname) did not get a DHCP lease within 60s"
    err "Check: MikroTik VLAN 20 DHCP server, bridge connectivity, VLAN tagging"
  fi

  # ── Per-OS post-setup ────────────────────────────────────────────────────
  case "$os" in
    alpine)
      log "CT $ct_id: Installing basic tools on Alpine..."
      pct exec "$ct_id" -- sh -c "
        apk update && apk add --no-cache curl iputils-ping
      " || log "CT $ct_id: package install had warnings (may be normal for Alpine)"
      ;;

    debian-12)
      log "CT $ct_id: Installing basic tools on Debian..."
      pct exec "$ct_id" -- bash -c "
        export DEBIAN_FRONTEND=noninteractive
        apt-get update -qq
        apt-get install -y -qq curl iputils-ping net-tools dnsutils >/dev/null
      " || log "CT $ct_id: package install had warnings"
      ;;
  esac

  log "CT $ct_id ($hostname) ready"
done

log ""
log "VLAN 20 test containers ready. Summary:"
log "──────────────────────────────────────────"
for entry in "${CONTAINERS[@]}"; do
  IFS='|' read -r ct_id os hostname mem_mb purpose <<< "$entry"
  ip=""
  status="absent"
  if pct status "$ct_id" &>/dev/null; then
    ip=$(pct exec "$ct_id" -- sh -c "ip -4 addr show eth0 2>/dev/null | grep -oP 'inet \K[0-9.]+'") || ip="(no IP yet)"
    status=$(pct status "$ct_id" 2>/dev/null | awk '{print $2}')
  fi
  printf '  CT %-4s  %-16s  %-16s  %s  VLAN %s  (%s)\n' \
    "$ct_id" "$hostname" "$ip" "$status" "$VLAN_TAG" "$purpose"
done
log ""
log "Next steps:"
log "  1. Verify containers appear in MikroTik VLAN 20 DHCP leases"
log "  2. Check Panoptikon Devices page for the new VLAN 20 devices"
log "  3. Run: bash /tmp/verify-vlan20.sh  (to verify VLAN integration)"
