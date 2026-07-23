# Migration Plan: pfSense to MikroTik CHR + Panoptikon

> **Scope note:** This is a managed-router migration plan for the **current**
> Controller profile, not a native Panoptikon Gateway plan. The **planned**
> Gateway architecture is documented in
> [`GATEWAY-ARCHITECTURE.md`](./GATEWAY-ARCHITECTURE.md). The working production
> router and Controller-mode LXC 115 must not be used for Gateway experiments.

> **Date:** 2026-02-28
> **Issue:** #406
> **Status:** Draft — not urgent, execute when Panoptikon is stable

---

## Overview

Replace pfSense (10.10.0.1) with MikroTik CHR (10.10.0.125) as the primary router,
managed through Panoptikon. Nginx Proxy Manager (NPM) is replaced by Panoptikon's
built-in Caddy reverse proxy.

### Current State

| Component | Address | Role | Notes |
|-----------|---------|------|-------|
| pfSense | 10.10.0.1 | Primary router / gateway | VM on Proxmox |
| MikroTik CHR | 10.10.0.125 | Secondary (testing) | RouterOS 7.17.2, 60-day trial |
| Panoptikon | — | Management dashboard | MikroTik integration + Caddy built-in |
| NPM | — | Reverse proxy | Will be replaced by Caddy |
| Cloudflare Tunnel | LXC 121 | External access | Independent of router — no changes needed |

### Prerequisites

- MikroTik CHR p10 license (level 5) — required for >1 Gbit throughput
- Panoptikon MikroTik integration stable (DHCP, firewall, DNS views working)
- Panoptikon Caddy reverse proxy configured with all NPM proxy hosts migrated

---

## Phase 1: Feature Parity (Preparation)

**Goal:** Reproduce all pfSense configuration on MikroTik so it can function as a
drop-in replacement. Nothing changes for end users yet — pfSense remains the active
gateway.

### 1.1 DHCP Static Leases

Transfer all static DHCP mappings from pfSense to MikroTik.

**Steps:**
1. Export pfSense static mappings: Status > DHCP Leases > show all static entries
2. For each mapping, create a MikroTik DHCP lease:
   ```
   /ip dhcp-server lease add address=<IP> mac-address=<MAC> comment=<hostname> server=dhcp1
   ```
3. Verify via Panoptikon: MikroTik DHCP leases page should show all static entries

**Validation:** Count of static leases on MikroTik = count on pfSense.

### 1.2 Firewall Rules

Reproduce pfSense firewall rules on MikroTik. Refer to
[FEATURE_GAPS.md](./FEATURE_GAPS.md) for the current gap analysis.

**pfSense rule categories to migrate:**

| Category | pfSense Location | MikroTik Equivalent |
|----------|-----------------|---------------------|
| WAN inbound rules | Firewall > Rules > WAN | `/ip firewall filter` chain=forward in-interface=ether1 |
| LAN outbound rules | Firewall > Rules > LAN | `/ip firewall filter` chain=forward in-interface=bridge |
| NAT port forwards | Firewall > NAT > Port Forward | `/ip firewall nat` chain=dstnat |
| Outbound NAT | Firewall > NAT > Outbound | `/ip firewall nat` chain=srcnat action=masquerade |
| Floating rules | Firewall > Rules > Floating | Distribute across relevant chains |
| Aliases (address groups) | Firewall > Aliases | `/ip firewall address-list` |

**Steps:**
1. Document all pfSense firewall rules (screenshot or export)
2. Create equivalent MikroTik filter rules:
   ```
   /ip firewall filter add chain=forward action=accept protocol=tcp dst-port=80,443 \
     in-interface=bridge comment="Allow HTTP/HTTPS outbound"
   ```
3. Create address lists for pfSense aliases:
   ```
   /ip firewall address-list add list=blocked_ips address=1.2.3.4 comment="Bad actor"
   ```
4. Create NAT rules:
   ```
   /ip firewall nat add chain=srcnat out-interface=ether1 action=masquerade
   /ip firewall nat add chain=dstnat protocol=tcp dst-port=8123 action=dst-nat \
     to-addresses=192.168.1.10 to-ports=8123 comment="Home Assistant"
   ```
5. Verify via Panoptikon: MikroTik firewall page shows all rules

**Validation:** Rule-by-rule comparison with pfSense. Test key flows (outbound
internet, inbound port forwards) through MikroTik.

### 1.3 DNS

Configure MikroTik as the DNS resolver for the network.

**Steps:**
1. Set upstream DNS servers:
   ```
   /ip dns set servers=1.1.1.1,8.8.8.8 allow-remote-requests=yes
   ```
