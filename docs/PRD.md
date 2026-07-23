# Panoptikon — Network Controller, Gateway, and Edge

## Product Requirements Document

**Version:** 0.8.0
**Author:** Oleg Kossoy (concept) / AI-assisted (document)
**Date:** 2026-07-23
**Status:** Active roadmap

> **Superseding roadmap:** The Gateway decision in
> [#834](https://github.com/BeFeast/panoptikon/issues/834) supersedes earlier
> statements that permanently limited Panoptikon to a managed-router dashboard.
> [`GATEWAY-ARCHITECTURE.md`](./GATEWAY-ARCHITECTURE.md) is the canonical system
> architecture. This PRD defines product outcomes and links to that document
> instead of creating a second protocol or deployment design.

---

## Table of Contents

1. [Overview & Vision](#1-overview--vision)
2. [Problem Statement](#2-problem-statement)
3. [Target User](#3-target-user)
4. [Goals & Non-Goals](#4-goals--non-goals)
5. [Core Features](#5-core-features)
6. [Architecture & Tech Stack](#6-architecture--tech-stack)
7. [Agent Design](#7-agent-design)
8. [UI/UX Guidelines](#8-uiux-guidelines)
9. [Data Model](#9-data-model)
10. [Test Environment](#10-test-environment)
11. [Milestones / MVP Scope](#11-milestones--mvp-scope)
12. [Open Questions](#12-open-questions)

---

## 1. Overview & Vision

Panoptikon is a self-hosted network control platform for operators who want one
local system to observe, manage, and eventually route their network without
ceding network metadata or control to a cloud service.

The product has an intentionally staged identity:

- **Current Controller:** shipped discovery, telemetry, assets, services, and
  managed-router operations through MikroTik, pfSense, and legacy VyOS APIs.
- **Planned x86-64 Gateway:** the primary product build, with separate
  `panoptikon-core` and privileged `panoptikon-routerd` processes co-located on a
  dedicated Linux appliance or VM.
- **Planned Proxmox Gateway VM:** the mandatory isolated development and release
  verification profile for native forwarding and recovery.
- **Planned Panoptikon Edge / OpenWrt:** an embedded profile using OpenWrt-native
  `ubus`/UCI integration and target-specific packaging.

Native Gateway forwarding, routerd, OpenWrt firmware, and commit-confirm are not
shipped. They remain **blocked** from production claims until the safety gates in
the canonical architecture are implemented and verified.

The name references Bentham's panopticon — the all-seeing observation tower — reimagined as a personal tool: *you* are the observer, your home network is the space. The `k` spelling makes it unique and ownable.

**The one-liner:** The all-seeing eye for your network: a local-first Controller
today, evolving into a recoverable x86 Gateway and embedded Edge platform.

**Vision:** You open a single operator console and see the entire infrastructure,
understand fresh versus stale state, preview intended changes, and apply only the
operations that the target advertises as safe. In Controller deployments those
operations are performed through managed-router APIs. In planned Gateway/Edge
deployments Core expresses desired state and routerd owns privileged execution.

### Asset Management Vision

Every host in your network has a record: whether it's a bare-metal server, a Proxmox VM, a TrueNAS box, a Raspberry Pi, or a laptop. Panoptikon collects hardware facts (CPU model, RAM, disk, OS) from three sources — in order of preference:

1. **Panoptikon agent** (installed) — real-time telemetry, CPU/RAM charts, network traffic
2. **SSH polling** (no agent needed) — periodic SSH in, run standard Linux commands, collect same facts
3. **Manual entry** — for devices you can't access (IoT, printers, managed switches)

The result: a single inventory view of your entire infrastructure, always up to date, with zero external dependencies.

---

## 2. Problem Statement

Running a home lab or small office network gives operators a false choice between
fragmented point tools and opaque vendor appliances. Today:

- **MikroTik RouterOS and pfSense** provide strong routing platforms, but their
  native tools do not provide Panoptikon's unified inventory and telemetry model.
- **VyOS has no built-in web GUI** for day-to-day monitoring. You SSH in, run `show interfaces`, and parse text output.
- **Network monitoring** requires separate tools: Fing (proprietary, SaaS-leaning), nmap (CLI), Zabbix/LibreNMS (massive overkill for a home network).
- **Device awareness** is fragmented. You don't know what's on your network without actively scanning. New devices appear silently. Devices go offline without notification.
- **Agent-based monitoring** (CPU, RAM, traffic per host) typically means deploying Prometheus + node_exporter + Grafana — a stack heavier than the machines being monitored.

Current Panoptikon addresses the visibility and managed-router portion. The
roadmap additionally addresses safe native routing without collapsing the
unprivileged control plane and privileged packet-path executor into one process.

---

## 3. Target User

**Primary users:**

- Homelab and small-office operators running the current Controller with
  MikroTik, pfSense, or an existing VyOS deployment.
- Technical operators who want a dedicated, recoverable x86-64 Gateway they can
  inspect, back up, and operate without vendor cloud control.
- Developers and maintainers who need an isolated Proxmox fabric for destructive
  packet-path, upgrade, and failure verification.
- Embedded users who may adopt the planned OpenWrt Edge profile on explicitly
  supported hardware after its resource and recovery gates pass.

**Not targeting:**

- Enterprise-scale orchestration across hundreds of sites.
- An unbounded generic Linux root-execution service.
- Operators unwilling to maintain an out-of-band recovery path for native
  Gateway experiments.

---

## 4. Goals & Non-Goals

### Goals

| # | Goal | Status |
|---|------|--------|
| G1 | Preserve the shipped Controller experience for MikroTik, pfSense, and legacy VyOS users | **Current** |
| G2 | Discover devices and unify network, host, service, and asset telemetry locally | **Current** |
| G3 | Make x86-64 co-located Gateway the primary product build | **Planned** |
| G4 | Keep Core unprivileged and isolate packet-path execution in routerd | **Planned** |
| G5 | Use one capability/desired-state/transaction contract over local Unix sockets or remote mTLS | **Planned** |
| G6 | Continue last-known-good forwarding and show honest stale/offline state when Core or transport is unavailable | **Planned** |
| G7 | Require commit-confirm, reconciliation, and out-of-band recovery before native forwarding is production-ready | **Blocked** pending implementation and isolated verification |
| G8 | Verify native Gateway work in a disposable Proxmox VM fabric | **Blocked** until the isolated fabric exists |
| G9 | Deliver a separately packaged OpenWrt Edge profile using `ubus`/UCI | **Planned** |
| G10 | Remain self-hosted, open-source, privacy-first, and explicit about target capabilities | **Current and planned** |

### Non-Goals

| # | Non-Goal | Rationale |
|---|----------|-----------|
| NG1 | Removing Controller mode when Gateway ships | Managed-router integrations remain supported. |
| NG2 | Testing Gateway changes on the working production router or Controller-mode LXC 115 | Experiments require the isolated Proxmox Gateway VM. |
| NG3 | Treating ER605 V1 as the reference appliance | It is sacrificial HIL/recovery hardware only. |
| NG4 | One identical binary/backend across x86-64 and constrained OpenWrt targets | Profiles share a contract, not necessarily packaging or implementation. |
| NG5 | Cloud/SaaS control, required accounts, or phone-home telemetry | The product remains local and operator-controlled. |
| NG6 | Shipping native forwarding before recovery invariants pass | Commit-confirm and out-of-band recovery are blocking gates. |

---

## 5. Core Features

### P0 — Must Have (MVP) — ✅ Complete

#### F1: Dashboard ✅
- Router status card: uptime, CPU, memory, interface summary
- Active devices count (online now / total known)
- Top devices by traffic with **sparkline charts**
- Recent alerts feed
- Framer Motion animations for smooth transitions

#### F2: Device Discovery & Management ✅
- **ARP scan** on configurable subnets (active + passive)
- **mDNS/Bonjour** passive discovery
- **SSDP (UPnP)** device discovery
- Scan runs on a schedule (configurable) and on-demand
- MAC → vendor lookup via local OUI database (IEEE MA-L, embedded at build time)
- Device list with: IP, MAC, hostname (via DHCP lease or mDNS), vendor, first seen, last seen, online/offline status
- Manual device tagging: custom name, **device type icon** (auto-detected or manual), notes, "known" vs "unknown" flag
- Online/offline history per device (state change log)
- **Device fingerprinting:** multi-layer enrichment engine detecting OS family, device type, brand, and model via DHCP, hostname patterns, mDNS services, TTL analysis, and OUI lookup

#### F3: Router Integration ✅
- **MikroTik (Primary/Default):** Connect to RouterOS 7+ REST API. Full management: system status (uptime, CPU, memory, board info), interfaces (IPs, MACs, TX/RX, enable/disable), routes (view + create/delete static routes), DHCP leases, VLANs, firewall rules, traffic monitoring, NAT/port forwarding, VPN status, dynamic DNS, QoS, DNS configuration, WireGuard VPN. TTL-based caching for read operations. This is the default router path in onboarding, router pages, and new feature planning.
- **pfSense (Supported):** Preserve the current pfSense integration and bridge for existing Controller deployments while MikroTik remains the primary/default path.
- **VyOS (Legacy/Optional):** Connect to VyOS HTTP API. Display: system status, syslog, interfaces, routes, DHCP leases + static mappings, firewall rules (full CRUD + groups), DNS forwarding, WireGuard VPN peers. Configuration backup/restore with diff viewing. Visibility is hidden by default and only exposed when legacy routers are explicitly enabled in Advanced settings.
- Connection test + health indicator in the relevant managed-router UI

#### F4: Authentication ✅
- Single-user authentication: username + password (bcrypt-hashed, stored in SQLite)
- Session-based auth with HTTP-only secure cookie
- Initial setup wizard: set password on first launch
- API key for agent authentication (generated in UI, revocable)
- Login rate limiting

#### F5: Alerts (Basic) ✅
- New unknown device detected on network
- Known device went offline (after configurable grace period)
- Known device came back online
- Alert delivery: in-app feed with read/unread status, acknowledge, severity filtering
- Alert storage in SQLite

### P1 — Should Have — ✅ Complete

#### F6: Agent System ✅
- Lightweight Rust agent binary (~2–5 MB static binary)
- WebSocket-based persistent connection for instant offline detection
- Reports: CPU usage, memory usage, disk usage, network interfaces + traffic counters, OS info, uptime
- Pre-built binaries for: `x86_64-linux-musl`, `aarch64-linux-musl`, `x86_64-apple-darwin`, `aarch64-apple-darwin`
- Agent management UI: list agents, status, last report time, install instructions (copy-paste curl one-liner)
- Binary installer download from UI
- See [Section 7: Agent Design](#7-agent-design) for protocol details

#### F7: Traffic Monitoring ✅
- Per-device bandwidth tracking (via router interface counters + agent reports + NetFlow)
- Historical graphs: 1h / 24h / 7d / 30d views
- Charts library: Recharts (React-native, composable, good dark theme support)
- Data aggregation: raw samples → 1-min averages → 1-hour averages (automatic rollup)
- NetFlow v5 UDP collector for traffic analysis

#### F8: Topology View ✅
- Interactive network map: router at center, devices as nodes
- Auto-layout based on subnet membership (router → subnet group → devices)
- Device nodes show: icon (by type), name, IP, online/offline indicator
- Manual position pinning (drag a device, it stays there) with persistence

#### F9: Alerts (Extended) ✅
- Webhook delivery with auto-detection for Discord, ntfy.sh, Telegram, and generic JSON endpoints
- Alert rules: high bandwidth threshold
- Alert management: acknowledge, read/unread, severity filtering

### P2 — Nice to Have

#### F10: Router Configuration (Write) — Partial ✅
- ✅ **VyOS:** Edit firewall rules via GUI (create/modify/delete), firewall groups (address, network, port), interface management, DHCP static mapping management, DNS forwarding configuration, WireGuard VPN peer management
- ✅ **MikroTik:** Interface enable/disable toggle, static route create/delete, DNS configuration, WireGuard configuration
- ✅ **Config backup/restore** with unified diff viewing and audit trail (VyOS)
- [ ] Rollback support

#### F11: Wake-on-LAN ✅
- Send WoL magic packet to known devices (by MAC address)
- Button on device card

#### F12: Port Scanning
- [ ] On-demand port scan of selected device
- [ ] Known-ports display on device card
- [ ] Service identification

#### F13: Network Speed Test ✅
- ✅ Internet speed — Ookla speedtest CLI integration with automatic scheduling and history
- [ ] LAN throughput — iperf3 between server and agents
- [ ] SMB/NFS throughput testing
- [ ] UDP jitter / packet loss

#### F14: Export & API ✅
- ✅ REST API for all data (devices, alerts, metrics) — dogfood the same API the UI uses
- ✅ CSV/JSON export of device list, alert history, traffic data, assets
- ✅ Prometheus metrics endpoint (`/metrics`) for integration with existing monitoring

#### F15: Nginx Proxy Manager (NPM) Integration ✅ *(Legacy — replaced by Caddy)*
- Proxy host management (create, update, delete, toggle)
- Redirection host configuration
- SSL certificate management (Let's Encrypt + custom)
- Stream (TCP/UDP) proxy configuration
- Dead hosts (status monitoring)
- Access lists (IP-based access control)
- Dedicated settings page with connection test
- **Note:** NPM is retained for backward compatibility. New deployments should use Caddy (F15b).

#### F15b: Caddy Proxy Manager ✅
- Full integration with Caddy Admin API
- Proxy host management (create, update, delete)
- Automatic HTTPS via Caddy's built-in ACME
- Live configuration reload without downtime
- Part of the embedded Docker Compose stack (replaces NPM as the primary reverse proxy)

#### F15c: Unbound DNS Manager ✅
- Local DNS record management (A, AAAA, CNAME, PTR)
- DNS blocklist management (ad blocking, malware domains)
- Query log visualization and search
- Upstream forwarder configuration
- Part of the embedded Docker Compose stack

#### F15d: Cloudflare Tunnel Management ✅
- Tunnel status monitoring and management
- Ingress rule configuration (route external domains to internal services)
- Optional 4th service in the Docker Compose stack
- Secure external access without port forwarding

#### F16: Services Wizard ✅
- Unified orchestration for deploying services: NPM proxy host + VyOS firewall rules + DNAT rules
- Single API call with per-step status reporting

#### F17: Global Search & Command Palette ✅
- **Cmd+K command palette** for quick navigation and actions
- Search across devices, agents, alerts, SSH hosts, and assets
- Unified results with type indicators

#### F18: Audit Log ✅
- Full router operation audit trail (VyOS)
- Action, command, and result tracking
- Settings page for viewing audit history

---

### P2 — Asset Management & Agentless SSH Monitoring — ✅ Complete

#### F19: Agentless SSH Monitoring ✅

For hosts where you can't or don't want to install an agent, Panoptikon can SSH in directly and collect the same metrics.

**How it works:**
- Add an SSH target: hostname/IP, port, username, password or SSH key
- Server polls periodically (configurable interval, default: 60s)
- SSH connection pooling for efficient resource usage
- Runs a minimal command set via SSH, parses output
- Stores results in the same `ssh_reports` table, displays in the same UI as agent data

**Commands collected:**
```bash
# CPU load (1min avg)
cat /proc/loadavg | awk '{print $1}'

# Memory (bytes: total, used)
free -b | awk '/Mem:/ {print $2, $3}'

# Disk (bytes: total, used on /)
df -B1 / | tail -1 | awk '{print $2, $3}'

# Uptime (seconds)
cat /proc/uptime | awk '{print $1}'

# Hostname and OS
hostname && cat /etc/os-release | grep -E '^(NAME|VERSION_ID)='
```

**Status:** online if last poll succeeded, offline if SSH connection failed 3x in a row.

**UI:** SSH Hosts page in sidebar. Table shows name, host, CPU%, RAM%, disk%, uptime, OS, last seen. Detail page: same CPU/RAM charts as agent detail. Test connection button.

#### F20: IT Asset Inventory ✅

A structured record for every asset in the infrastructure — servers, VMs, containers, workstations, network devices, storage, IoT.

**Asset record fields:**
| Field | Source | Notes |
|-------|--------|-------|
| Name | Manual / auto from hostname | Human-readable label |
| Type | Manual / heuristic | server, workstation, vm, container, nas, router, switch, iot, phone, unknown |
| Location | Manual | Rack, room, cloud region, or "home office" |
| Owner / managed by | Manual | Who is responsible |
| Hardware model | Agent / SSH / manual | e.g. "Apple Mac Mini M4", "Supermicro X11SCL" |
| CPU | Agent / SSH / manual | e.g. "Intel Xeon E-2224G (4 cores @ 3.5 GHz)" |
| RAM | Agent / SSH | bytes → displayed as GB |
| Storage | Agent / SSH / manual | Primary disk size + name |
| OS | Agent / SSH / manual | e.g. "Ubuntu 24.04 LTS" |
| IP address(es) | Discovered via ARP/DHCP | Can have multiple |
| MAC address(es) | Discovered | For linking to network-scanned devices |
| Tags | Manual | Free-form: "production", "backup", "lab", "proxmox-node" |
| Notes | Manual | Free text |
| Purchase date | Manual | Optional, for warranty tracking |
| Serial number | Agent / SSH (`dmidecode`) / manual | |
| Status | Auto | online / offline / unknown |

**Data sources (priority order):**
1. Panoptikon agent (if installed) → live telemetry + hardware inventory
2. SSH polling (if configured) → periodic collection of the same facts
3. Network scan (ARP/DHCP) → IP, MAC, online status, vendor guess
4. Manual entry → everything else

**Linking:** An asset can be linked to a discovered network device (by MAC/IP), to a Panoptikon agent (by agent ID), and to an SSH target (by IP). The UI merges these views automatically when the same host appears in multiple sources.

---

## 6. Architecture & Tech Stack

The normative process boundary, transports, shared contract, adapters, recovery
rules, and rollout phases live in
[`GATEWAY-ARCHITECTURE.md`](./GATEWAY-ARCHITECTURE.md). The summary below defines
product placement; the following detailed diagram documents the **current**
Controller implementation only.

| Deployment profile | Product role | Status |
|---|---|---|
| x86-64 co-located Gateway | Primary product build; separate local Core and routerd processes using a Unix socket | **Planned** |
| Proxmox Gateway VM | Mandatory isolated development and verification fabric | **Planned**; packet-path work is **blocked** until available |
| Panoptikon Edge / OpenWrt | Embedded profile with target-specific packaging and `ubus`/UCI adapter | **Planned** |
| Managed-router Controller | Discovery, telemetry, services, and current MikroTik/pfSense/legacy VyOS integrations | **Current** and supported |

The roadmap does not combine all privilege into the web/API process. Core owns
intent, history, and operator workflows; routerd owns the minimum privileged
execution surface. Local communication uses a restricted Unix socket. Remote
Edge communication uses mTLS. Both carry the same versioned
capability/desired-state/transaction contract.

### Current Controller Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Browser (User)                         │
│                Next.js SPA (shadcn/ui, dark)                │
└──────────┬──────────────────────┬───────────────────────────┘
           │ REST (CRUD)          │ WebSocket (live updates)
           ▼                      ▼
┌══════════════════════════════════════════════════════════════┐
║              Docker Compose Stack                            ║
║                                                              ║
║  ┌────────────────────────────────────────────────────────┐  ║
║  │              Panoptikon (Rust + axum)                  │  ║
║  │                                                        │  ║
║  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ │  ║
║  │  │ REST API │ │ WS Hub   │ │ Scanner  │ │ Router   │ │  ║
║  │  │(devices, │ │ (push    │ │ (ARP,    │ │ Clients  │ │  ║
║  │  │ alerts,  │ │  updates │ │ mDNS,    │ │┌────────┐│ │  ║
║  │  │ agents,  │ │  to UI)  │ │ SSDP,    │ ││MikroTik││ │  ║
║  │  │ assets,  │ │          │ │ NetFlow) │ │├────────┤│ │  ║
║  │  │ caddy,   │ │          │ │          │ ││pfSense ││ │  ║
║  │  │ unbound, │ │          │ │          │ │├────────┤│ │  ║
║  │  │ cf-tun)  │ │          │ │          │ ││VyOS    ││ │  ║
║  │  │          │ │          │ │          │ │└────────┘│ │  ║
║  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘ │  ║
║  │                     │                                  │  ║
║  │            ┌────────┴────────┐                         │  ║
║  │            │   SQLite (sqlx) │                         │  ║
║  │            └─────────────────┘                         │  ║
║  └────────────────────────────────────────────────────────┘  ║
║                                                              ║
║  ┌──────────┐  ┌──────────┐  ┌──────────────┐               ║
║  │  Caddy   │  │ Unbound  │  │ Cloudflared  │ (optional)    ║
║  │ (reverse │  │  (DNS    │  │ (CF Tunnel)  │               ║
║  │  proxy)  │  │ resolver)│  │              │               ║
║  └──────────┘  └──────────┘  └──────────────┘               ║
╚══════════════════════════════════════════════════════════════╝
                    │ WebSocket        │ SSH polling
        ┌───────────┼───────────┐      │
        ▼           ▼           ▼      ▼
   ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌──────────┐
   │ Agent   │ │ Agent   │ │ Agent   │ │ SSH      │
   │ (Linux) │ │ (macOS) │ │ (RPi)   │ │ Targets  │
   └─────────┘ └─────────┘ └─────────┘ └──────────┘
```

### Current Managed-Router Integration Architecture

Panoptikon currently supports managed-router integrations alongside the Gateway
roadmap. MikroTik remains the primary/default path, pfSense remains supported for
existing deployments, and VyOS remains a legacy secondary integration:

| Router | API | Status | Default |
|--------|-----|--------|---------|
| **MikroTik** | RouterOS 7+ REST API | ✅ Primary | Default tab and default router type |
| **pfSense** | pfSense integration/bridge | Supported | Existing deployments |
| **VyOS** | VyOS HTTP API (1.3+) | ⚠️ Legacy Optional | Hidden by default; shown only when legacy routers are enabled |

The managed-router integrations retain their current caching and mutation
behavior. Each router has its own settings path and can be independently
enabled/disabled. The `show_legacy_routers` setting defaults to `false`, keeping
VyOS flows out of the primary UI until explicitly enabled.

### Tech Stack Justification

| Component | Choice | Why |
|-----------|--------|-----|
| **Backend language** | Rust | Performance, type safety for network parsing, and the async Tokio ecosystem. The current Controller can ship as one binary; the planned Gateway deliberately separates Core and routerd, and embedded targets may use different packaging. |
| **Web framework** | axum | Tokio-native, tower middleware ecosystem, first-class WebSocket support, extractors pattern is clean. Most popular Rust web framework as of 2025. |
| **Database** | SQLite via sqlx | Zero-config, single-file, embedded. Perfect for self-hosted single-server deployment. sqlx gives compile-time query checking. Good enough for 100K+ devices (our ceiling is ~100). |
| **Frontend framework** | Next.js 14+ (App Router) | React ecosystem, good SSR story for initial load, excellent DX. Massive component ecosystem. |
| **UI components** | shadcn/ui + Tailwind CSS | Beautiful defaults, dark theme out of the box, accessible, copy-paste components (no dependency lock-in). Matches the polished UniFi aesthetic we're targeting. |
| **Charts** | Recharts | React-native, composable, responsive. Better DX than Chart.js for React apps. Good dark theme customization. |
| **Topology rendering** | SVG + d3-force | Accessible (DOM nodes, not canvas pixels), interactive (click/hover events are trivial), good enough performance for <200 nodes. |
| **Network scanning** | `pnet` (Rust) + system ARP table | `pnet` for raw ARP packet crafting when root, fallback to parsing `/proc/net/arp` or `arp -a` output. No nmap dependency required. |
| **Reverse proxy** | Caddy | Automatic HTTPS, simple config, Admin API for programmatic management. Primary/embedded reverse proxy (NPM is legacy). |
| **WiFi mesh** | Xiaomi BE3600 2.5G | 4-node mesh network. HTTP API with stok token auth. Provides device list, topology, signal strength. |
| **DNS resolver** | Unbound | Lightweight recursive DNS resolver with local zone support, blocklists, and query logging. Embedded in the Docker Compose stack. |
| **Tunnel** | Cloudflared | Cloudflare Tunnel for secure external access without port forwarding. Optional 4th service in Docker Compose. |
| **Animations** | Framer Motion | Smooth, declarative animations for React. Card transitions, page enters, and micro-interactions. |
| **OUI database** | Embedded IEEE MA-L CSV | Compiled into the binary. Updated on release. No runtime download needed. |

### Current Controller Deployment Model

The shipped Controller is currently deployed with **Docker Compose**, packaging
Panoptikon with its companion services. This is not the planned native Gateway
packaging:

```yaml
# docker-compose.yml (simplified)
services:
  panoptikon:
    image: panoptikon/panoptikon:latest
    ports:
      - "8080:8080"
    volumes:
      - ./data:/data          # SQLite database
      - ./config:/config      # panoptikon.toml

  caddy:
    image: caddy:2-alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./caddy:/etc/caddy

  unbound:
    image: mvance/unbound:latest
    ports:
      - "53:53/udp"
      - "53:53/tcp"
    volumes:
      - ./unbound:/opt/unbound/etc/unbound

  cloudflared:                 # Optional
    image: cloudflare/cloudflared:latest
    command: tunnel run
    profiles: ["tunnel"]
```

```bash
# Quick start:
git clone https://github.com/BeFeast/panoptikon && cd panoptikon
docker compose up -d
# → SQLite database created at ./data/panoptikon.db
# → Open http://localhost:8080
```

The current x86 Controller binary embeds the Next.js frontend (statically exported
via `rust-embed`). It can also run standalone without Docker. The planned x86
Gateway splits Core from privileged routerd, while the OpenWrt Edge profile uses
separate, target-appropriate packaging; the roadmap does not promise one binary
or backend across x86 and embedded targets.

**Docker Hub releases** are planned for automated image publishing.

### Current Reference Controller Deployment: Proxmox + MikroTik + Docker Compose

This section describes shipped infrastructure, not the planned Proxmox Gateway
VM. The working production router and Controller-mode LXC 115 must remain outside
Gateway experiments.

**MikroTik CHR** runs as the primary router (hardware device, CHR VM, or container):
- RouterOS 7+ with REST API enabled
- API accessible from LAN
- Enable REST API: `/ip/service set api-ssl address=10.10.0.0/24`

**Panoptikon Docker Compose stack** runs on a Proxmox host (LXC or VM with Docker):
- OS: Debian 12 with Docker Engine
- Resources: 1–2 vCPUs, 512 MB RAM, 4 GB disk
- Network: bridged to LAN — **required** for ARP scanning to reach all devices
- Required capabilities: `CAP_NET_RAW` (ARP raw sockets via pnet), `CAP_NET_ADMIN` (interface operations)
- Stack includes: **panoptikon** (core) + **caddy** (reverse proxy) + **unbound** (DNS) + **cloudflared** (optional tunnel)

```yaml
# Docker Compose services:
# panoptikon  — Rust backend + embedded Next.js frontend + SQLite
# caddy       — Reverse proxy with automatic HTTPS
# unbound     — Local DNS resolver with blocklists
# cloudflared — Cloudflare Tunnel (optional, enable with --profile tunnel)
```

**Optional VyOS** — if running VyOS alongside MikroTik (e.g. as a dedicated firewall VM):
- VyOS VM: 2 vCPUs, 512 MB RAM, 2 NICs
- VyOS HTTP API enabled and reachable from LAN
- Enable in Panoptikon Settings → Advanced → Show legacy routers, then configure in Settings → Router → VyOS (Legacy)

### Current Controller Build Pipeline

```
Frontend (Next.js):  bun run build → static export → /out/
                                                      ↓
Backend (Rust):      cargo build --release ← rust-embed includes /out/
                                                      ↓
                              Single binary: panoptikon (~15-25 MB)
                                                      ↓
Docker:              Dockerfile → multi-stage build → panoptikon image
                                                      ↓
Compose:             docker-compose.yml → panoptikon + caddy + unbound + cloudflared
```

---

## 7. Agent Design

### Decision: WebSocket (Agent ↔ Server, persistent bidirectional)

**Chosen protocol: WebSocket** — each agent opens a persistent connection to the server on startup and keeps it alive.

**Considered alternatives:**

| Protocol | Pros | Cons | Verdict |
|----------|------|------|---------|
| HTTP POST | Simple, curl-debuggable, stateless | Offline detection requires timeout heuristic; no server→agent commands without polling; overhead per request | ❌ Inferior offline detection |
| **WebSocket (chosen)** | Instant offline detection (connection drop); bidirectional (server can push commands to agent); low overhead after handshake; real-time feel | Reconnection logic needed; slightly harder to curl-test | ✅ Best fit |
| gRPC | Strong typing, streaming, efficient binary | Heavy dependency (tonic + protobuf); complex setup; not worth it for this payload size | ❌ Too heavy |

**Rationale:**
- **Offline detection is instant and reliable.** When a connection drops, the server knows immediately — no polling timeout heuristic needed. A device that loses power shows as offline within seconds, not after a missed HTTP heartbeat.
- **Bidirectional channel enables future features without protocol changes.** Server → agent commands ("run iperf3 to this IP", "trigger ARP scan on your subnet", "collect a port scan") are free once WebSocket is in place. With HTTP POST this would require a separate polling mechanism.
- **Reconnection logic is ~50 lines in Rust (tokio-tungstenite).** Not a real cost.

**Agent connection lifecycle:**
1. Agent starts → opens WebSocket to `ws://<server>/api/v1/agent/ws`
2. First message: auth + initial report (hostname, OS, interfaces)
3. Server sends ack + agent UUID (if new) or confirms registration
4. Agent sends periodic report every 30s (configurable)
5. Server can push commands at any time: `{"cmd": "speedtest", "target": "10.10.0.1"}`
6. Agent responds to commands via the same WebSocket
7. On disconnect: server marks agent offline immediately; agent reconnects with exponential backoff

**Message format:** JSON over WebSocket (text frames). Binary frames reserved for future file transfer (e.g., log tailing).

### Hardware Inventory via fastfetch (issue #559)

[fastfetch-cli](https://github.com/fastfetch-cli/fastfetch) is a system information tool (C) with structured JSON output: CPU model/cores/freq, GPU, RAM type/speed, storage, network interfaces, OS, display, battery, motherboard, BIOS.

#### Phase 1 — Subprocess (quick start)

Agent calls `fastfetch --format json` as subprocess, parses output.

- Optional `fastfetch_path` config key (default: auto-detect)
- Run at startup + periodic refresh
- Graceful fallback to existing collectors if fastfetch not found

**Pros:** Zero FFI complexity, immediate  
**Cons:** Requires fastfetch installed on host

#### Phase 2 — Native bindings (target)

Compile fastfetch as C static lib, call via Rust FFI, bundle into agent binary.

- fastfetch as git submodule
- `build.rs` + `cc` crate + `bindgen` (~100 lines)
- Zero install dependency, single self-contained binary

**Feasibility:** Straightforward for Linux x86_64 + macOS arm64. CMake in CI is one-time setup. Not significantly more complex than subprocess approach.

#### Data added to agent report

```json
{
  "hardware_inventory": {
    "source": "fastfetch",
    "cpu": { "name": "Apple M1 Pro", "cores_physical": 8, "cores_logical": 10 },
    "gpu": [{ "name": "Apple M1 Pro", "type": "integrated" }],
    "memory": { "total_mb": 16384, "type": "LPDDR5", "speed_mhz": 6400 },
    "storage": [{ "name": "APPLE SSD AP0512R", "size_gb": 512, "type": "NVMe" }],
    "motherboard": { "name": "Mac14,5", "vendor": "Apple" }
  }
}
```

---

### Network Asset Scanner (issue #558)

Active scanning to discover and enrich device inventory. Manual trigger or scheduled.

#### Sources (priority order)

| Source | Method | Data |
|--------|--------|------|
| **Panoptikon agent** | Self-report via WebSocket | Hostname, OS, hardware, MAC — most accurate |
| **arp-scan** | `arp-scan --localnet` | Fast MAC+IP |
| **Router DHCP** | MikroTik / Xiaomi API | Hostname from lease |
| **mDNS/Bonjour** | `avahi-browse -a` | Apple/Linux names + types |
| **NetBIOS** | `nmblookup -A <ip>` | Windows names |
| **nmap** | `-O --osscan-guess -sV` | OS, ports, banners |
| **SNMP** | `snmpwalk sysName.0` | Switch/router names |
| **HTTP fingerprint** | `curl -I http://<ip>/` | Server header → model |
| **Reverse DNS** | PTR lookup | hostname |

#### Agent → device enrichment

On agent connect: upsert `devices` WHERE `mac = agent_mac` → set hostname, os, hardware_model, agent_id.

#### UX

- "Scan Network" button in Devices page header
- Per-source progress, summary toast after scan
- Optional scheduled interval (default: off)

---

### Agent Authentication

- On first install, the agent receives an **API key** (generated in the Panoptikon web UI under Agent Management).
- The API key is passed as `Authorization: Bearer <key>` header on every request.
- API keys are stored bcrypt-hashed in the server's SQLite database.
- Each API key is associated with an agent ID (UUID, generated server-side).
- Agent registration flow:
  1. User clicks "Add Agent" in UI → gets an API key + agent ID + install command
  2. User runs install command on target machine (downloads binary + writes config)
  3. Agent starts, sends first report → appears as "online" in UI

### Agent Report Payload

```
POST /api/v1/agent/report
Authorization: Bearer <api_key>
Content-Type: application/json
```

```json
{
  "agent_id": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2026-02-19T16:27:00Z",
  "version": "0.1.0",
  "hostname": "docker-lxc",
  "os": {
    "name": "Ubuntu",
    "version": "24.04",
    "kernel": "6.8.0-45-generic",
    "arch": "x86_64"
  },
  "uptime_seconds": 864000,
  "cpu": {
    "count": 4,
    "usage_percent": 12.5,
    "load_avg": [0.45, 0.32, 0.28]
  },
  "memory": {
    "total_bytes": 8589934592,
    "used_bytes": 3221225472,
    "swap_total_bytes": 2147483648,
    "swap_used_bytes": 0
  },
  "disks": [
    {
      "mount": "/",
      "filesystem": "ext4",
      "total_bytes": 107374182400,
      "used_bytes": 42949672960
    }
  ],
  "network_interfaces": [
    {
      "name": "eth0",
      "mac": "52:54:00:12:34:56",
      "addresses": ["10.10.0.25/24"],
      "tx_bytes": 1099511627776,
      "rx_bytes": 2199023255552,
      "tx_bytes_delta": 524288,
      "rx_bytes_delta": 1048576,
      "speed_mbps": 1000,
      "state": "up"
    }
  ]
}
```

**Delta fields:** `tx_bytes_delta` and `rx_bytes_delta` represent bytes transferred since the last report. The agent tracks cumulative counters internally and computes deltas. This lets the server calculate bandwidth without worrying about counter resets.

### Agent Binary Design

```
panoptikon-agent
├── config.toml          # Server URL, API key, agent ID, report interval
├── collectors/
│   ├── cpu.rs           # /proc/stat (Linux), sysctl (macOS)
│   ├── memory.rs        # /proc/meminfo, sysctl
│   ├── disk.rs          # statvfs
│   ├── network.rs       # /proc/net/dev, getifaddrs
│   └── os.rs            # /etc/os-release, uname
└── main.rs              # Loop: collect → serialize → POST → sleep
```

**Config file** (`/etc/panoptikon-agent/config.toml`):

```toml
server_url = "http://10.10.0.25:8080"
api_key = "pan_a1b2c3d4e5f6..."
agent_id = "550e8400-e29b-41d4-a716-446655440000"
report_interval_seconds = 30
```

**Target binary size:** 2–5 MB (static musl build, stripped, no debug symbols).

**Resource usage target:** <5 MB RSS, <0.1% CPU at 30s intervals.

### Agent Installation

The UI generates a one-liner for each platform:

```bash
# Linux (x86_64)
curl -fsSL http://10.10.0.25:8080/api/v1/agent/install/linux-amd64?key=pan_a1b2... | sh

# Linux (aarch64 / Raspberry Pi)
curl -fsSL http://10.10.0.25:8080/api/v1/agent/install/linux-arm64?key=pan_a1b2... | sh

# macOS (Apple Silicon)
curl -fsSL http://10.10.0.25:8080/api/v1/agent/install/darwin-arm64?key=pan_a1b2... | sh
```

The install script:
1. Downloads the binary to `/usr/local/bin/panoptikon-agent`
2. Writes config to `/etc/panoptikon-agent/config.toml`
3. Creates a systemd service (Linux) or launchd plist (macOS)
4. Starts the service

---

## 8. UI/UX Guidelines

### Design Philosophy

**Inspiration: Ubiquiti UniFi Network 8.x**

The UI should feel like a network operations center — dark, information-dense, but not cluttered. Every pixel should earn its place.

### Visual Design

| Aspect | Specification |
|--------|---------------|
| **Theme** | Dark only (no light mode — focus and polish one thing) |
| **Background** | Near-black (`#0a0a0f` or similar), not pure black |
| **Cards** | Slightly elevated surfaces (`#16161f`), subtle border (`#2a2a3a`), rounded corners (8px) |
| **Accent color** | Electric blue (`#3b82f6`) for primary actions, active states, links |
| **Status colors** | Green (`#22c55e`) = online/healthy, Red (`#ef4444`) = offline/error, Amber (`#f59e0b`) = warning, Gray (`#6b7280`) = unknown/inactive |
| **Typography** | Inter (UI) / JetBrains Mono (data, IPs, MACs) |
| **Spacing** | Consistent 4px grid, generous padding inside cards |
| **Animations** | Subtle transitions (150ms ease). Status dots pulse gently when online. No gratuitous animation. |

### Layout

```
┌──────────────────────────────────────────────────────────────┐
│  ┌─────┐                                         🔔  👤     │
│  │ PAN │  Panoptikon           Search...                     │
│  └─────┘                                                     │
├──────────┬───────────────────────────────────────────────────┤
│          │                                                    │
│  Dashboard                                                    │
│  Devices      ← Main content area                            │
│  Agents          (full width, scrollable)                     │
│  Assets                                                       │
│  SSH Hosts                                                    │
│  Router                                                       │
│  Caddy                                                        │
│  Unbound                                                      │
│  CF Tunnel                                                    │
│  NPM                                                          │
│  Services                                                     │
│  Topology                                                     │
│  Traffic                                                      │
│  Alerts                                                       │
│  Certificates                                                 │
│  Settings                                                     │
│          │                                                    │
│  [WS: ●] [Caddy: ●] v0.6.0                                 │
└──────────┴───────────────────────────────────────────────────┘
```

- **Sidebar:** Fixed, collapsible (icon-only mode), 240px expanded, with connection status indicators (WebSocket, NPM)
- **Top bar:** App name/logo, global search, notification bell, user menu
- **Content area:** Full remaining width, no max-width constraint (use the space)

### Key UI Components

**Device Card (in grid view):**
```
┌──────────────────────────────┐
│  🟢  docker-lxc              │
│  10.10.0.25                  │
│  52:54:00:12:34:56           │
│  QEMU / KVM                  │
│                              │
│  ↓ 12.3 Mbps  ↑ 3.1 Mbps   │
│  CPU 12%  RAM 38%  (agent)  │
└──────────────────────────────┘
```

**Device Card (no agent, discovery only):**
```
┌──────────────────────────────┐
│  🟢  iPhone (Oleg)           │
│  10.10.0.112                 │
│  AA:BB:CC:DD:EE:FF           │
│  Apple, Inc.                 │
│  iOS · iPhone SE 2022        │
│                              │
│  Last seen: 2 min ago        │
└──────────────────────────────┘
```

### Responsive Behavior

- **Desktop first** (this is a dashboard, primary use is desktop/laptop)
- Minimum supported width: 1024px
- Sidebar collapses to icons at <1280px
- Device grid: auto-fill columns, min 280px per card
- Topology view: full-screen toggle available
- Tablet (768px+): usable but not optimized
- Phone: not a priority (if it works, great; don't break things for it)

### Interactions

- **Click device** → slide-in detail panel from right (don't navigate away from the list)
- **Click alert** → navigate to relevant device
- **Topology nodes** → hover shows tooltip, click opens device detail
- **Real-time updates** → WebSocket pushes new device states; UI updates without polling (green dot appears, counters tick up, etc.)

---

## 9. Data Model

### SQLite Schema (Draft)

```sql
-- ============================================
-- Core tables
-- ============================================

CREATE TABLE settings (
    key     TEXT PRIMARY KEY,
    value   TEXT NOT NULL
);
-- Stores: admin_password_hash, mikrotik_url, mikrotik_username, mikrotik_password,
--         vyos_url, vyos_api_key, npm_url, npm_email, npm_password,
--         scan_interval, webhook_url, etc.

CREATE TABLE devices (
    id              TEXT PRIMARY KEY,  -- UUID
    mac             TEXT NOT NULL UNIQUE,
    name            TEXT,              -- User-assigned friendly name
    hostname        TEXT,              -- Discovered via DHCP/mDNS
    vendor          TEXT,              -- OUI lookup result
    icon            TEXT DEFAULT 'device',  -- device, server, phone, laptop, iot, printer, etc.
    notes           TEXT,
    is_known        INTEGER DEFAULT 0, -- 0 = unknown/new, 1 = user acknowledged
    is_favorite     INTEGER DEFAULT 0,
    first_seen_at   TEXT NOT NULL,     -- ISO 8601
    last_seen_at    TEXT NOT NULL,
    is_online       INTEGER DEFAULT 0,
    -- Device fingerprinting fields
    device_type     TEXT,              -- phone, tablet, laptop, desktop, router, printer, iot, etc.
    os_family       TEXT,              -- iOS, Android, Windows, Linux, macOS, etc.
    os_version      TEXT,
    device_brand    TEXT,              -- Apple, Samsung, Google, etc.
    device_model    TEXT,              -- iPhone SE 2022, Galaxy S24, etc.
    enrichment_source TEXT,           -- dhcp, mdns, hostname, ttl, oui, manual
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_devices_mac ON devices(mac);
CREATE INDEX idx_devices_online ON devices(is_online);

CREATE TABLE device_ips (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id   TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    ip          TEXT NOT NULL,
    subnet      TEXT,              -- e.g., "10.10.0.0/24"
    seen_at     TEXT NOT NULL,
    is_current  INTEGER DEFAULT 1,
    UNIQUE(device_id, ip)
);

CREATE INDEX idx_device_ips_ip ON device_ips(ip);

CREATE TABLE device_state_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id   TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    state       TEXT NOT NULL,     -- 'online' or 'offline'
    changed_at  TEXT NOT NULL
);

CREATE INDEX idx_device_state_log_device ON device_state_log(device_id, changed_at);

-- ============================================
-- Agent tables
-- ============================================

CREATE TABLE agents (
    id              TEXT PRIMARY KEY,  -- UUID
    device_id       TEXT REFERENCES devices(id) ON DELETE SET NULL,
    api_key_hash    TEXT NOT NULL,     -- bcrypt hash
    name            TEXT,              -- User-assigned label
    platform        TEXT,              -- "linux-amd64", "darwin-arm64", etc.
    version         TEXT,              -- Agent software version
    is_online       INTEGER DEFAULT 0,
    last_report_at  TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE agent_reports (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id    TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    reported_at TEXT NOT NULL,
    hostname    TEXT,
    os_name     TEXT,
    os_version  TEXT,
    kernel      TEXT,
    arch        TEXT,
    uptime_secs INTEGER,
    cpu_count   INTEGER,
    cpu_percent REAL,
    load_1m     REAL,
    load_5m     REAL,
    load_15m    REAL,
    mem_total   INTEGER,  -- bytes
    mem_used    INTEGER,
    swap_total  INTEGER,
    swap_used   INTEGER
);

CREATE INDEX idx_agent_reports_agent ON agent_reports(agent_id, reported_at);

CREATE TABLE agent_report_disks (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_report_id INTEGER NOT NULL REFERENCES agent_reports(id) ON DELETE CASCADE,
    mount           TEXT NOT NULL,
    filesystem      TEXT,
    total_bytes     INTEGER,
    used_bytes      INTEGER
);

CREATE TABLE agent_report_network (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_report_id INTEGER NOT NULL REFERENCES agent_reports(id) ON DELETE CASCADE,
    interface_name  TEXT NOT NULL,
    mac             TEXT,
    addresses       TEXT,  -- JSON array of CIDR strings
    tx_bytes        INTEGER,
    rx_bytes        INTEGER,
    tx_bytes_delta  INTEGER,
    rx_bytes_delta  INTEGER,
    speed_mbps      INTEGER,
    state           TEXT
);

-- ============================================
-- Traffic & metrics (aggregated)
-- ============================================

CREATE TABLE traffic_samples (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id   TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    sampled_at  TEXT NOT NULL,
    tx_bps      INTEGER,  -- bits per second
    rx_bps      INTEGER,
    source      TEXT      -- 'agent', 'mikrotik', 'vyos', 'netflow', 'scan'
);

CREATE INDEX idx_traffic_samples_device ON traffic_samples(device_id, sampled_at);

-- Aggregated tables (populated by background task)
CREATE TABLE traffic_hourly (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id   TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    hour        TEXT NOT NULL,      -- "2026-02-19T16:00:00Z"
    avg_tx_bps  INTEGER,
    avg_rx_bps  INTEGER,
    max_tx_bps  INTEGER,
    max_rx_bps  INTEGER,
    samples     INTEGER
);

CREATE TABLE traffic_daily (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id   TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    day         TEXT NOT NULL,      -- "2026-02-19"
    avg_tx_bps  INTEGER,
    avg_rx_bps  INTEGER,
    max_tx_bps  INTEGER,
    max_rx_bps  INTEGER,
    total_tx_bytes INTEGER,
    total_rx_bytes INTEGER,
    samples     INTEGER
);

-- ============================================
-- Alerts
-- ============================================

CREATE TABLE alerts (
    id          TEXT PRIMARY KEY,  -- UUID
    type        TEXT NOT NULL,     -- 'device_online', 'device_offline', 'new_device', 'high_bandwidth', 'agent_offline'
    device_id   TEXT REFERENCES devices(id) ON DELETE CASCADE,
    agent_id    TEXT REFERENCES agents(id) ON DELETE CASCADE,
    message     TEXT NOT NULL,
    details     TEXT,              -- JSON blob for type-specific data
    is_read     INTEGER DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_alerts_unread ON alerts(is_read, created_at);
CREATE INDEX idx_alerts_device ON alerts(device_id, created_at);

-- ============================================
-- Retention policy (enforced by background task)
-- ============================================
-- traffic_samples: keep 48 hours (raw)
-- traffic_hourly:  keep 90 days
-- traffic_daily:   keep 2 years
-- agent_reports:   keep 7 days (detail), aggregate into traffic_samples
-- device_state_log: keep 1 year
-- alerts:          keep 90 days
```

### Data Retention

A background task runs every hour to:
1. Aggregate `traffic_samples` older than 1 hour → `traffic_hourly`
2. Aggregate `traffic_hourly` older than 24 hours → `traffic_daily`
3. Delete `traffic_samples` older than 48 hours
4. Delete `agent_reports` older than 7 days (metrics already aggregated)
5. Delete `alerts` older than 90 days
6. Run `VACUUM` weekly (configurable)

Data retention is configurable via Settings → Data Retention.

This keeps the SQLite database small and fast. Target: <100 MB for a network with 50 devices, 10 agents, 1 year of history.

---

## 10. Test Environment

Testing has two deliberately separate profiles. The current MikroTik Controller
lab remains shipped infrastructure. The planned Proxmox Gateway VM fabric is the
mandatory place for native packet-path and recovery work.

| Profile | Purpose | Status |
|---|---|---|
| MikroTik CHR + LXC clients | Validate current managed-router APIs, discovery, DHCP, VLANs, and UI workflows | **Current** |
| Isolated Proxmox Gateway VM + synthetic WAN/LAN/recovery peers | Validate Linux forwarding, Core/routerd loss, commit-confirm, rollback, upgrade, and last-known-good behavior | **Planned** and currently **blocked** pending fabric setup |
| ER605 V1 | Destructive flash/serial/recovery exercises only | **Planned** sacrificial HIL; not the reference appliance |

The working production router and current Controller-mode LXC 115 are explicitly
excluded from Gateway experiments. See
[`test-environment.md`](./test-environment.md) and
[`test-plan.md`](./test-plan.md) for the detailed packet-path/failure matrix.

### Current Controller topology

```
Proxmox Host
├── MikroTik CHR (10.10.0.125) ← gateway/router under test
├── pan-test-web  (CT 200, 10.10.0.200, 256MB) — web server, HTTP traffic
├── pan-test-db   (CT 201, 10.10.0.201, 256MB) — database workload sim
├── pan-test-iot  (CT 202, 10.10.0.202, 128MB) — minimal DHCP client
└── Panoptikon    (10.10.0.14:8080) — monitors all of the above
```

All test containers use `10.10.0.125` as their default gateway, placing them behind the MikroTik CHR for realistic routing, DHCP, and firewall testing.

### Current automated setup

```bash
# Create test containers (run on Proxmox host)
sudo bash scripts/setup-test-env.sh create

# Check status
sudo bash scripts/setup-test-env.sh status

# Tear down
sudo bash scripts/setup-test-env.sh destroy
```

The script (`scripts/setup-test-env.sh`) handles container creation, template download, package installation, and cleanup.

### What the current lab validates

| Feature              | How It's Tested                                                    |
|----------------------|--------------------------------------------------------------------|
| DHCP lease tracking  | Containers request leases from MikroTik; Panoptikon discovers them |
| Traffic monitoring   | Containers generate HTTP/DNS traffic; per-device bandwidth charts  |
| Firewall rules       | Add/remove MikroTik filter rules; verify visibility in Panoptikon  |
| VLAN integration     | Assign VLAN tags on MikroTik; verify topology grouping             |
| Device discovery     | ARP scanner + mDNS detect all containers on the subnet             |

Full validation procedures with step-by-step commands are documented in [`docs/test-environment.md`](./test-environment.md).

---

## 11. Milestones / MVP Scope

### Milestone 0: Project Scaffolding ✅

- [x] Repository setup (monorepo: `/server`, `/web`)
- [x] Rust workspace with axum skeleton (hello world, health endpoint)
- [x] Next.js project with Tailwind + shadcn/ui configured, dark theme
- [x] SQLite database setup with sqlx migrations
- [x] CI: GitHub Actions for Rust build + frontend build + lint
- [x] Basic Dockerfile

### Milestone 1: MVP — Device Discovery + Dashboard ✅

- [x] **Authentication:** Password setup, login, session cookies, rate limiting
- [x] **MikroTik client:** Connect to RouterOS 7+ REST API, fetch system status, interfaces, DHCP leases, routes, firewall, DNS, WireGuard
- [x] **VyOS client:** Connect, fetch interfaces, DHCP leases, basic stats (legacy optional, lazy-loaded, hidden by default unless legacy routers are enabled)
- [x] **ARP scanner:** Periodic subnet scan, discover devices (active + passive)
- [x] **mDNS/SSDP discovery:** Passive device discovery via Bonjour and UPnP
- [x] **Device management:** List, auto-create on discovery, manual edit (name, icon, notes)
- [x] **Device fingerprinting:** Multi-layer enrichment (DHCP, hostname, mDNS, TTL, OUI) for automatic OS/type/brand/model detection
- [x] **OUI lookup:** Embedded vendor database, MAC → vendor resolution
- [x] **Dashboard:** Router status card, device count, top devices, recent activity
- [x] **Device list page:** Table/grid view, search, filter by online/offline/known
- [x] **Online/offline detection:** State change tracking, ping-based uptime monitoring
- [x] **Alerts:** New device, offline/online state changes, in-app feed with severity filtering
- [x] **WebSocket:** Live updates to UI when device state changes
- [x] **Settings page:** MikroTik connection (default), VyOS connection (legacy optional, hidden by default), Caddy connection, Unbound connection, Cloudflare Tunnel, NPM connection, scanner config, webhook, data retention, speedtest, audit log, config backup, password change

### Milestone 2: Agents + Traffic + SSH ✅

- [x] **Agent binary:** Cross-compiled for multiple targets
- [x] **Agent registration:** API key generation, agent management UI, binary installer download
- [x] **Agent reports endpoint:** Receive, validate, store via WebSocket
- [x] **Device ↔ Agent linking:** Match agent's MAC to discovered device
- [x] **Traffic monitoring:** Per-device bandwidth graphs (1h/24h/7d/30d), NetFlow collector
- [x] **Data aggregation:** Background rollup tasks (per-minute → hourly)
- [x] **SSH monitoring:** Agentless remote machine monitoring with connection pooling
- [x] **IT asset inventory:** Full asset management with type, location, owner, hardware details

### Milestone 3: Topology + Polish + Integrations ✅

- [x] **Topology view:** SVG network map with d3-force layout
- [x] **Manual topology editing:** Pin positions (persisted)
- [x] **Extended alerts:** Webhook delivery (Discord, ntfy.sh, Telegram, generic JSON), bandwidth thresholds
- [x] **Alert management:** Acknowledge, read/unread, severity filtering
- [x] **Search:** Global search across devices, agents, alerts, SSH hosts, assets
- [x] **Export:** CSV/JSON export for devices, traffic, alerts, assets
- [x] **Prometheus metrics:** `/metrics` endpoint
- [x] **NPM integration:** Full Nginx Proxy Manager management (proxy hosts, redirections, SSL, streams, dead hosts, access lists)
- [x] **Caddy proxy manager:** Admin API integration for reverse proxy management (replaces NPM as primary)
- [x] **Unbound DNS manager:** Local DNS records, blocklists, query log visualization
- [x] **Cloudflare Tunnel management:** Tunnel status, ingress rules, optional Docker Compose service
- [x] **Services wizard:** Unified NPM + VyOS firewall + DNAT deployment
- [x] **Speedtest:** Ookla integration with scheduling and history
- [x] **Audit log:** Router operation tracking
- [x] **Config backup:** VyOS configuration backup/restore with diff viewing
- [x] **Cmd+K command palette:** Quick navigation and action execution
- [x] **Framer Motion animations:** Smooth card transitions and micro-interactions
- [x] **Device type icons:** Visual device identification in lists and topology
- [x] **Dashboard sparklines:** Inline bandwidth charts on dashboard cards

### Milestone 4: Current Controller Hardening (In Progress)

- [x] **Xiaomi BE3600 mesh integration:** WiFi client list, mesh topology (4 nodes), signal strength monitoring, device list, firmware status, WAN/LAN info, per-band WiFi details
- [ ] **Docker Compose packaging:** Docker Hub releases, automated image builds
- [ ] **DNS test setup:** Configure Unbound as the network-wide DNS resolver
- [ ] **Managed-router support:** keep MikroTik primary while preserving pfSense
  and legacy VyOS behavior for existing Controller deployments
- [ ] **UI cleanup:** Polish, consistency, responsive improvements

### Milestone 5: Gateway Contract and Isolated Fabric (Planned)

- [ ] Version the capability/desired-state/plan/transaction/result contract
- [ ] Add an unprivileged simulator with stale-revision and failure injection
- [ ] Build the isolated Proxmox Gateway VM fabric with synthetic WAN, LAN,
  management, and out-of-band recovery paths
- [ ] Prove that the working production router and Controller-mode LXC 115 are not
  reachable from destructive Gateway tests

Native forwarding remains **blocked** until this milestone's isolation gate passes.

### Milestone 6: Recoverable x86-64 Gateway (Planned)

- [ ] Split `panoptikon-core` from privileged `panoptikon-routerd`
- [ ] Use a restricted Unix socket for co-located communication
- [ ] Implement native Linux/Netlink adapters for approved capabilities
- [ ] Preserve forwarding during Core or transport loss
- [ ] Implement commit-confirm, last-known-good reconciliation, and tested
  out-of-band recovery
- [ ] Pass the packet-path and failure matrix repeatedly in the Proxmox fabric

Production Gateway claims are **blocked** until every recovery invariant passes.

### Milestone 7: Panoptikon Edge / OpenWrt (Planned)

- [ ] Select supported targets based on resources and recoverability
- [ ] Package the Edge runtime separately from the x86 Gateway
- [ ] Implement the OpenWrt `ubus`/UCI adapter and remote mTLS transport
- [ ] Validate offline operation, upgrades, rollback, and per-target capabilities
- [ ] Use ER605 V1 only for sacrificial HIL/recovery testing

### Controller backlog (Planned)

- [ ] **Port scanning:** On-demand port scan with service identification
- [ ] **LAN speed test:** iperf3 between server and agents
- [ ] **Agent auto-update:** Server pushes updates to agents
- [ ] **Topology:** Subnet grouping, device type grouping
- [ ] **Release pipeline:** GitHub Releases, pre-built binaries (4 platforms + agent binaries)

---

## 12. Open Questions

### Architecture & Design — Resolved

| # | Question | Resolution |
|---|----------|------------|
| Q1 | **License: MIT or Apache 2.0?** | MIT — simpler, more permissive, homelab community prefers it. |
| Q2 | **Monorepo or separate repos?** | Monorepo — server and frontend tightly coupled. One repo, one version, one CI. |
| Q3 | **Next.js App Router or Pages Router?** | App Router — stable, Server Components for initial load. |
| Q4 | **Should the frontend be SSR or static export?** | Static export — embedded in Rust binary, no Node.js runtime at deploy time. |
| Q5 | **Router API key storage?** | SQLite — stored in settings table. |
| Q11 | **Should we support multiple routers?** | Yes — MikroTik is primary/default, pfSense remains supported, and VyOS is legacy optional and hidden unless explicitly enabled. |
| Q15 | **Can Panoptikon own the data plane?** | Yes, in the planned Gateway/Edge profiles. Current Controller behavior remains supported. |
| Q16 | **Where does privileged networking run?** | In a separate `panoptikon-routerd` process; Core remains unprivileged. |
| Q17 | **How do local and remote deployments communicate?** | Restricted Unix socket locally; mTLS remotely; one versioned semantic contract. |

### Technical Unknowns — Mostly Resolved

| # | Question | Status |
|---|----------|--------|
| Q6 | **MikroTik API compatibility** | Resolved: targeting RouterOS 7+ REST API. |
| Q7 | **ARP scanning without root** | Resolved: recommend `CAP_NET_RAW`. Fallback to passive discovery (mDNS, SSDP, DHCP leases). |
| Q8 | **Agent auto-update mechanism** | Deferred: agents report version, user manually updates. |
| Q9 | **Time-series database migration** | Resolved: SQLite with aggregation tables works well for <100 devices. |
| Q10 | **mDNS/DNS-SD for hostname discovery** | Resolved: mDNS passive listener implemented. |
| Q18 | **Which Linux networking APIs and capability subset ship first?** | Open; validate the smallest Netlink-backed slice in the isolated Proxmox fabric. |
| Q19 | **What commit-confirm health signal is independent enough?** | Open and **blocking**; it must detect loss of management and packet-path reachability without relying only on Core. |
| Q20 | **Which OpenWrt targets are supportable?** | Open; decide from storage/RAM, kernel/API availability, upgrade path, and proven recovery. ER605 V1 does not set the product baseline. |

### Product Questions

| # | Question | Notes |
|---|----------|-------|
| Q12 | **Should agents support custom plugins/checks?** | Deferred to post-v1. Keep the agent payload fixed. |
| Q13 | **Is there value in a mobile companion app?** | No. Responsive web is sufficient. |
| Q14 | **Community features: device database, shared OUI updates?** | No phone-home. OUI database ships with the binary. |
| Q21 | **How does a Controller deployment migrate to Gateway?** | Open; migration must be reversible and must not repurpose the production router or LXC 115 as an experiment target. |
| Q22 | **How are queued desired-state changes presented while Edge is offline?** | Open; the UI must distinguish queued intent, stale observation, unknown outcome, and confirmed apply. |

---

## Appendix A: MikroTik RouterOS REST API Reference

The MikroTik RouterOS 7+ REST API exposes resources at `https://<router>/rest/`:

```
GET  /rest/system/resource         → system status (CPU, memory, uptime, board)
GET  /rest/interface                → all interfaces (name, type, MAC, TX/RX bytes)
GET  /rest/ip/address               → IP addresses
GET  /rest/ip/route                 → routing table
POST /rest/ip/route/add             → create static route
DELETE /rest/ip/route/<id>          → delete route
GET  /rest/ip/dhcp-server/lease     → DHCP leases
GET  /rest/ip/firewall/filter       → firewall filter rules
GET  /rest/ip/dns                   → DNS settings
PATCH /rest/ip/dns                  → update DNS settings
GET  /rest/interface/wireguard      → WireGuard interfaces
GET  /rest/interface/wireguard/peers → WireGuard peers
```

Authentication: HTTP Basic Auth with RouterOS username and password. API must be enabled in RouterOS:

```
/ip service set api-ssl disabled=no
```

## Appendix B: VyOS HTTP API Reference

The VyOS HTTP API (available since VyOS 1.3) exposes these relevant endpoints:

```
POST /retrieve
  {"op": "showConfig", "path": ["interfaces"]}
  {"op": "show", "path": ["interfaces", "ethernet", "eth0"]}

POST /show
  {"op": "show", "path": ["interfaces"]}
  {"op": "show", "path": ["ip", "route"]}
  {"op": "show", "path": ["dhcp", "server", "leases"]}
  {"op": "show", "path": ["firewall"]}

POST /configure
  {"op": "set", "path": ["firewall", "name", "WAN_IN", ...]}
```

All requests require `key=<api_key>` parameter. API must be explicitly enabled in VyOS config:

```
set service https api keys id MY_KEY key 'your-api-key-here'
set service https api
```

## Appendix C: Similar / Related Projects

| Project | Similarity | Why Panoptikon is different |
|---------|-----------|------------------------|
| UniFi Network | UI inspiration | Proprietary, Ubiquiti hardware only |
| Fing | Device discovery | Proprietary, SaaS-heavy, no router integration |
| LibreNMS | Network monitoring | Enterprise-scale, PHP, complex setup, no agent system |
| Uptime Kuma | Alert/monitoring | HTTP endpoint monitoring only, no network scanning |
| Homepage (gethomepage.dev) | Dashboard | Widget-based, no network scanning or router management |
| Netdata | Agent monitoring | Excellent agent, but no network discovery or router management |
| The Dude (MikroTik) | Network monitoring | MikroTik-only, desktop app, no modern web UI, no asset management |

The current Controller's unique position is **managed-router operations (MikroTik,
pfSense, and legacy VyOS) + network discovery + device fingerprinting +
lightweight agents + embedded DNS (Unbound) + reverse proxy (Caddy) + Cloudflare
Tunnel + IT asset inventory**. The planned Gateway/Edge profiles extend that
product without pretending their forwarding and recovery features have shipped.

---

*This document is actively maintained. Last updated: 2026-07-23 (v0.8.0 —
Gateway roadmap aligned with #834; current Controller behavior separated from
planned and blocked Gateway/Edge work).*
