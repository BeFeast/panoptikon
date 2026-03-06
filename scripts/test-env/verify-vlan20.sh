#!/usr/bin/env bash
#
# verify-vlan20.sh — Verify VLAN 20 test environment and run API integration tests
#
# Validates:
#   - VLAN 20 exists on MikroTik (via Panoptikon API)
#   - DHCP pool/server are configured
#   - LXC containers on VLAN 20 have DHCP leases
#   - Containers appear in Panoptikon device list
#   - VLAN update (rename) works via API (M-82)
#   - VLAN delete + recreate works via API (M-83)
#
# Can be run from any machine with curl/jq access to Panoptikon and MikroTik.
# For container-level checks, run on the Proxmox host.
#
# Usage:
#   bash scripts/test-env/verify-vlan20.sh
#   # or on Proxmox host:
#   bash /tmp/verify-vlan20.sh
#
# Environment variables:
#   PANOPTIKON_URL  — Panoptikon base URL      (default: http://10.10.0.22:8080)
#   PANOPTIKON_PASS — Panoptikon login password (required)
#   MIKROTIK_IP     — MikroTik CHR IP           (default: 10.10.0.125)
#   MIKROTIK_USER   — MikroTik API user         (default: admin)
#   MIKROTIK_PASS   — MikroTik API password     (required for direct API checks)
#   SKIP_LXC_CHECKS — set to "1" to skip Proxmox container checks (default: auto-detect)
#   SKIP_API_TESTS  — set to "1" to skip M-82/M-83 destructive API tests (default: 0)
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
SKIP_LXC_CHECKS="${SKIP_LXC_CHECKS:-}"
SKIP_API_TESTS="${SKIP_API_TESTS:-0}"

VLAN_ID=20
VLAN_NAME="vlan20-test"
VLAN_INTERFACE="bridge-test"
DHCP_POOL_NAME="vlan20-pool"
DHCP_SERVER_NAME="vlan20-dhcp"
CONTAINER_IDS=(204 205)

COOKIE_JAR=$(mktemp /tmp/pan-cookies-XXXXXX)
trap 'rm -f "$COOKIE_JAR"' EXIT

FAILURES=0
PASSES=0

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
log()  { printf '\033[1;32m[verify]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[verify]\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31m[FAIL]\033[0m  %s\n' "$*"; FAILURES=$((FAILURES + 1)); }
pass() { printf '\033[1;32m[OK]\033[0m    %s\n' "$*"; PASSES=$((PASSES + 1)); }

mt_api() {
  local method="$1" path="$2"
  shift 2
  curl -sk -u "${MIKROTIK_USER}:${MIKROTIK_PASS}" \
    -X "$method" \
    "https://${MIKROTIK_IP}/rest${path}" \
    -H 'Content-Type: application/json' \
    "$@" 2>/dev/null
}

pan_api() {
  local method="$1" path="$2"
  shift 2
  curl -s -b "$COOKIE_JAR" -c "$COOKIE_JAR" \
    -X "$method" \
    "${PANOPTIKON_URL}${path}" \
    -H 'Content-Type: application/json' \
    "$@" 2>/dev/null
}

