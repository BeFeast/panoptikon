# Panoptikon — Test Plan

**Version:** 0.8.0
**Date:** 2026-07-23
**Status:** Active

---

## Table of Contents

0. [Gateway Roadmap Verification](#0-gateway-roadmap-verification)
1. [MikroTik Router Integration](#1-mikrotik-router-integration)
2. [Caddy Reverse Proxy](#2-caddy-reverse-proxy)
3. [Xiaomi WiFi Mesh](#3-xiaomi-wifi-mesh)
4. [Assets / Network Inventory](#4-assets--network-inventory)
5. [Historical and Legacy Integrations (VyOS, NPM)](#5-historical-and-legacy-integrations-vyos-npm)

---

## Test Environment

The listed LAN systems are the **current** Controller test environment. They are
not the planned Gateway fabric:

- **MikroTik CHR:** 10.10.0.125 (RouterOS 7+, REST API enabled)
- **Panoptikon server:** localhost:8080 (or 10.10.0.14:8080 on LAN)
- **Caddy admin API:** localhost:2019 (Docker container locally; a plain Caddy 2.11.x binary with the `cloudflare` DNS module in CI)
- **Xiaomi mesh main (CAP):** 10.10.0.199
- **Xiaomi satellites:** 10.10.0.52, 10.10.0.53, 10.10.0.54
- **Test containers:** See [test-environment.md](./test-environment.md) for Proxmox LXC setup

The working production router and Controller-mode LXC 115 are excluded from all
Gateway experiments. See [the test-environment guide](./test-environment.md) and
the [canonical Gateway architecture](./GATEWAY-ARCHITECTURE.md).

---

## 0. Gateway Roadmap Verification

This section is an acceptance matrix for the **planned** isolated Proxmox Gateway
VM. It does not describe shipped functionality. The cases are **blocked** until
the synthetic WAN/LAN/management/recovery fabric is provisioned.

### 0.1 Packet-path matrix

| ID | Case | Evidence | Required result | Status |
|---|---|---|---|---|
| G-01 | Baseline WAN↔LAN forwarding for an advertised capability | Captures on both sides, route/interface state, transaction ID | Only declared flows pass; counters and observed state agree | **Planned** |
| G-02 | NAT apply and removal | Pre/post captures and normalized desired/observed state | Translation matches the plan and removal restores baseline | **Planned** |
| G-03 | Firewall allow/deny ordering | Positive and negative probes with rule counters | Results match deterministic plan order; no undeclared rule is applied | **Planned** |
| G-04 | Address/route change | Connectivity probes through old and new path | Change is atomic or rolls back; observed revision advances once | **Planned** |
| G-05 | DHCP/DNS capability, when advertised | Lease/query transcript and packet capture | Service behavior matches target capabilities; unsupported targets reject the request | **Planned** |
| G-06 | Capability mismatch | Submit intent available on a different adapter only | Core does not offer/send it; routerd rejects any forged request | **Planned** |
| G-07 | Controller compatibility | Run current MikroTik/pfSense smoke coverage and verify removed VyOS settings/UI stay absent | Existing managed-router behavior remains supported without reviving removed paths | **Current regression gate** |

### 0.2 Failure and recovery matrix

| ID | Failure | Required result | Release gate |
|---|---|---|---|
| F-01 | Stop `panoptikon-core` during established traffic | Last committed forwarding continues; UI/API becomes unavailable without data-plane loss | **Blocked** until proven |
| F-02 | Break the Core↔routerd socket or remote mTLS link | Forwarding continues; observations become stale; new mutations are unavailable or explicitly queued | **Blocked** until proven |
| F-03 | Kill and restart routerd | Existing kernel state is reconciled before writes resume; no implicit reset | **Blocked** until proven |
| F-04 | Submit a stale expected revision | Transaction is rejected before mutation and audited | **Blocked** until proven |
| F-05 | Inject failure midway through a multi-operation apply | Result is rolled back or marked unknown; later writes wait for reconciliation | **Blocked** until proven |
| F-06 | Commit-confirm acknowledged before deadline | Candidate state becomes the new last-known-good revision | **Blocked** until implemented |
| F-07 | Commit-confirm deadline expires or reachability fails | Candidate state automatically rolls back without Core assistance | **Blocking invariant** |
| F-08 | Power-cycle Gateway after confirmed and unconfirmed changes | Confirmed last-known-good state returns; unconfirmed candidate does not persist | **Blocking invariant** |
| F-09 | Upgrade interruption or incompatible adapter | Previous working version/configuration is recoverable through the documented path | **Blocking invariant** |
| F-10 | Invalid client certificate or device identity | Remote routerd connection and mutation are rejected and audited | **Blocked** until proven |
| F-11 | Management path lost by a bad rule | Independent out-of-band access restores last-known-good state | **Blocking invariant** |
| F-12 | Attempt to address production router or LXC 115 from the fabric | Network policy and credentials make the attempt impossible; test fails closed | **Mandatory isolation gate** |

Every case records the capability set, desired-state revision, transaction ID,
packet captures, observed-state freshness, result classification, and recovery
action. A green API health endpoint alone is not Gateway verification.

### 0.3 Embedded Edge and sacrificial HIL

| ID | Target | Case | Required result | Status |
|---|---|---|---|---|
| E-01 | Selected OpenWrt target | `ubus`/UCI capability discovery and apply | Only target-supported operations are advertised and applied | **Planned** |
| E-02 | Selected OpenWrt target | Core offline and reconnect | Last-known-good operation continues; stale state and reconciliation are explicit | **Planned** |
| E-03 | Selected OpenWrt target | Signed upgrade and rollback | Failed upgrade returns to a reachable supported image | **Blocked** pending target selection |
| H-01 | ER605 V1 | Interrupted flash / serial recovery | Device is recovered through documented out-of-band steps | **Sacrificial HIL only** |

ER605 V1 results never establish the reference appliance or general OpenWrt
support matrix.

---

## 1. MikroTik Router Integration

### 1.1 Connection & Settings

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| M-01 | Test connection with valid credentials | Settings → MikroTik → enter IP `10.10.0.125`, user, password → click Test Connection | "Connection successful" message |
| M-02 | Test connection with invalid credentials | Settings → MikroTik → enter wrong password → Test Connection | Error message with HTTP 401 |
| M-03 | Test connection with unreachable IP | Settings → MikroTik → enter IP `10.10.0.254` → Test Connection | Timeout/connection refused error |
| M-04 | Save MikroTik settings | Enter valid credentials → Save | Settings persisted in SQLite; subsequent page loads show saved values |
| M-05 | Enable/disable MikroTik toggle | Toggle enabled off → Save → reload | MikroTik pages show disabled state; toggle enabled on → pages work |
| M-06 | Test connection with unsaved values | Enter new IP/credentials without saving → click Test Connection | Tests against the form values, not the saved DB values |

### 1.2 System Status

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| M-10 | Fetch system status | `GET /api/v1/mikrotik/status` | Returns CPU usage, memory, uptime, board name, RouterOS version |
| M-11 | Status displayed in Router page | Navigate to /router → MikroTik tab | Shows uptime, CPU %, memory %, board info |
| M-12 | Status caching | Call status twice within TTL | Second call returns cached result (no network request to MikroTik) |

### 1.3 DHCP Leases

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| M-20 | List DHCP leases | `GET /api/v1/mikrotik/dhcp-leases` | Returns array with IP, MAC, hostname, status, expiry, server |
| M-21 | DHCP lease discovery | Restart test container (e.g., CT 202) → wait for DHCP | New lease appears in MikroTik leases list; device appears in Panoptikon |
| M-22 | Lease to device mapping | Container gets DHCP lease → check Devices page | Device shows with hostname from DHCP lease |
| M-23 | Static vs dynamic leases | Create static lease on MikroTik → check API | Lease shows `dynamic: false` |

### 1.4 Interfaces

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| M-30 | List interfaces | `GET /api/v1/mikrotik/interfaces` | Returns all interfaces with name, type, MAC, TX/RX bytes, IPs |
| M-31 | Enable/disable interface | Toggle interface via UI | Interface state changes on MikroTik; cache invalidated |

### 1.5 Firewall

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| M-40 | List firewall filter rules | `GET /api/v1/mikrotik/firewall` | Returns filter rules, NAT rules, address lists |
| M-41 | Firewall rule visibility | Add rule on MikroTik CLI → refresh Panoptikon | New rule appears in firewall view |

### 1.6 Routes

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| M-50 | List routes | `GET /api/v1/mikrotik/routes` | Returns routing table with destination, gateway, distance |
| M-51 | Create static route | `POST /api/v1/mikrotik/routes` with dst/gateway | Route created on MikroTik; appears in routes list |
| M-52 | Delete static route | `DELETE /api/v1/mikrotik/routes/:id` | Route removed from MikroTik |

### 1.7 DNS

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| M-60 | Get DNS settings | `GET /api/v1/mikrotik/dns` | Returns DNS servers, allow-remote-requests, cache |
| M-61 | Update DNS settings | `PATCH /api/v1/mikrotik/dns` with new servers | DNS config updated on MikroTik |

### 1.8 WireGuard

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| M-70 | List WireGuard interfaces | `GET /api/v1/mikrotik/wireguard` | Returns WireGuard interfaces and peers |

### 1.9 VLANs

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| M-80 | List VLANs | `GET /api/v1/mikrotik/vlans` | Returns VLAN configurations |
| M-81 | Create VLAN | `POST /api/v1/mikrotik/vlans` | VLAN created on MikroTik |
| M-82 | Update VLAN | `PUT /api/v1/mikrotik/vlans/:id` | VLAN updated |
| M-83 | Delete VLAN | `DELETE /api/v1/mikrotik/vlans/:id` | VLAN removed |

---

## 2. Caddy Reverse Proxy

> Cases C-01..C-24 are automated in `server/tests/caddy_integration.rs` and run on Forgejo
> Actions (`.forgejo/workflows/ci.yml`) against a real Caddy 2.11.x for every push to `main`
> and every pull request. The Docker-specific steps (e.g. C-03 "stop Caddy container") describe
> the manual lab environment.

### 2.1 Connection & Settings

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| C-01 | Test Caddy connection | `POST /api/v1/caddy/test-connection` | Returns success if Caddy admin API at localhost:2019 is reachable |
| C-02 | Caddy status check | `GET /api/v1/caddy/status` | Returns Caddy reachability status |
| C-03 | Caddy unreachable | Stop Caddy container → check status | Returns unreachable/error status |

### 2.2 Proxy Host Management

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| C-10 | List proxy hosts | `GET /api/v1/caddy/proxy-hosts` | Returns all proxy hosts from SQLite |
| C-11 | Create proxy host | `POST /api/v1/caddy/proxy-hosts` with domain, forward_host, forward_port | Host created in SQLite; synced to Caddy config |
| C-12 | Update proxy host | `PUT /api/v1/caddy/proxy-hosts/:id` with modified fields | Host updated in SQLite; Caddy config resynced |
| C-13 | Delete proxy host | `DELETE /api/v1/caddy/proxy-hosts/:id` | Host removed from SQLite and Caddy config |
| C-14 | Toggle proxy host | `POST /api/v1/caddy/proxy-hosts/:id/toggle` | Host enabled/disabled; Caddy config reflects the change |

### 2.3 TLS & Sync

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| C-20 | Force sync to Caddy | `POST /api/v1/caddy/sync` | SQLite state pushed to Caddy admin API via PATCH |
| C-21 | TLS-enabled proxy host | Create host with `tls_enabled: true` | Caddy auto-provisions TLS certificate for the domain |
| C-22 | HTTP-only proxy host | Create host with `tls_enabled: false` | No TLS provisioning; plain HTTP reverse proxy |
| C-23 | HTTPS upstream | Create host with `forward_scheme: "https"` | Caddy connects to upstream via HTTPS |
| C-24 | Startup sync | Restart Panoptikon server | Caddy config synced from SQLite after 5-second delay |

### 2.4 UI

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| C-30 | Proxy page navigation | Navigate to /proxy | Lists all proxy hosts with domain, upstream, status |
| C-31 | Create proxy from UI | Click Add → fill domain/upstream → Save | New proxy host appears in list |
| C-32 | Delete proxy from UI | Click Delete on a proxy host → confirm | Host removed from list |

---

## 3. Xiaomi WiFi Mesh

### 3.1 Connection & Settings

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| X-01 | Test mesh connection | `POST /api/v1/xiaomi-mesh/test-connection` | Returns success if main router at 10.10.0.199 responds |
| X-02 | Save mesh settings | Settings → Xiaomi Mesh → enter IP, password → Save | Settings persisted; connection test passes |
| X-03 | Invalid password | Enter wrong password → Test Connection | Authentication error (stok token request fails) |
| X-04 | Unreachable router | Enter unreachable IP → Test Connection | Timeout/connection error |

### 3.2 Status & System Info

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| X-10 | Fetch mesh status | `GET /api/v1/xiaomi/status` | Returns CPU load, memory, temperature, WAN speeds, device counts, uptime |
| X-11 | Fetch hardware info | `GET /api/v1/xiaomi/new-status` | Returns hardware info + connected device counts |
| X-12 | Fetch firmware info | `GET /api/v1/xiaomi/firmware` | Returns ROM version, hardware model, country code, update availability |

### 3.3 Topology

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| X-20 | Fetch mesh topology | `GET /api/v1/xiaomi/topology` | Returns nodes (4 mesh routers) and leaf devices (connected clients) |
| X-21 | Topology no-auth | Topology endpoint works without stok token | topo_graph endpoint does not require authentication |
| X-22 | Topology page | Navigate to Xiaomi mesh topology page | Visual mesh topology showing CAP + 3 satellites with connected devices |

### 3.4 Device List

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| X-30 | List all devices | `GET /api/v1/xiaomi/devices` | Returns all connected devices with MAC, name, IP, speeds, online status |
| X-31 | WiFi device details | `GET /api/v1/xiaomi/wifi-devices` | Returns WiFi clients with signal strength and band (2.4GHz/5GHz/6GHz) |
| X-32 | Device parent tracking | Check device list response | Each device shows which mesh node (parent) it's connected to |

### 3.5 Network Info

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| X-40 | WAN info | `GET /api/v1/xiaomi/wan-info` | Returns WAN IP, gateway, DNS, WAN type, IPv6 status |
| X-41 | LAN info | `GET /api/v1/xiaomi/lan-info` | Returns LAN IP, subnet mask, port statuses |
| X-42 | WiFi band info | `GET /api/v1/xiaomi/wifi-bands` | Returns per-band details: SSID, channel, bandwidth, encryption, band steering |

### 3.6 Uptime

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| X-50 | Uptime displayed | Navigate to Xiaomi router page | Uptime shown in human-readable format |

---

## 4. Assets / Network Inventory

### 4.1 CRUD Operations

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| A-01 | List all assets | `GET /api/v1/assets` | Returns all assets with linked device/agent/SSH data |
| A-02 | Filter by type | `GET /api/v1/assets?type=server` | Returns only server-type assets |
| A-03 | Filter by status | `GET /api/v1/assets?status=active` | Returns only active assets |
| A-04 | Filter by tag | `GET /api/v1/assets?tag=production` | Returns assets tagged "production" |
| A-05 | Filter by location | `GET /api/v1/assets?location=rack1` | Returns assets in that location |
| A-06 | Get single asset | `GET /api/v1/assets/:id` | Returns asset with all linked data (device IPs, agent reports, SSH info) |
| A-07 | Create asset | `POST /api/v1/assets` with name, type, status | Asset created with UUID; appears in list |
| A-08 | Update asset | `PUT /api/v1/assets/:id` with modified fields | Asset updated; `updated_at` timestamp changes |
| A-09 | Delete asset | `DELETE /api/v1/assets/:id` | Asset removed from database |

### 4.2 Device Linking

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| A-10 | Link asset to device | Create asset with `device_id` pointing to discovered device | Asset shows device IP, MAC, online status |
| A-11 | Link asset to agent | Create asset with `agent_id` pointing to installed agent | Asset shows agent OS, online status, name |
| A-12 | Link asset to SSH target | Create asset with `ssh_target_id` | Asset shows SSH OS, online status |
| A-13 | Auto-link by name | `POST /api/v1/assets/auto-link` | Unlinked assets matched to devices by name/hostname (case-insensitive) |

### 4.3 Sync & Import

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| A-20 | Sync from devices | `POST /api/v1/assets/sync-from-devices` | Assets created for discovered devices not yet in inventory |
| A-21 | CSV import | `POST /api/v1/assets/import` with CSV rows | Assets bulk-created from CSV data |
| A-22 | Duplicate prevention | Sync twice → check count | No duplicate assets created for same device |

### 4.4 Device Identification Priority

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| A-30 | DHCP hostname priority | Device has DHCP hostname + mDNS name | Asset name comes from DHCP hostname (highest priority) |
| A-31 | mDNS fallback | Device has no DHCP hostname but has mDNS name | Asset name comes from mDNS |
| A-32 | Xiaomi name fallback | Device only visible via Xiaomi devicelist | Asset name comes from Xiaomi device name |
| A-33 | OUI fallback | Device has no hostname/name, non-randomized MAC | Asset shows vendor from OUI lookup |
| A-34 | Randomized MAC | Device has randomized MAC (local bit set) | OUI lookup skipped or marked as unreliable |

### 4.5 Multi-Source Merging

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| A-40 | Device + agent merge | Same host discovered via ARP and has agent installed | Single asset with both network and telemetry data |
| A-41 | Device + SSH merge | Same host discovered via ARP and has SSH target configured | Single asset with both network and SSH monitoring data |
| A-42 | Three-source merge | Host has device, agent, and SSH target | Asset shows merged view with all three data sources |

### 4.6 UI

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| A-50 | Assets page | Navigate to /assets | Table showing all assets with type, status, location, owner, linked data |
| A-51 | Asset types | Check type column | Shows correct icons/labels: server, workstation, vm, container, nas, router, switch, iot, phone, printer, unknown |
| A-52 | Asset statuses | Check status column | Shows: active, inactive, maintenance, retired, disposed |
| A-53 | CSV export | Click export on Assets page | Downloads CSV with all asset data |

---

## 5. Historical and Legacy Integrations (VyOS, NPM)

NPM is retained for backward compatibility. VyOS is a removed historical path.

### 5.1 VyOS (Historical / Removed)

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| L-01 | Removed settings migrate away | Apply migration 026 to a fixture containing `vyos%` settings and `show_legacy_routers` | Removed keys are deleted; unrelated settings remain |
| L-02 | No current VyOS navigation | Fresh install → inspect router and Advanced settings navigation | No VyOS tab or legacy-router visibility control is exposed |
| L-03 | No current VyOS API/client surface | Inspect compiled routes/modules and run current API smoke tests | No VyOS management endpoint or client is advertised as supported |

### 5.2 NPM (Legacy)

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| L-10 | NPM connection test | Configure NPM URL + credentials → Test Connection | Connection test works (if NPM is available) |
| L-11 | NPM proxy hosts | Navigate to NPM page | Lists proxy hosts from NPM API |

---

## API Smoke Test Commands

Quick curl commands for verifying key endpoints:

```bash
# MikroTik
curl -s http://localhost:8080/api/v1/mikrotik/status | jq '.board_name, .version'
curl -s http://localhost:8080/api/v1/mikrotik/dhcp-leases | jq '.[0]'
curl -s http://localhost:8080/api/v1/mikrotik/interfaces | jq '.[0].name'
curl -s http://localhost:8080/api/v1/mikrotik/firewall | jq '.filter | length'

# Caddy
curl -s http://localhost:8080/api/v1/caddy/status | jq '.'
curl -s http://localhost:8080/api/v1/caddy/proxy-hosts | jq '.[0]'

# Xiaomi Mesh
curl -s http://localhost:8080/api/v1/xiaomi/status | jq '.cpu, .memory'
curl -s http://localhost:8080/api/v1/xiaomi/topology | jq '.nodes | length'
curl -s http://localhost:8080/api/v1/xiaomi/devices | jq '.[0].name'

# Assets
curl -s http://localhost:8080/api/v1/assets | jq 'length'
curl -s http://localhost:8080/api/v1/assets?type=server | jq '.[0].name'
```

---

*This document is actively maintained. Last updated: 2026-07-23 (v0.8.0 —
current Controller coverage plus planned, blocked Gateway/Edge verification).*
