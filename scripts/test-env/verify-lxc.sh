#!/usr/bin/env bash
#
# verify-lxc.sh — Verify LXC test containers are running and discoverable
# This verifies the current MikroTik Controller lab, not a native Gateway.
#
# Run this script ON the Proxmox host (10.10.0.11) as root.
#
# Usage:
#   ssh root@10.10.0.11 bash /tmp/verify-lxc.sh
#
set -euo pipefail

CONTAINER_IDS=(201 202 203)
MIKROTIK_IP="${MIKROTIK_IP:-10.10.0.125}"

log()  { printf '\033[1;32m[verify]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[verify]\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31m[FAIL]\033[0m  %s\n' "$*"; FAILURES=$((FAILURES + 1)); }
pass() { printf '\033[1;32m[OK]\033[0m    %s\n' "$*"; }

FAILURES=0

log "Verifying Panoptikon LXC test environment"
log ""

# ── 1. Check containers are running ─────────────────────────────────────────
log "1. Container status"
for ct_id in "${CONTAINER_IDS[@]}"; do
  if ! pct status "$ct_id" &>/dev/null; then
    fail "CT $ct_id does not exist"
    continue
  fi

  status=$(pct status "$ct_id" | awk '{print $2}')
  hostname=$(pct config "$ct_id" | grep hostname | awk '{print $2}')

  if [ "$status" = "running" ]; then
    pass "CT $ct_id ($hostname) is running"
  else
    fail "CT $ct_id ($hostname) is $status (expected: running)"
  fi
done
log ""

# ── 2. Check DHCP leases (each container has an IP) ─────────────────────────
log "2. DHCP leases"
for ct_id in "${CONTAINER_IDS[@]}"; do
  if ! pct status "$ct_id" &>/dev/null; then
    continue
  fi

  hostname=$(pct config "$ct_id" | grep hostname | awk '{print $2}')
  ip=$(pct exec "$ct_id" -- sh -c "ip -4 addr show eth0 2>/dev/null | grep -oP 'inet \K[0-9.]+'") || ip=""

  if [ -n "$ip" ] && [ "$ip" != "127.0.0.1" ]; then
    pass "CT $ct_id ($hostname) has IP $ip"
  else
    fail "CT $ct_id ($hostname) has no DHCP lease"
  fi
done
log ""

# ── 3. Check mDNS (avahi-daemon running) ────────────────────────────────────
log "3. mDNS (avahi-daemon)"
for ct_id in "${CONTAINER_IDS[@]}"; do
  if ! pct status "$ct_id" &>/dev/null; then
    continue
  fi

  hostname=$(pct config "$ct_id" | grep hostname | awk '{print $2}')
  avahi_running=$(pct exec "$ct_id" -- sh -c "pgrep avahi-daemon >/dev/null 2>&1 && echo yes || echo no") || avahi_running="no"

  if [ "$avahi_running" = "yes" ]; then
    pass "CT $ct_id ($hostname) has avahi-daemon running"
  else
    warn "CT $ct_id ($hostname) avahi-daemon not running (expected for: ubuntu, debian)"
  fi
done
log ""

# ── 4. Check hostname resolves via mDNS (.local) ────────────────────────────
log "4. mDNS resolution (.local)"
for ct_id in "${CONTAINER_IDS[@]}"; do
  if ! pct status "$ct_id" &>/dev/null; then
    continue
  fi

  hostname=$(pct config "$ct_id" | grep hostname | awk '{print $2}')

  if command -v avahi-resolve-host-name &>/dev/null; then
    resolved=$(avahi-resolve-host-name -4 "${hostname}.local" 2>/dev/null | awk '{print $2}') || resolved=""
    if [ -n "$resolved" ]; then
      pass "CT $ct_id ${hostname}.local resolves to $resolved"
    else
      warn "CT $ct_id ${hostname}.local not resolvable (avahi may need time to propagate)"
    fi
  else
    warn "avahi-resolve-host-name not available on this host, skipping mDNS resolution check"
    break
  fi
done
log ""

# ── 5. Network connectivity ─────────────────────────────────────────────────
log "5. Network connectivity (ping gateway)"
for ct_id in "${CONTAINER_IDS[@]}"; do
  if ! pct status "$ct_id" &>/dev/null; then
    continue
  fi

  hostname=$(pct config "$ct_id" | grep hostname | awk '{print $2}')
  ping_ok=$(pct exec "$ct_id" -- sh -c "ping -c 1 -W 2 $MIKROTIK_IP >/dev/null 2>&1 && echo yes || echo no") || ping_ok="no"

  if [ "$ping_ok" = "yes" ]; then
    pass "CT $ct_id ($hostname) can reach MikroTik ($MIKROTIK_IP)"
  else
    fail "CT $ct_id ($hostname) cannot reach MikroTik ($MIKROTIK_IP)"
  fi
done
log ""

# ── Summary ──────────────────────────────────────────────────────────────────
if [ "$FAILURES" -eq 0 ]; then
  log "All checks passed"
else
  err() { printf '\033[1;31m[verify]\033[0m %s\n' "$*"; }
  err "$FAILURES check(s) failed"
  exit 1
fi
