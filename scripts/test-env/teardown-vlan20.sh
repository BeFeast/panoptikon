#!/usr/bin/env bash
#
# teardown-vlan20.sh — Remove VLAN 20 test environment
#
# Destroys LXC containers on VLAN 20 and removes the VLAN configuration
# from MikroTik CHR.
#
# Usage:
#   # Destroy containers (run on Proxmox host):
#   ssh root@10.10.0.11 bash /tmp/teardown-vlan20.sh --lxc
#
#   # Destroy everything (VLAN + DHCP + containers):
#   bash scripts/test-env/teardown-vlan20.sh --all
#
#   # Remove only MikroTik VLAN config (run from anywhere):
#   bash scripts/test-env/teardown-vlan20.sh --mikrotik
#
# Environment variables:
#   PANOPTIKON_URL  — Panoptikon base URL      (default: http://10.10.0.22:8080)
#   PANOPTIKON_PASS — Panoptikon login password (required for --mikrotik/--all)
#   MIKROTIK_IP     — MikroTik CHR IP           (default: 10.10.0.125)
#   MIKROTIK_USER   — MikroTik API user         (default: admin)
#   MIKROTIK_PASS   — MikroTik API password     (required for --mikrotik/--all)
#
set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
PANOPTIKON_URL="${PANOPTIKON_URL:-http://10.10.0.22:8080}"
PANOPTIKON_PASS="${PANOPTIKON_PASS:-}"
MIKROTIK_IP="${MIKROTIK_IP:-10.10.0.125}"
MIKROTIK_USER="${MIKROTIK_USER:-admin}"
MIKROTIK_PASS="${MIKROTIK_PASS:-}"

VLAN_ID=20
VLAN_NAME="vlan20-test"
DHCP_POOL_NAME="vlan20-pool"
DHCP_SERVER_NAME="vlan20-dhcp"
VLAN_SUBNET="10.20.0.0/24"
CONTAINER_IDS=(204 205)

COOKIE_JAR=$(mktemp /tmp/pan-cookies-XXXXXX)
trap 'rm -f "$COOKIE_JAR"' EXIT

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
log() { printf '\033[1;32m[teardown]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[teardown]\033[0m %s\n' "$*"; }
err() { printf '\033[1;31m[teardown]\033[0m %s\n' "$*" >&2; }

mt_api() {
  local method="$1" path="$2"
  shift 2
  curl -sk -u "${MIKROTIK_USER}:${MIKROTIK_PASS}" \
    -X "$method" \
    "https://${MIKROTIK_IP}/rest${path}" \
    -H 'Content-Type: application/json' \
    "$@" 2>/dev/null
}

pan_login() {
  if [ -z "$PANOPTIKON_PASS" ]; then
    return 1
  fi
  local status
  status=$(curl -s -o /dev/null -w "%{http_code}" \
    -c "$COOKIE_JAR" -b "$COOKIE_JAR" \
    -X POST "${PANOPTIKON_URL}/api/v1/auth/login" \
    -H 'Content-Type: application/json' \
    -d "{\"password\":\"${PANOPTIKON_PASS}\"}")
  [ "$status" = "200" ]
}

# ---------------------------------------------------------------------------
# Tear down LXC containers
# ---------------------------------------------------------------------------
teardown_lxc() {
  log "Tearing down VLAN 20 LXC containers"

  if ! command -v pct >/dev/null 2>&1; then
    err "pct not found — run this on a Proxmox host"
    return 1
  fi

  for ct_id in "${CONTAINER_IDS[@]}"; do
    if ! pct status "$ct_id" &>/dev/null; then
      log "CT $ct_id does not exist, skipping"
      continue
    fi

    local hostname
    hostname=$(pct config "$ct_id" | grep hostname | awk '{print $2}')

    if pct status "$ct_id" | grep -q running; then
      log "Stopping CT $ct_id ($hostname)..."
      pct stop "$ct_id"
    fi

    log "Destroying CT $ct_id ($hostname)..."
    pct destroy "$ct_id" --purge

    log "CT $ct_id removed"
  done

  log "LXC containers teardown complete"
}