2. Add static DNS entries (pfSense Host Overrides):
   ```
   /ip dns static add name=nas.ok.labs address=10.10.0.15
   /ip dns static add name=proxmox.ok.labs address=10.10.0.10
   ```
3. If using pfSense as DNS forwarder for local domains — replicate on MikroTik

**Validation:** `nslookup nas.ok.labs 10.10.0.125` resolves correctly.

### 1.4 Cloudflare Tunnel

**No action required.** The Cloudflare Tunnel runs on LXC 121, independent of which
router is the default gateway. Traffic flows:

```
Internet → Cloudflare → LXC 121 (cloudflared) → internal services
```

The only requirement is that LXC 121 can reach internal services — this works
regardless of whether pfSense or MikroTik is the gateway, as long as the LAN
routing is correct.

### 1.5 Reverse Proxy: NPM to Caddy

Migrate all proxy hosts from Nginx Proxy Manager to Panoptikon's built-in Caddy.

**Steps:**
1. Export NPM proxy host list (Settings > Proxy Hosts)
2. For each proxy host, create a Caddy route in Panoptikon
3. Verify each route is accessible
4. Update any DNS records pointing to NPM's IP to point to Caddy's IP (if different)

**Validation:** All services accessible through Caddy with valid TLS certificates.

---

## Phase 2: Parallel Run

**Goal:** Run MikroTik alongside pfSense. Route test traffic through MikroTik to
verify all services work correctly before cutover.

### 2.1 Network Setup for Parallel Run

MikroTik CHR stays at 10.10.0.125. pfSense remains at 10.10.0.1 as the default
gateway. Test devices are manually pointed to MikroTik.

**Steps:**
1. On 2-3 test devices, set static gateway to 10.10.0.125:
   ```
   # Linux
   ip route replace default via 10.10.0.125
   # Or set via DHCP: point test device to MikroTik's DHCP
   ```
2. On test devices, set DNS to 10.10.0.125

### 2.2 Service Verification Checklist

Test each service through MikroTik gateway:

| Service | Test | Expected Result |
|---------|------|-----------------|
| Internet access | `curl https://example.com` | 200 OK |
| DNS resolution | `nslookup google.com 10.10.0.125` | Resolves |
| Local DNS | `nslookup nas.ok.labs 10.10.0.125` | Resolves to correct IP |
| Port forwards | External access to forwarded ports | Works |
| Cloudflare Tunnel | Access tunneled services externally | Works |
| Caddy proxy | Access proxied services via domain | Works with TLS |
| DHCP lease | Release and renew from MikroTik | Gets correct IP and options |
| Inter-VLAN routing | Ping between VLANs (if applicable) | Works |
| Panoptikon monitoring | MikroTik page shows interfaces, leases, traffic | All data present |

### 2.3 Performance Comparison

Compare MikroTik vs pfSense performance:

- Run Panoptikon speedtest through both gateways
- Compare latency: `ping -c 100 8.8.8.8` through each gateway
- Verify >1 Gbit throughput works (requires p10 license)

### 2.4 Duration

Run parallel for **at least 1 week** with test devices. All services in the checklist
must pass consistently before proceeding to Phase 3.

---

## Phase 3: Cutover

**Goal:** Switch MikroTik to be the primary gateway for all devices on the network.

### 3.1 Pre-Cutover Checklist

- [ ] All Phase 2 tests passed for 1+ week
- [ ] MikroTik p10 license active (not trial)
- [ ] pfSense config backed up (`Diagnostics > Backup & Restore`)
- [ ] MikroTik config backed up (`/export file=pre-cutover-backup`)
- [ ] Panoptikon settings point to MikroTik as primary router
- [ ] Maintenance window communicated (expect 1-2 min downtime)

### 3.2 Cutover Steps

Execute during a low-traffic window.

1. **Assign pfSense's IP to MikroTik:**
   ```
   # On MikroTik — add the gateway IP
   /ip address add address=10.10.0.1/24 interface=bridge
   # Remove old IP if needed
   /ip address remove [find address=10.10.0.125/24]
   ```

2. **Disable pfSense's LAN interface** (or shut down the VM):
   ```
   # On Proxmox
   qm stop <pfsense-vm-id>
   ```

3. **Update MikroTik DHCP** to hand out 10.10.0.1 as gateway:
   ```
   /ip dhcp-server network set [find] gateway=10.10.0.1 dns-server=10.10.0.1
   ```

4. **Force DHCP renewal on clients** (or wait for lease expiry):
   ```
   # Clients will pick up MikroTik as gateway on next DHCP renewal
   ```

