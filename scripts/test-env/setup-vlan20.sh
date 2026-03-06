#!/usr/bin/env bash
#
# setup-vlan20.sh — Create VLAN 20 on MikroTik CHR for integration testing
#
# Creates VLAN 20 on the MikroTik CHR router via Panoptikon API (M-81),
# then configures the DHCP pool/server directly via MikroTik REST API.
#
# This sets up:
#   - VLAN 20 interface on MikroTik (via Panoptikon API)
#   - IP address 10.20.0.1/24 on VLAN 20 interface
#   - DHCP pool 10.20.0.100–10.20.0.200
#   - DHCP server for VLAN 20
#   - DHCP network config (gateway + DNS)
#
# Prerequisites:
#   - Panoptikon running at PANOPTIKON_URL (default: http://10.10.0.22:8080)
#   - MikroTik CHR at MIKROTIK_IP (default: 10.10.0.125)
#   - MikroTik REST API enabled with credentials
#   - curl and jq installed
#
# Usage:
#   bash scripts/test-env/setup-vlan20.sh
#
# Environment variables:
#   PANOPTIKON_URL  — Panoptikon base URL      (default: http://10.10.0.22:8080)
#   PANOPTIKON_PASS — Panoptikon login password (default: from env or prompt)
#   MIKROTIK_IP     — MikroTik CHR IP           (default: 10.10.0.125)
#   MIKROTIK_USER   — MikroTik API user         (default: admin)
#   MIKROTIK_PASS   — MikroTik API password     (default: from env or prompt)
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
DNS_SERVER="${DNS_SERVER:-10.10.0.22}"

VLAN_ID=20
VLAN_NAME="vlan20-test"
VLAN_INTERFACE="bridge-test"
VLAN_SUBNET="10.20.0.0/24"
VLAN_GATEWAY="10.20.0.1"
VLAN_IP="${VLAN_GATEWAY}/24"
DHCP_POOL_NAME="vlan20-pool"
DHCP_POOL_RANGE="10.20.0.100-10.20.0.200"
DHCP_SERVER_NAME="vlan20-dhcp"

COOKIE_JAR=$(mktemp /tmp/pan-cookies-XXXXXX)
trap 'rm -f "$COOKIE_JAR"' EXIT

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
log()  { printf '\033[1;32m[vlan20]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[vlan20]\033[0m %s\n' "$*"; }
err()  { printf '\033[1;31m[vlan20]\033[0m %s\n' "$*" >&2; }
die()  { err "$*"; exit 1; }

# MikroTik REST API helper (direct, bypassing Panoptikon)
mt_api() {
  local method="$1" path="$2"
  shift 2
  curl -sk -u "${MIKROTIK_USER}:${MIKROTIK_PASS}" \
    -X "$method" \
    "https://${MIKROTIK_IP}/rest${path}" \
    -H 'Content-Type: application/json' \
    "$@" 2>/dev/null
}

# Panoptikon API helper (authenticated)
pan_api() {
  local method="$1" path="$2"
  shift 2
  curl -s -b "$COOKIE_JAR" -c "$COOKIE_JAR" \
    -X "$method" \
    "${PANOPTIKON_URL}${path}" \
    -H 'Content-Type: application/json' \
    "$@" 2>/dev/null
}

# ---------------------------------------------------------------------------
# Preflight checks
# ---------------------------------------------------------------------------
preflight() {
  command -v curl >/dev/null 2>&1 || die "curl is required but not installed"
  command -v jq  >/dev/null 2>&1 || die "jq is required but not installed"

  log "Checking MikroTik CHR connectivity..."
  if ! curl -sk -o /dev/null -w "%{http_code}" \
    -u "${MIKROTIK_USER}:${MIKROTIK_PASS}" \
    "https://${MIKROTIK_IP}/rest/system/resource" | grep -q "200"; then
    die "Cannot reach MikroTik REST API at https://${MIKROTIK_IP}"
  fi
  log "MikroTik CHR reachable at ${MIKROTIK_IP}"

  log "Checking Panoptikon connectivity..."
  if ! curl -s -o /dev/null -w "%{http_code}" \
    "${PANOPTIKON_URL}/api/v1/auth/check" | grep -qE "200|401"; then
    die "Cannot reach Panoptikon at ${PANOPTIKON_URL}"
  fi
  log "Panoptikon reachable at ${PANOPTIKON_URL}"
}