# ---------------------------------------------------------------------------
# Tear down MikroTik VLAN config
# ---------------------------------------------------------------------------
teardown_mikrotik() {
  log "Tearing down VLAN 20 MikroTik configuration"

  if [ -z "$MIKROTIK_PASS" ]; then
    err "MIKROTIK_PASS is required for MikroTik teardown"
    return 1
  fi

  # Remove DHCP network
  log "Removing DHCP network for ${VLAN_SUBNET}..."
  local networks net_id
  networks=$(mt_api GET "/ip/dhcp-server/network")
  net_id=$(echo "$networks" | jq -r ".[] | select(.address == \"${VLAN_SUBNET}\") | .\".id\"" 2>/dev/null)
  if [ -n "$net_id" ] && [ "$net_id" != "null" ]; then
    mt_api DELETE "/ip/dhcp-server/network/${net_id}" >/dev/null
    log "  Removed DHCP network ${VLAN_SUBNET}"
  else
    log "  DHCP network ${VLAN_SUBNET} not found — already removed"
  fi

  # Remove DHCP server
  log "Removing DHCP server ${DHCP_SERVER_NAME}..."
  local servers srv_id
  servers=$(mt_api GET "/ip/dhcp-server")
  srv_id=$(echo "$servers" | jq -r ".[] | select(.name == \"${DHCP_SERVER_NAME}\") | .\".id\"" 2>/dev/null)
  if [ -n "$srv_id" ] && [ "$srv_id" != "null" ]; then
    mt_api DELETE "/ip/dhcp-server/${srv_id}" >/dev/null
    log "  Removed DHCP server ${DHCP_SERVER_NAME}"
  else
    log "  DHCP server ${DHCP_SERVER_NAME} not found — already removed"
  fi

  # Remove DHCP pool
  log "Removing DHCP pool ${DHCP_POOL_NAME}..."
  local pools pool_id
  pools=$(mt_api GET "/ip/pool")
  pool_id=$(echo "$pools" | jq -r ".[] | select(.name == \"${DHCP_POOL_NAME}\") | .\".id\"" 2>/dev/null)
  if [ -n "$pool_id" ] && [ "$pool_id" != "null" ]; then
    mt_api DELETE "/ip/pool/${pool_id}" >/dev/null
    log "  Removed DHCP pool ${DHCP_POOL_NAME}"
  else
    log "  DHCP pool ${DHCP_POOL_NAME} not found — already removed"
  fi

  # Remove IP address from VLAN interface
  log "Removing IP address from ${VLAN_NAME}..."
  local addrs addr_id
  addrs=$(mt_api GET "/ip/address")
  addr_id=$(echo "$addrs" | jq -r ".[] | select(.interface == \"${VLAN_NAME}\") | .\".id\"" 2>/dev/null)
  if [ -n "$addr_id" ] && [ "$addr_id" != "null" ]; then
    mt_api DELETE "/ip/address/${addr_id}" >/dev/null
    log "  Removed IP address from ${VLAN_NAME}"
  else
    log "  No IP address on ${VLAN_NAME} — already removed"
  fi

  # Remove VLAN interface via Panoptikon API
  log "Removing VLAN ${VLAN_ID} via Panoptikon API..."
  if pan_login; then
    local vlans vlan_ros_id
    vlans=$(curl -s -b "$COOKIE_JAR" "${PANOPTIKON_URL}/api/v1/mikrotik/vlans")
    vlan_ros_id=$(echo "$vlans" | jq -r ".[] | select(.vlan_id == \"${VLAN_ID}\") | .id" 2>/dev/null)

    if [ -n "$vlan_ros_id" ] && [ "$vlan_ros_id" != "null" ]; then
      local status
      status=$(curl -s -o /dev/null -w "%{http_code}" \
        -b "$COOKIE_JAR" \
        -X DELETE "${PANOPTIKON_URL}/api/v1/mikrotik/vlans/${vlan_ros_id}")
      if [ "$status" = "200" ] || [ "$status" = "204" ]; then
        log "  Removed VLAN ${VLAN_ID} via Panoptikon API"
      else
        warn "  Panoptikon VLAN delete returned HTTP $status, trying direct API..."
      fi
    else
      log "  VLAN ${VLAN_ID} not found via Panoptikon — trying direct API"
    fi
  fi

  # Fallback: remove VLAN via MikroTik REST API directly
  local vlans vlan_id_ros
  vlans=$(mt_api GET "/interface/vlan")
  vlan_id_ros=$(echo "$vlans" | jq -r ".[] | select(.name == \"${VLAN_NAME}\") | .\".id\"" 2>/dev/null)
  if [ -n "$vlan_id_ros" ] && [ "$vlan_id_ros" != "null" ]; then
    mt_api DELETE "/interface/vlan/${vlan_id_ros}" >/dev/null
    log "  Removed VLAN interface ${VLAN_NAME} via MikroTik API"
  fi

  log "MikroTik teardown complete"
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
usage() {
  echo "Usage: $0 [--lxc|--mikrotik|--all]"
  echo ""
  echo "  --lxc       Destroy LXC containers only (run on Proxmox host)"
  echo "  --mikrotik  Remove MikroTik VLAN/DHCP config only"
  echo "  --all       Destroy everything (default)"
  exit 1
}

case "${1:---all}" in
  --lxc)
    teardown_lxc
    ;;
  --mikrotik)
    teardown_mikrotik
    ;;
  --all)
    if command -v pct >/dev/null 2>&1; then
      teardown_lxc
    else
      warn "Not on Proxmox host — skipping LXC teardown"
      warn "Run 'ssh root@10.10.0.11 bash /tmp/teardown-vlan20.sh --lxc' separately"
    fi
    teardown_mikrotik
    ;;
  *)
    usage
    ;;
esac

log ""
log "VLAN 20 teardown complete"