pan_login() {
  if [ -z "$PANOPTIKON_PASS" ]; then
    warn "PANOPTIKON_PASS not set — skipping Panoptikon API checks"
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

has_pct() {
  if [ -n "$SKIP_LXC_CHECKS" ] && [ "$SKIP_LXC_CHECKS" = "1" ]; then
    return 1
  fi
  command -v pct >/dev/null 2>&1
}

# ---------------------------------------------------------------------------
# 1. Check VLAN 20 via Panoptikon API (M-80)
# ---------------------------------------------------------------------------
check_vlan_panoptikon() {
  log "1. VLAN 20 via Panoptikon API (M-80: List VLANs)"

  if ! pan_login; then
    warn "Skipping Panoptikon checks (not authenticated)"
    return
  fi

  local vlans
  vlans=$(pan_api GET "/api/v1/mikrotik/vlans")

  if echo "$vlans" | jq -e ".[] | select(.vlan_id == \"${VLAN_ID}\")" >/dev/null 2>&1; then
    local name interface
    name=$(echo "$vlans" | jq -r ".[] | select(.vlan_id == \"${VLAN_ID}\") | .name")
    interface=$(echo "$vlans" | jq -r ".[] | select(.vlan_id == \"${VLAN_ID}\") | .interface")
    pass "VLAN ${VLAN_ID} found via Panoptikon: name=${name}, interface=${interface}"
  else
    fail "VLAN ${VLAN_ID} not found via Panoptikon API"
  fi
}

# ---------------------------------------------------------------------------
# 2. Check MikroTik DHCP configuration
# ---------------------------------------------------------------------------
check_dhcp_config() {
  log ""
  log "2. DHCP configuration on MikroTik"

  if [ -z "$MIKROTIK_PASS" ]; then
    warn "MIKROTIK_PASS not set — skipping direct MikroTik checks"
    return
  fi

  # DHCP pool
  local pools
  pools=$(mt_api GET "/ip/pool")
  if echo "$pools" | jq -e ".[] | select(.name == \"${DHCP_POOL_NAME}\")" >/dev/null 2>&1; then
    local ranges
    ranges=$(echo "$pools" | jq -r ".[] | select(.name == \"${DHCP_POOL_NAME}\") | .ranges")
    pass "DHCP pool ${DHCP_POOL_NAME} exists (ranges: ${ranges})"
  else
    fail "DHCP pool ${DHCP_POOL_NAME} not found on MikroTik"
  fi

  # DHCP server
  local servers
  servers=$(mt_api GET "/ip/dhcp-server")
  if echo "$servers" | jq -e ".[] | select(.name == \"${DHCP_SERVER_NAME}\")" >/dev/null 2>&1; then
    local iface
    iface=$(echo "$servers" | jq -r ".[] | select(.name == \"${DHCP_SERVER_NAME}\") | .interface")
    pass "DHCP server ${DHCP_SERVER_NAME} exists (interface: ${iface})"
  else
    fail "DHCP server ${DHCP_SERVER_NAME} not found on MikroTik"
  fi

  # IP address on VLAN interface
  local addrs
  addrs=$(mt_api GET "/ip/address")
  if echo "$addrs" | jq -e ".[] | select(.interface == \"${VLAN_NAME}\")" >/dev/null 2>&1; then
    local ip
    ip=$(echo "$addrs" | jq -r ".[] | select(.interface == \"${VLAN_NAME}\") | .address")
    pass "IP address ${ip} assigned to ${VLAN_NAME}"
  else
    fail "No IP address assigned to ${VLAN_NAME}"
  fi
}

# ---------------------------------------------------------------------------
# 3. Check LXC containers (Proxmox-only)
# ---------------------------------------------------------------------------
check_lxc_containers() {
  log ""
  log "3. LXC containers on VLAN 20"

  if ! has_pct; then
    warn "Not on Proxmox host (pct not found) — skipping container checks"
    warn "Set SKIP_LXC_CHECKS=1 to suppress this warning"
    return
  fi

  for ct_id in "${CONTAINER_IDS[@]}"; do
    if ! pct status "$ct_id" &>/dev/null; then
      fail "CT $ct_id does not exist"
      continue
    fi

    local status hostname
    status=$(pct status "$ct_id" | awk '{print $2}')
    hostname=$(pct config "$ct_id" | grep hostname | awk '{print $2}')

    if [ "$status" = "running" ]; then
      pass "CT $ct_id ($hostname) is running"
    else
      fail "CT $ct_id ($hostname) is $status (expected: running)"
      continue
    fi

    # Check VLAN tag
    local net_config
    net_config=$(pct config "$ct_id" | grep "net0")
    if echo "$net_config" | grep -q "tag=20"; then
      pass "CT $ct_id ($hostname) has VLAN tag 20"
    else
      fail "CT $ct_id ($hostname) missing VLAN tag 20 in network config"
    fi

    # Check DHCP lease (IP in 10.20.0.x range)
    local ip
    ip=$(pct exec "$ct_id" -- sh -c "ip -4 addr show eth0 2>/dev/null | grep -oP 'inet \K[0-9.]+'") || ip=""
    if [ -n "$ip" ] && echo "$ip" | grep -q "^10\.20\.0\."; then
      pass "CT $ct_id ($hostname) has VLAN 20 IP: $ip"
    elif [ -n "$ip" ]; then
      fail "CT $ct_id ($hostname) has IP $ip (expected 10.20.0.x range)"
    else
      fail "CT $ct_id ($hostname) has no DHCP lease"
    fi

    # Check gateway connectivity
    local ping_ok
    ping_ok=$(pct exec "$ct_id" -- sh -c "ping -c 1 -W 2 10.20.0.1 >/dev/null 2>&1 && echo yes || echo no") || ping_ok="no"
    if [ "$ping_ok" = "yes" ]; then
      pass "CT $ct_id ($hostname) can reach VLAN 20 gateway (10.20.0.1)"
    else
      fail "CT $ct_id ($hostname) cannot reach VLAN 20 gateway (10.20.0.1)"
    fi
  done
}

# ---------------------------------------------------------------------------
# 4. Check DHCP leases in Panoptikon
# ---------------------------------------------------------------------------
check_dhcp_leases() {
  log ""
  log "4. DHCP leases via Panoptikon API"

  if [ -z "$PANOPTIKON_PASS" ]; then
    warn "Skipping Panoptikon lease checks (not authenticated)"
    return
  fi

  local leases
  leases=$(pan_api GET "/api/v1/mikrotik/dhcp-leases")

  # Look for leases in the 10.20.0.x range (VLAN 20 subnet)
  local vlan20_leases
  vlan20_leases=$(echo "$leases" | jq '[.[] | select(.address // "" | startswith("10.20.0."))]')
  local count
  count=$(echo "$vlan20_leases" | jq 'length')

  if [ "$count" -ge 2 ]; then
    pass "Found $count DHCP lease(s) on VLAN 20 subnet (10.20.0.x)"
    echo "$vlan20_leases" | jq -r '.[] | "      \(.address)\t\(.host_name // "unknown")\t\(.mac_address // "")"'
  elif [ "$count" -ge 1 ]; then
    warn "Found only $count DHCP lease(s) on VLAN 20 (expected 2)"
    echo "$vlan20_leases" | jq -r '.[] | "      \(.address)\t\(.host_name // "unknown")\t\(.mac_address // "")"'
  else
    fail "No DHCP leases found on VLAN 20 subnet (10.20.0.x)"
  fi
}

# ---------------------------------------------------------------------------
# 5. Test VLAN update via API (M-82)
# ---------------------------------------------------------------------------
test_vlan_update() {
  log ""
  log "5. VLAN update test (M-82: Update VLAN)"

  if [ "$SKIP_API_TESTS" = "1" ]; then
    warn "Skipping API tests (SKIP_API_TESTS=1)"
    return
  fi

  if [ -z "$PANOPTIKON_PASS" ]; then
    warn "Skipping VLAN update test (not authenticated)"
    return
  fi

  # Get the VLAN .id for update
  local vlans vlan_ros_id
  vlans=$(pan_api GET "/api/v1/mikrotik/vlans")
  vlan_ros_id=$(echo "$vlans" | jq -r ".[] | select(.vlan_id == \"${VLAN_ID}\") | .id")

  if [ -z "$vlan_ros_id" ] || [ "$vlan_ros_id" = "null" ]; then
    fail "Cannot find VLAN ${VLAN_ID} RouterOS ID for update test"
    return
  fi

  # Rename VLAN
  local new_name="vlan20-test-renamed"
  local status
  status=$(pan_api PUT "/api/v1/mikrotik/vlans/${vlan_ros_id}" \
    -w "%{http_code}" -o /dev/null \
    -d "{
      \"name\": \"${new_name}\",
      \"vlan_id\": ${VLAN_ID},
      \"interface\": \"${VLAN_INTERFACE}\"
    }")

  if [ "$status" = "200" ] || [ "$status" = "204" ]; then
    pass "M-82: VLAN ${VLAN_ID} renamed to '${new_name}' (HTTP $status)"
  else
    fail "M-82: VLAN update failed (HTTP $status)"
    return
  fi

  # Verify the rename
  vlans=$(pan_api GET "/api/v1/mikrotik/vlans")
  local current_name
  current_name=$(echo "$vlans" | jq -r ".[] | select(.vlan_id == \"${VLAN_ID}\") | .name")
  if [ "$current_name" = "$new_name" ]; then
    pass "M-82: VLAN name verified as '${new_name}'"
  else
    fail "M-82: VLAN name is '${current_name}', expected '${new_name}'"
  fi

  # Rename back to original
  status=$(pan_api PUT "/api/v1/mikrotik/vlans/${vlan_ros_id}" \
    -w "%{http_code}" -o /dev/null \
    -d "{
      \"name\": \"${VLAN_NAME}\",
      \"vlan_id\": ${VLAN_ID},
      \"interface\": \"${VLAN_INTERFACE}\"
    }")

  if [ "$status" = "200" ] || [ "$status" = "204" ]; then
    pass "M-82: VLAN ${VLAN_ID} renamed back to '${VLAN_NAME}'"
  else
    warn "M-82: Could not rename VLAN back (HTTP $status)"
  fi
}

# ---------------------------------------------------------------------------
# 6. Test VLAN delete + recreate via API (M-83)
# ---------------------------------------------------------------------------
test_vlan_delete() {
  log ""
  log "6. VLAN delete test (M-83: Delete VLAN)"

  if [ "$SKIP_API_TESTS" = "1" ]; then
    warn "Skipping API tests (SKIP_API_TESTS=1)"
    return
  fi

  if [ -z "$PANOPTIKON_PASS" ]; then
    warn "Skipping VLAN delete test (not authenticated)"
    return
  fi

  warn "This test deletes and recreates VLAN ${VLAN_ID}."
  warn "DHCP on VLAN 20 will be briefly interrupted."

  # Get the VLAN .id for delete
  local vlans vlan_ros_id
  vlans=$(pan_api GET "/api/v1/mikrotik/vlans")
  vlan_ros_id=$(echo "$vlans" | jq -r ".[] | select(.vlan_id == \"${VLAN_ID}\") | .id")

  if [ -z "$vlan_ros_id" ] || [ "$vlan_ros_id" = "null" ]; then
    fail "Cannot find VLAN ${VLAN_ID} RouterOS ID for delete test"
    return
  fi

  # Delete VLAN
  local status
  status=$(pan_api DELETE "/api/v1/mikrotik/vlans/${vlan_ros_id}" \
    -w "%{http_code}" -o /dev/null)

  if [ "$status" = "200" ] || [ "$status" = "204" ]; then
    pass "M-83: VLAN ${VLAN_ID} deleted (HTTP $status)"
  else
    fail "M-83: VLAN delete failed (HTTP $status)"
    return
  fi

  # Verify deletion
  vlans=$(pan_api GET "/api/v1/mikrotik/vlans")
  if echo "$vlans" | jq -e ".[] | select(.vlan_id == \"${VLAN_ID}\")" >/dev/null 2>&1; then
    fail "M-83: VLAN ${VLAN_ID} still exists after delete"
  else
    pass "M-83: VLAN ${VLAN_ID} confirmed deleted"
  fi

  # Recreate VLAN to restore the test environment
  log "  Recreating VLAN ${VLAN_ID} to restore test environment..."
  status=$(pan_api POST "/api/v1/mikrotik/vlans" \
    -w "%{http_code}" -o /dev/null \
    -d "{
      \"name\": \"${VLAN_NAME}\",
      \"vlan_id\": ${VLAN_ID},
      \"interface\": \"${VLAN_INTERFACE}\"
    }")

  if [ "$status" = "200" ] || [ "$status" = "201" ] || [ "$status" = "204" ]; then
    pass "VLAN ${VLAN_ID} recreated successfully"
  else
    fail "Could not recreate VLAN ${VLAN_ID} (HTTP $status) — run setup-vlan20.sh to restore"
  fi

  # Re-assign IP address (deleted with the VLAN interface)
  if [ -n "$MIKROTIK_PASS" ]; then
    mt_api PUT "/ip/address" \
      -d "{\"address\": \"10.20.0.1/24\", \"interface\": \"${VLAN_NAME}\"}" >/dev/null
    log "  Re-assigned IP 10.20.0.1/24 to ${VLAN_NAME}"
  fi
}

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
summary() {
  log ""
  log "══════════════════════════════════════════"
  log "  VLAN 20 Verification Summary"
  log "══════════════════════════════════════════"
  log "  Passed:  $PASSES"
  if [ "$FAILURES" -gt 0 ]; then
    err "  Failed:  $FAILURES"
  else
    log "  Failed:  0"
  fi
  log "══════════════════════════════════════════"

  if [ "$FAILURES" -eq 0 ]; then
    log "All checks passed ✓"
    exit 0
  else
    err "$FAILURES check(s) failed"
    exit 1
  fi
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
log "Verifying VLAN 20 test environment"
log ""

check_vlan_panoptikon
check_dhcp_config
check_lxc_containers
check_dhcp_leases
test_vlan_update
test_vlan_delete
summary