# ---------------------------------------------------------------------------
# Panoptikon login
# ---------------------------------------------------------------------------
pan_login() {
  if [ -z "$PANOPTIKON_PASS" ]; then
    die "PANOPTIKON_PASS environment variable is required"
  fi

  log "Logging into Panoptikon..."
  local status
  status=$(curl -s -o /dev/null -w "%{http_code}" \
    -c "$COOKIE_JAR" -b "$COOKIE_JAR" \
    -X POST "${PANOPTIKON_URL}/api/v1/auth/login" \
    -H 'Content-Type: application/json' \
    -d "{\"password\":\"${PANOPTIKON_PASS}\"}")

  if [ "$status" != "200" ]; then
    die "Panoptikon login failed (HTTP $status)"
  fi
  log "Panoptikon login successful"
}

# ---------------------------------------------------------------------------
# Step 1: Create VLAN 20 via Panoptikon API (test M-81)
# ---------------------------------------------------------------------------
create_vlan() {
  log "Step 1: Creating VLAN ${VLAN_ID} via Panoptikon API (M-81)..."

  # Check if VLAN already exists
  local existing
  existing=$(pan_api GET "/api/v1/mikrotik/vlans")
  if echo "$existing" | jq -e ".[] | select(.vlan_id == \"${VLAN_ID}\")" >/dev/null 2>&1; then
    warn "VLAN ${VLAN_ID} already exists on MikroTik — skipping creation"
    return 0
  fi

  local status
  status=$(pan_api POST "/api/v1/mikrotik/vlans" \
    -w "%{http_code}" -o /dev/null \
    -d "{
      \"name\": \"${VLAN_NAME}\",
      \"vlan_id\": ${VLAN_ID},
      \"interface\": \"${VLAN_INTERFACE}\"
    }")

  if [ "$status" = "200" ] || [ "$status" = "201" ] || [ "$status" = "204" ]; then
    log "VLAN ${VLAN_ID} (${VLAN_NAME}) created successfully via Panoptikon"
  else
    die "Failed to create VLAN ${VLAN_ID} via Panoptikon API (HTTP $status)"
  fi
}

# ---------------------------------------------------------------------------
# Step 2: Assign IP address to VLAN interface
# ---------------------------------------------------------------------------
assign_ip() {
  log "Step 2: Assigning IP ${VLAN_IP} to ${VLAN_NAME}..."

  # Check if IP already assigned
  local existing
  existing=$(mt_api GET "/ip/address")
  if echo "$existing" | jq -e ".[] | select(.interface == \"${VLAN_NAME}\")" >/dev/null 2>&1; then
    warn "IP address already assigned to ${VLAN_NAME} — skipping"
    return 0
  fi

  local status
  status=$(mt_api PUT "/ip/address" \
    -w "%{http_code}" -o /dev/null \
    -d "{
      \"address\": \"${VLAN_IP}\",
      \"interface\": \"${VLAN_NAME}\"
    }")

  if echo "$status" | grep -qE "200|201"; then
    log "IP ${VLAN_IP} assigned to ${VLAN_NAME}"
  else
    die "Failed to assign IP to ${VLAN_NAME} (HTTP $status)"
  fi
}

# ---------------------------------------------------------------------------
# Step 3: Create DHCP pool
# ---------------------------------------------------------------------------
create_dhcp_pool() {
  log "Step 3: Creating DHCP pool ${DHCP_POOL_NAME} (${DHCP_POOL_RANGE})..."

  # Check if pool already exists
  local existing
  existing=$(mt_api GET "/ip/pool")
  if echo "$existing" | jq -e ".[] | select(.name == \"${DHCP_POOL_NAME}\")" >/dev/null 2>&1; then
    warn "DHCP pool ${DHCP_POOL_NAME} already exists — skipping"
    return 0
  fi

  local status
  status=$(mt_api PUT "/ip/pool" \
    -w "%{http_code}" -o /dev/null \
    -d "{
      \"name\": \"${DHCP_POOL_NAME}\",
      \"ranges\": \"${DHCP_POOL_RANGE}\"
    }")

  if echo "$status" | grep -qE "200|201"; then
    log "DHCP pool ${DHCP_POOL_NAME} created (${DHCP_POOL_RANGE})"
  else
    die "Failed to create DHCP pool (HTTP $status)"
  fi
}