5. **Update Panoptikon settings** — MikroTik IP is now 10.10.0.1

6. **Verify immediately:**
   - Internet access from multiple devices
   - DNS resolution (local and external)
   - Port forwards accessible from outside
   - Cloudflare Tunnel services accessible
   - Caddy proxy routes working
   - Panoptikon dashboard showing MikroTik data

### 3.3 Rollback Plan

**Target: restore pfSense within 5 minutes.**

If critical issues are found after cutover:

1. **Start pfSense VM** (it still has its config with 10.10.0.1)
2. **Remove 10.10.0.1 from MikroTik:**
   ```
   /ip address remove [find address=10.10.0.1/24]
   /ip address add address=10.10.0.125/24 interface=bridge
   ```
3. pfSense comes back as 10.10.0.1 — all devices reconnect automatically
4. **Investigate the issue** with MikroTik while pfSense handles traffic
5. **Update Panoptikon settings** back to pfSense if needed

**Why this is fast:** pfSense VM config is not modified during cutover. Starting the
VM restores the original state. The only action needed on MikroTik is removing the
10.10.0.1 address to avoid an IP conflict.

---

## Phase 4: Decommission

**Goal:** Remove pfSense and NPM after confirming MikroTik + Panoptikon are stable.

### 4.1 Observation Period

- Keep pfSense VM **stopped but not deleted** for 2 weeks after cutover
- Monitor MikroTik via Panoptikon for any issues during this period
- Keep NPM running (but unused) until all Caddy routes are confirmed working

### 4.2 Decommission Steps

After 2 weeks with no issues:

1. **pfSense VM:**
   - Export final backup for archive
   - Delete the VM from Proxmox
   - Reclaim disk/memory resources

2. **NPM:**
   - Verify no traffic is hitting NPM (check access logs)
   - Stop the NPM container/service
   - Remove after 1 week of being stopped with no issues

3. **Documentation updates:**
   - Update any docs referencing pfSense as the gateway
   - Update network diagrams
   - Remove pfSense-specific Panoptikon settings (if any)

### 4.3 Final State

| Component | Address | Role |
|-----------|---------|------|
| MikroTik CHR | 10.10.0.1 | Primary router / gateway |
| Panoptikon | — | Management dashboard + Caddy reverse proxy |
| Cloudflare Tunnel | LXC 121 | External access (unchanged) |

---

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| MikroTik CHR trial expires mid-migration | Medium | High — router stops working | Purchase p10 license before Phase 2 |
| Missing firewall rule causes security gap | Low | High | Thorough rule-by-rule comparison in Phase 1; parallel run catches gaps |
| DHCP issues leave devices without IP | Low | High | Keep pfSense running during Phase 2; rollback in Phase 3 |
| Performance regression (throughput/latency) | Low | Medium | Speedtest comparison in Phase 2; p10 license for >1 Gbit |
| Panoptikon MikroTik integration bug | Medium | Low | In this current Controller migration, MikroTik keeps forwarding independently of Panoptikon |
| Caddy misconfiguration breaks proxy routes | Medium | Medium | Migrate routes one-by-one; keep NPM as fallback |

---

## Dependencies on Panoptikon Features

Features that should be stable before migration (not blocking, but highly recommended):

| Feature | Status | Reference |
|---------|--------|-----------|
| MikroTik DHCP lease viewing | Done | — |
| MikroTik firewall rule viewing | Done | — |
| MikroTik interface monitoring | Done | — |
| Caddy reverse proxy management | Done | — |
| MikroTik firewall CRUD | Missing | [FEATURE_GAPS.md](./FEATURE_GAPS.md) P0 #5 |
| MikroTik DHCP pool configuration | Missing | [FEATURE_GAPS.md](./FEATURE_GAPS.md) P0 #3 |
| MikroTik DNS management | Missing | Manageable via RouterOS CLI |

The migration can proceed without Panoptikon write features — MikroTik configuration
can be done via WinBox/WebFig/CLI. Panoptikon provides monitoring and read-only views
which are sufficient for validating the migration.

---

## Timeline

This migration is **not urgent**. Recommended sequencing:

1. **Now:** Purchase MikroTik p10 license
2. **When Panoptikon is stable:** Execute Phase 1 (1-2 days of work)
3. **Phase 2:** 1 week parallel run
4. **Phase 3:** Cutover during a low-traffic window (30 min)
5. **Phase 4:** Decommission after 2 weeks of stable operation

**Total elapsed time:** ~4 weeks (mostly waiting/monitoring, ~2-3 days of active work)
