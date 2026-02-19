# Panoptikon — Router & Network Monitor

## Product Requirements Document

**Version:** 0.1.0-draft  
**Author:** Oleg Kossoy (concept) / AI-assisted (document)  
**Date:** 2026-02-19  
**Status:** Draft  

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
10. [Milestones / MVP Scope](#10-milestones--mvp-scope)
11. [Open Questions](#11-open-questions)

---

## 1. Overview & Vision

**Panoptikon** is a self-hosted web application for managing a VyOS router and monitoring all devices on a local network. Think of it as a mashup of **Ubiquiti UniFi's web console** (the dark theme, the topology map, the polished device cards) and **Fing** (network scanning, device discovery, online/offline tracking) — but open-source, opinionated toward VyOS, and extensible via lightweight agents.

The name references Bentham's panopticon — the all-seeing observation tower — reimagined as a personal tool: *you* are the observer, your home network is the space. The `k` spelling makes it unique and ownable.

**The one-liner:** A beautiful, UniFi-inspired control plane for your VyOS home/lab network.

**Vision:** You open a single browser tab and see your entire network: the router's health, every device's status, bandwidth graphs, and alerts — all in a dark, information-dense UI that feels like a professional network operations center, not a hobbyist tool.

---

## 2. Problem Statement

Running a VyOS router in a home lab or small office gives you powerful networking capabilities, but the management experience is CLI-only. Meanwhile:

- **VyOS has no built-in web GUI** for day-to-day monitoring. You SSH in, run `show interfaces`, and parse text output.
- **Network monitoring** requires separate tools: Fing (proprietary, SaaS-leaning), nmap (CLI), Zabbix/LibreNMS (massive overkill for a home network).
- **Device awareness** is fragmented. You don't know what's on your network without actively scanning. New devices appear silently. Devices go offline without notification.
- **Agent-based monitoring** (CPU, RAM, traffic per host) typically means deploying Prometheus + node_exporter + Grafana — a stack heavier than the machines being monitored.

There is no single, lightweight, self-hosted tool that combines router management + network monitoring + agent telemetry in a polished web UI.

---

## 3. Target User

**Primary persona:** A technical user (developer, sysadmin, homelab enthusiast) who:

- Runs VyOS as their primary router (bare metal, VM, or container)
- Has 10–100 devices on the network (servers, workstations, IoT, phones)
- Wants visibility into their network without deploying a full monitoring stack
- Values self-hosting, open source, and low resource usage
- Is comfortable with CLI for initial setup but wants a GUI for day-to-day operations

**Not targeting:**

- Enterprise networks (hundreds of switches, SNMP polling at scale)
- Non-technical users who need a plug-and-play router GUI
- Multi-site / multi-router deployments (initially)

---

## 4. Goals & Non-Goals

### Goals

| # | Goal |
|---|------|
| G1 | Provide a single-pane-of-glass view for a VyOS-based network |
| G2 | Auto-discover and track all devices on the local network |
| G3 | Offer optional lightweight agents for deep host-level telemetry |
| G4 | Deliver a polished, UniFi-quality dark UI |
| G5 | Keep resource usage minimal — the server should run on a Raspberry Pi 4 |
| G6 | Be easy to deploy: single binary + SQLite, no external dependencies |
| G7 | Open-source (MIT or Apache 2.0) with a clean, contributor-friendly codebase |

### Non-Goals

| # | Non-Goal | Rationale |
|---|----------|-----------|
| NG1 | Support for non-VyOS routers (pfSense, OPNsense, MikroTik) | Focus first. Abstract later if there's demand. |
| NG2 | Full configuration management for VyOS | Read-first. We show config, not replace the CLI for complex changes. |
| NG3 | SNMP-based monitoring | Too complex, too legacy. Agents + ARP scanning cover our use cases. |
| NG4 | Multi-user / RBAC | Self-hosted, single-user. One admin password is enough. |
| NG5 | Cloud/SaaS features | No phone-home, no accounts, no telemetry. Fully local. |
| NG6 | Windows agents in MVP | Linux and macOS first. Windows later if demanded. |

---

## 5. Core Features

### P0 — Must Have (MVP)

#### F1: Dashboard
- Router status card: uptime, CPU, memory, interface summary
- Active devices count (online now / total known)
- Aggregate bandwidth (WAN in/out, current + sparkline)
- Recent alerts feed (last 20)

#### F2: Device Discovery & Management
- **ARP scan** on configurable subnets (default: all VyOS LAN interfaces)
- Scan runs on a schedule (default: every 60s) and on-demand
- MAC → vendor lookup via local OUI database (IEEE MA-L, embedded at build time)
- Device list with: IP, MAC, hostname (via DHCP lease or mDNS), vendor, first seen, last seen, online/offline status
- Manual device tagging: custom name, icon, notes, "known" vs "unknown" flag
- Online/offline history per device (state change log)

#### F3: VyOS Integration (Read-Only)
- Connect to VyOS HTTP API (`https://<router>/retrieve`, `/configure`, `/show`)
- Display: interfaces (name, IP, status, TX/RX counters), routing table, DHCP leases
- Firewall rules viewer (zone-based, parsed into a readable table)
- Connection test + health indicator in UI

#### F4: Authentication
- Single-user authentication: username + password (bcrypt-hashed, stored in SQLite)
- Session-based auth with HTTP-only secure cookie
- Initial setup wizard: set password on first launch
- API key for agent authentication (generated in UI, revocable)

#### F5: Alerts (Basic)
- New unknown device detected on network
- Known device went offline (after configurable grace period, default: 5 min)
- Known device came back online
- Alert delivery: in-app feed only (MVP)
- Alert storage in SQLite with read/unread status

### P1 — Should Have (v0.2)

#### F6: Agent System
- Lightweight Rust agent binary (~2–5 MB static binary)
- Reports: CPU usage, memory usage, disk usage, network interfaces + traffic counters, OS info, uptime
- Pre-built binaries for: `x86_64-linux-musl`, `aarch64-linux-musl`, `x86_64-apple-darwin`, `aarch64-apple-darwin`
- Agent management UI: list agents, status, last report time, install instructions (copy-paste curl one-liner)
- See [Section 7: Agent Design](#7-agent-design) for protocol details

#### F7: Traffic Monitoring
- Per-device bandwidth tracking (via VyOS interface counters + agent reports)
- Historical graphs: 1h / 24h / 7d / 30d views
- Charts library: Recharts (React-native, composable, good dark theme support)
- Data aggregation: raw samples → 1-min averages → 1-hour averages → 1-day averages (automatic rollup)

#### F8: Topology View
- Interactive network map: router at center, devices as nodes
- Auto-layout based on subnet membership (router → subnet group → devices)
- Device nodes show: icon (by type), name, IP, online/offline indicator
- Click device → slide-in detail panel
- Rendering: SVG with `d3-force` layout (not Canvas — better accessibility, easier interaction)
- Manual position pinning (drag a device, it stays there)

#### F9: Alerts (Extended)
- Webhook delivery (POST JSON to configurable URL → integrates with Telegram bots, Discord webhooks, ntfy, etc.)
- Alert rules: high bandwidth threshold, agent CPU/memory threshold
- Alert muting (per device or globally, with time window)

### P2 — Nice to Have (v0.3+)

#### F10: VyOS Configuration (Write)
- Edit firewall rules via GUI (create/modify/delete)
- Interface enable/disable toggle
- DHCP static mapping management
- DNS forwarding configuration
- **Requires careful UX**: confirmation dialogs, diff preview before apply, rollback support

#### F11: Wake-on-LAN
- Send WoL magic packet to known devices (by MAC address)
- Button on device card

#### F12: Port Scanning
- On-demand port scan of selected device (via nmap or custom Rust scanner)
- Known-ports display on device card
- Service identification (common ports → service name mapping)

#### F13: Network Speed Test

**P0 (MVP):**
- 🌐 **Internet speed** — Ookla speedtest CLI (`speedtest --format=json`). Run from the server. Shows download, upload, latency, jitter to nearest Ookla server.
- 🔁 **LAN throughput** — iperf3 between server and a target agent (server initiates, agent runs iperf3 server mode on demand via WebSocket command). Shows raw TCP throughput between any two points on the network.

**P1:**
- 📁 **SMB/NFS throughput** — mount a share, `dd` write/read test, report MB/s. Targets: TrueNAS shares. Useful for diagnosing NAS performance vs. network speed.
- 🌍 **HTTP throughput** — curl download from a local endpoint (e.g., nginx on the server serving a test file) or an external CDN. Complements iperf3 (iperf3 = raw TCP; HTTP = application-layer reality check).

**P2:**
- UDP jitter / packet loss — iperf3 UDP mode between agents
- Mesh latency heatmap — agents ping each other, results displayed as a matrix (useful for detecting asymmetric paths)

#### F14: Export & API
- REST API for all data (devices, alerts, metrics) — dogfood the same API the UI uses
- CSV/JSON export of device list, alert history, traffic data
- Prometheus metrics endpoint (`/metrics`) for integration with existing monitoring

---

## 6. Architecture & Tech Stack

### System Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Browser (User)                   │
│              Next.js SPA (shadcn/ui, dark)          │
└────────────┬────────────────────┬───────────────────┘
             │ REST (CRUD)        │ WebSocket (live updates)
             ▼                    ▼
┌─────────────────────────────────────────────────────┐
│                Rust API Server (axum)               │
│                                                     │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌─────────┐ │
│  │ REST API │ │ WS Hub   │ │ Scanner  │ │ VyOS    │ │
│  │(devices, │ │ (push    │ │ (ARP,    │ │ Client  │ │
│  │ alerts,  │ │  updates │ │  periodic│ │ (HTTP   │ │
│  │ agents)  │ │  to UI)  │ │  sweep)  │ │  API)   │ │
│  └──────────┘ └──────────┘ └──────────┘ └─────────┘ │
│                     │                               │
│            ┌────────┴────────┐                      │
│            │   SQLite (sqlx) │                      │
│            └─────────────────┘                      │
└─────────────────────┬───────────────────────────────┘
                      │ WebSocket (persistent, bidirectional)
          ┌───────────┼───────────┐
          ▼           ▼           ▼
     ┌─────────┐ ┌─────────┐ ┌─────────┐
     │ Agent   │ │ Agent   │ │ Agent   │
     │ (Linux) │ │ (macOS) │ │ (RPi)   │
     └─────────┘ └─────────┘ └─────────┘
     ↑ reports every 30s, instant offline detection,
       server can push commands (speedtest, scan, etc.)
```

### Tech Stack Justification

| Component | Choice | Why |
|-----------|--------|-----|
| **Backend language** | Rust | Performance (handles thousands of agent reports with minimal resources), single static binary deployment, strong type system prevents network-parsing bugs, excellent async ecosystem (tokio). Memory usage stays low even with many concurrent connections. |
| **Web framework** | axum | Tokio-native, tower middleware ecosystem, first-class WebSocket support, extractors pattern is clean. Most popular Rust web framework as of 2025. |
| **Database** | SQLite via sqlx | Zero-config, single-file, embedded. Perfect for self-hosted single-server deployment. sqlx gives compile-time query checking. Good enough for 100K+ devices (our ceiling is ~100). |
| **Frontend framework** | Next.js 14+ (App Router) | React ecosystem, good SSR story for initial load, excellent DX. Massive component ecosystem. |
| **UI components** | shadcn/ui + Tailwind CSS | Beautiful defaults, dark theme out of the box, accessible, copy-paste components (no dependency lock-in). Matches the polished UniFi aesthetic we're targeting. |
| **Charts** | Recharts | React-native, composable, responsive. Better DX than Chart.js for React apps. Good dark theme customization. |
| **Topology rendering** | SVG + d3-force | Accessible (DOM nodes, not canvas pixels), interactive (click/hover events are trivial), good enough performance for <200 nodes. |
| **Network scanning** | `pnet` (Rust) + system ARP table | `pnet` for raw ARP packet crafting when root, fallback to parsing `/proc/net/arp` or `arp -a` output. No nmap dependency required. |
| **OUI database** | Embedded IEEE MA-L CSV | Compiled into the binary. Updated on release. No runtime download needed. |

### Deployment Model

The server ships as a **single binary** with the Next.js frontend **statically exported and embedded** (using `rust-embed` or similar). This means:

```bash
# Install and run:
curl -L https://github.com/oleg/netgui/releases/latest/download/netgui-linux-amd64 -o netgui
chmod +x netgui
./netgui --listen 0.0.0.0:8080
# → SQLite database created at ./netgui.db
# → Open http://localhost:8080
```

No Docker required (though a Dockerfile will be provided). No Node.js runtime needed at deploy time. One binary, one database file.

### Reference Deployment: Proxmox + VyOS

**VyOS** runs as a **dedicated VM** on Proxmox (not the same container as NetGUI):
- VyOS VM: 2 vCPUs, 512 MB RAM, 2 NICs (WAN passthrough / VLAN + LAN bridge `vmbr0`)
- VyOS HTTP API enabled and reachable from LAN

**NetGUI** runs as an **unprivileged LXC** on the same Proxmox host:
- OS: Debian 12 (minimal)
- Resources: 1 vCPU, 256 MB RAM, 2 GB disk (mostly SQLite)
- Network: bridged to `vmbr0` (LAN) — **required** for ARP scanning to reach all devices
- Required capabilities: `CAP_NET_RAW` (ARP raw sockets via pnet), `CAP_NET_ADMIN` (interface operations)

```ini
# /etc/pve/lxc/<id>.conf (Proxmox LXC config)
net0: name=eth0,bridge=vmbr0,ip=10.10.0.X/24,gw=10.10.0.1
lxc.cap.keep: net_admin net_raw
```

**Why not the same VM as VyOS?**  
VyOS is a locked-down OS — packages installed outside the VyOS config system are wiped on upgrades. Mixing router OS with application code is a security and maintenance antipattern. Separate LXC = clean boundary: if NetGUI has a vulnerability, the router is not compromised.

**Why LXC and not a full VM?**  
NetGUI is a single Rust binary + SQLite. A full VM (with its own kernel) wastes resources. LXC with `net_raw`/`net_admin` capabilities gives everything needed: raw ARP sockets work, interface stats work, no privilege issues.

### Build Pipeline

```
Frontend (Next.js):  npm run build → static export → /out/
                                                      ↓
Backend (Rust):      cargo build --release ← rust-embed includes /out/
                                                      ↓
                              Single binary: netgui (~15-25 MB)
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

### Agent Authentication

- On first install, the agent receives an **API key** (generated in the NetGUI web UI under Agent Management).
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
netgui-agent
├── config.toml          # Server URL, API key, agent ID, report interval
├── collectors/
│   ├── cpu.rs           # /proc/stat (Linux), sysctl (macOS)
│   ├── memory.rs        # /proc/meminfo, sysctl
│   ├── disk.rs          # statvfs
│   ├── network.rs       # /proc/net/dev, getifaddrs
│   └── os.rs            # /etc/os-release, uname
└── main.rs              # Loop: collect → serialize → POST → sleep
```

**Config file** (`/etc/netgui-agent/config.toml`):

```toml
server_url = "http://10.10.0.25:8080"
api_key = "ngui_a1b2c3d4e5f6..."
agent_id = "550e8400-e29b-41d4-a716-446655440000"
report_interval_seconds = 30
```

**Target binary size:** 2–5 MB (static musl build, stripped, no debug symbols).

**Resource usage target:** <5 MB RSS, <0.1% CPU at 30s intervals.

### Agent Installation

The UI generates a one-liner for each platform:

```bash
# Linux (x86_64)
curl -fsSL http://10.10.0.25:8080/api/v1/agent/install/linux-amd64?key=ngui_a1b2... | sh

# Linux (aarch64 / Raspberry Pi)
curl -fsSL http://10.10.0.25:8080/api/v1/agent/install/linux-arm64?key=ngui_a1b2... | sh

# macOS (Apple Silicon)
curl -fsSL http://10.10.0.25:8080/api/v1/agent/install/darwin-arm64?key=ngui_a1b2... | sh
```

The install script:
1. Downloads the binary to `/usr/local/bin/netgui-agent`
2. Writes config to `/etc/netgui-agent/config.toml`
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
| **Theme** | Dark only (no light mode in MVP — focus and polish one thing) |
| **Background** | Near-black (`#0a0a0f` or similar), not pure black |
| **Cards** | Slightly elevated surfaces (`#16161f`), subtle border (`#2a2a3a`), rounded corners (8px) |
| **Accent color** | Electric blue (`#3b82f6`) for primary actions, active states, links |
| **Status colors** | Green (`#22c55e`) = online/healthy, Red (`#ef4444`) = offline/error, Amber (`#f59e0b`) = warning, Gray (`#6b7280`) = unknown/inactive |
| **Typography** | Inter (UI) / JetBrains Mono (data, IPs, MACs) |
| **Spacing** | Consistent 4px grid, generous padding inside cards |
| **Animations** | Subtle transitions (150ms ease). Status dots pulse gently when online. No gratuitous animation. |

### Layout

```
┌─────────────────────────────────────────────────────────┐
│  ┌─────┐                                    🔔  👤     │
│  │ N G │  NetGUI              Search...                 │
│  └─────┘                                                │
├─────────┬───────────────────────────────────────────────┤
│         │                                               │
│  📊 Dashboard                                           │
│  🗺  Topology   ← Main content area                    │
│  💻 Devices        (full width, scrollable)             │
│  🤖 Agents                                              │
│  🔀 Router                                              │
│  📈 Traffic                                             │
│  🔔 Alerts                                              │
│  ⚙  Settings                                           │
│         │                                               │
└─────────┴───────────────────────────────────────────────┘
```

- **Sidebar:** Fixed, collapsible (icon-only mode), 240px expanded
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
-- Stores: admin_password_hash, vyos_url, vyos_api_key, scan_interval, etc.

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
    source      TEXT      -- 'agent', 'vyos', 'scan'
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

This keeps the SQLite database small and fast. Target: <100 MB for a network with 50 devices, 10 agents, 1 year of history.

---

## 10. Milestones / MVP Scope

### Milestone 0: Project Scaffolding (Week 1)

- [ ] Repository setup (monorepo: `/server`, `/agent`, `/web`)
- [ ] Rust workspace with axum skeleton (hello world, health endpoint)
- [ ] Next.js project with Tailwind + shadcn/ui configured, dark theme
- [ ] SQLite database setup with sqlx migrations
- [ ] CI: GitHub Actions for Rust build + frontend build + lint
- [ ] Basic Dockerfile

### Milestone 1: MVP — Device Discovery + Dashboard (Weeks 2–4)

- [ ] **Authentication:** Password setup, login, session cookies
- [ ] **VyOS client:** Connect, fetch interfaces, DHCP leases, basic stats
- [ ] **ARP scanner:** Periodic subnet scan, discover devices
- [ ] **Device management:** List, auto-create on discovery, manual edit (name, icon, notes)
- [ ] **OUI lookup:** Embedded vendor database, MAC → vendor resolution
- [ ] **Dashboard:** Router status card, device count, recent activity
- [ ] **Device list page:** Table/grid view, search, filter by online/offline/known
- [ ] **Online/offline detection:** State change tracking, grace period
- [ ] **Alerts (basic):** New device, offline/online state changes, in-app feed
- [ ] **WebSocket:** Live updates to UI when device state changes
- [ ] **Static frontend embedding:** Build and embed Next.js output in Rust binary
- [ ] **Settings page:** VyOS connection, scan interval, password change

**MVP definition of done:** A user can download one binary, run it, set a password, connect to their VyOS router, and see all devices on their network in a polished dark UI with live online/offline status and alerts.

### Milestone 2: Agents + Traffic (Weeks 5–8)

- [ ] **Agent binary:** Cross-compiled for 4 targets
- [ ] **Agent registration:** API key generation, agent management UI
- [ ] **Agent reports endpoint:** Receive, validate, store
- [ ] **Device ↔ Agent linking:** Match agent's MAC to discovered device
- [ ] **Device detail panel:** Slide-in panel with agent telemetry (CPU, RAM, disk, network)
- [ ] **Traffic monitoring:** Per-device bandwidth graphs (Recharts)
- [ ] **Data aggregation:** Background rollup tasks
- [ ] **VyOS extended:** Routing table view, firewall rules viewer

### Milestone 3: Topology + Polish (Weeks 9–12)

- [ ] **Topology view:** SVG network map with d3-force layout
- [ ] **Manual topology editing:** Pin positions, group devices
- [ ] **Extended alerts:** Webhook delivery, bandwidth thresholds
- [ ] **Alert management:** Mute, acknowledge, filter
- [ ] **Search:** Global search across devices, IPs, MACs, names
- [ ] **Release pipeline:** GitHub Releases, pre-built binaries (4 platforms + agent binaries)
- [ ] **Documentation:** README, install guide, agent guide, screenshots
- [ ] **Landing page / demo:** Static page or screenshots for the repo

---

## 11. Open Questions

### Architecture & Design

| # | Question | Leaning | Notes |
|---|----------|---------|-------|
| Q1 | **License: MIT or Apache 2.0?** | MIT | Simpler, more permissive, homelab community prefers it. Apache 2.0 has patent clause which is nice but adds complexity. |
| Q2 | **Monorepo or separate repos?** | Monorepo | Server, agent, and frontend are tightly coupled. One repo, one version, one CI. |
| Q3 | **Next.js App Router or Pages Router?** | App Router | It's 2026, App Router is stable. Server Components for initial load, Client Components for interactive parts. |
| Q4 | **Should the frontend be SSR or static export?** | Static export | We embed it in the Rust binary. No Node.js runtime at deploy time. API calls from client-side. SSR is unnecessary for a single-user local dashboard. |
| Q5 | **VyOS API key storage: in SQLite or config file?** | SQLite (encrypted at rest with app-level key derived from admin password) | Simpler than managing a separate config file. But encryption adds complexity — might just store plaintext in SQLite for MVP and add encryption later. |

### Technical Unknowns

| # | Question | Impact | Plan |
|---|----------|--------|------|
| Q6 | **VyOS API compatibility across versions** | Could break VyOS integration | Test against VyOS 1.4 (sagitta) and 1.5 (circinus). Document minimum supported version. |
| Q7 | **ARP scanning without root** | Scanner won't work in unprivileged mode | Recommend running as root or with `CAP_NET_RAW`. Fallback: parse VyOS DHCP leases only (no active scanning). |
| Q8 | **Agent auto-update mechanism** | Without it, agents get stale | Defer to v0.3. For now, agents report their version; UI shows "update available" badge. User re-runs install script manually. |
| Q9 | **Time-series database migration** | SQLite may struggle with very high-frequency metrics at scale | Design the aggregation tables now. If SQLite becomes a bottleneck (unlikely for <100 devices), add optional InfluxDB/TimescaleDB backend behind a trait. |
| Q10 | **mDNS/DNS-SD for hostname discovery** | Some devices don't appear in DHCP leases | Implement mDNS listener in P1. For MVP, rely on DHCP lease hostnames from VyOS. |

### Product Questions

| # | Question | Notes |
|---|----------|-------|
| Q11 | **Should we support multiple VyOS routers?** | Not in MVP. Single router assumption simplifies everything. Revisit if people ask. |
| Q12 | **Should agents support custom plugins/checks?** | Tempting but scope-creepy. Defer to post-v1. Keep the agent payload fixed. |
| Q13 | **Is there value in a mobile companion app?** | No. Responsive web is sufficient. Native mobile app is a maintenance burden for a homelab tool. |
| Q14 | **Community features: device database, shared OUI updates?** | No phone-home. OUI database ships with the binary. Users can manually update. |

---

## Appendix A: VyOS HTTP API Reference

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
  (Not used in MVP — read-only first)
```

All requests require `key=<api_key>` parameter. API must be explicitly enabled in VyOS config:

```
set service https api keys id MY_KEY key 'your-api-key-here'
set service https api
```

## Appendix B: Similar / Related Projects

| Project | Similarity | Why NetGUI is different |
|---------|-----------|------------------------|
| UniFi Network | UI inspiration | Proprietary, Ubiquiti hardware only |
| Fing | Device discovery | Proprietary, SaaS-heavy, no router integration |
| LibreNMS | Network monitoring | Enterprise-scale, PHP, complex setup, no agent system |
| Uptime Kuma | Alert/monitoring | HTTP endpoint monitoring only, no network scanning |
| Homepage (gethomepage.dev) | Dashboard | Widget-based, no network scanning or router management |
| Netdata | Agent monitoring | Excellent agent, but no network discovery or router management |

NetGUI's unique position: **router management + network discovery + lightweight agents**, all in one polished self-hosted tool.

---

*This document is a living draft. Update it as decisions are made and implementation reveals new constraints.*