# ---------------------------------------------------------------------------
# Step 4: Create DHCP server for VLAN 20
# ---------------------------------------------------------------------------
create_dhcp_server() {
  log "Step 4: Creating DHCP server ${DHCP_SERVER_NAME} on ${VLAN_NAME}..."

  # Check if server already exists
  local existing
  existing=$(mt_api GET "/ip/dhcp-server")
  if echo "$existing" | jq -e ".[] | select(.name == \"${DHCP_SERVER_NAME}\")" >/dev/null 2>&1; then
    warn "DHCP server ${DHCP_SERVER_NAME} already exists — skipping"
    return 0
  fi

  local status
  status=$(mt_api PUT "/ip/dhcp-server" \
    -w "%{http_code}" -o /dev/null \
    -d "{
      \"name\": \"${DHCP_SERVER_NAME}\",
      \"interface\": \"${VLAN_NAME}\",
      \"address-pool\": \"${DHCP_POOL_NAME}\",
      \"disabled\": \"false\"
    }")

  if echo "$status" | grep -qE "200|201"; then
    log "DHCP server ${DHCP_SERVER_NAME} created on ${VLAN_NAME}"
  else
    die "Failed to create DHCP server (HTTP $status)"
  fi
}

# ---------------------------------------------------------------------------
# Step 5: Create DHCP network config
# ---------------------------------------------------------------------------
create_dhcp_network() {
  log "Step 5: Creating DHCP network config for ${VLAN_SUBNET}..."

  # Check if network config already exists
  local existing
  existing=$(mt_api GET "/ip/dhcp-server/network")
  if echo "$existing" | jq -e ".[] | select(.address == \"${VLAN_SUBNET}\")" >/dev/null 2>&1; then
    warn "DHCP network config for ${VLAN_SUBNET} already exists — skipping"
    return 0
  fi

  local status
  status=$(mt_api PUT "/ip/dhcp-server/network" \
    -w "%{http_code}" -o /dev/null \
    -d "{
      \"address\": \"${VLAN_SUBNET}\",
      \"gateway\": \"${VLAN_GATEWAY}\",
      \"dns-server\": \"${DNS_SERVER}\"
    }")

  if echo "$status" | grep -qE "200|201"; then
    log "DHCP network config created: ${VLAN_SUBNET} gw=${VLAN_GATEWAY} dns=${DNS_SERVER}"
  else
    die "Failed to create DHCP network config (HTTP $status)"
  fi
}

# ---------------------------------------------------------------------------
# Verify setup
# ---------------------------------------------------------------------------
verify() {
  log ""
  log "=== VLAN 20 Setup Summary ==="
  log ""

  # Verify VLAN via Panoptikon API
  local vlans
  vlans=$(pan_api GET "/api/v1/mikrotik/vlans")
  if echo "$vlans" | jq -e ".[] | select(.vlan_id == \"${VLAN_ID}\")" >/dev/null 2>&1; then
    log "✓ VLAN ${VLAN_ID} (${VLAN_NAME}) exists on MikroTik"
  else
    err "✗ VLAN ${VLAN_ID} not found via Panoptikon API"
  fi

  # Verify IP address
  local addrs
  addrs=$(mt_api GET "/ip/address")
  if echo "$addrs" | jq -e ".[] | select(.interface == \"${VLAN_NAME}\")" >/dev/null 2>&1; then
    local ip
    ip=$(echo "$addrs" | jq -r ".[] | select(.interface == \"${VLAN_NAME}\") | .address")
    log "✓ IP address ${ip} assigned to ${VLAN_NAME}"
  else
    err "✗ No IP address on ${VLAN_NAME}"
  fi

  # Verify DHCP pool
  local pools
  pools=$(mt_api GET "/ip/pool")
  if echo "$pools" | jq -e ".[] | select(.name == \"${DHCP_POOL_NAME}\")" >/dev/null 2>&1; then
    log "✓ DHCP pool ${DHCP_POOL_NAME} exists (${DHCP_POOL_RANGE})"
  else
    err "✗ DHCP pool ${DHCP_POOL_NAME} not found"
  fi

  # Verify DHCP server
  local servers
  servers=$(mt_api GET "/ip/dhcp-server")
  if echo "$servers" | jq -e ".[] | select(.name == \"${DHCP_SERVER_NAME}\")" >/dev/null 2>&1; then
    log "✓ DHCP server ${DHCP_SERVER_NAME} running on ${VLAN_NAME}"
  else
    err "✗ DHCP server ${DHCP_SERVER_NAME} not found"
  fi

  log ""
  log "VLAN 20 is ready for LXC containers."
  log "Next: run setup-vlan20-lxc.sh on the Proxmox host to create test containers."
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
main() {
  log "Setting up VLAN ${VLAN_ID} test environment"
  log "  MikroTik CHR:  ${MIKROTIK_IP}"
  log "  Panoptikon:    ${PANOPTIKON_URL}"
  log "  VLAN subnet:   ${VLAN_SUBNET}"
  log "  DHCP range:    ${DHCP_POOL_RANGE}"
  log ""

  preflight
  pan_login
  create_vlan
  assign_ip
  create_dhcp_pool
  create_dhcp_server
  create_dhcp_network
  verify
}

main "$@"
