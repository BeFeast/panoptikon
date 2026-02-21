# Panoptikon

*The all-seeing eye for your home network.*

**Panoptikon** is a self-hosted web application for managing a VyOS router and monitoring all devices on your local network. It combines device discovery (ARP scanning), router management (VyOS HTTP API), and lightweight agent-based telemetry into a single binary with a polished, dark-themed web UI inspired by Ubiquiti UniFi.

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Browser (User)                   │
│              Next.js SPA (shadcn/ui, dark)          │
└────────────┬────────────────────┬───────────────────┘
             │ REST (CRUD)        │ WebSocket (live)
             ▼                    ▼
┌─────────────────────────────────────────────────────┐
│                Rust API Server (axum)               │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐  │
│  │ REST API │ │ WS Hub   │ │ Scanner  │ │ VyOS   │  │
│  │          │ │          │ │ (ARP)    │ │ Client │  │ 
│  └──────────┘ └──────────┘ └──────────┘ └────────┘  │
│                     │                               │
│              ┌──────┴──────┐                        │
│              │   SQLite    │                        │
│              └─────────────┘                        │
└─────────────────────┬───────────────────────────────┘
                      │ WebSocket (persistent)
          ┌───────────┼───────────┐
          ▼           ▼           ▼
     ┌─────────┐ ┌─────────┐ ┌─────────┐
     │ Agent   │ │ Agent   │ │ Agent   │
     └─────────┘ └─────────┘ └─────────┘
```

📋 **[Product Requirements Document (PRD)](docs/PRD.md)** — full feature spec, architecture decisions, and roadmap.

---

## Quick Start

### Prerequisites

- Rust 1.75+ (install via [rustup](https://rustup.rs))
- Node.js 20+ (for frontend development only)

### Build & Run

```bash
# Clone the repository
git clone https://github.com/olegkossoy/panoptikon.git
cd panoptikon

# Build the server
cargo build --release -p panoptikon-server

# Run the server
./target/release/panoptikon-server --listen 0.0.0.0:8080

# Build the agent (on a target machine)
cargo build --release -p panoptikon-agent
./target/release/panoptikon-agent --config /etc/panoptikon/config.toml
```

### Frontend Development

```bash
cd web
npm install
npm run dev
# Open http://localhost:3000
```

## Project Structure

```
panoptikon/
├── server/     # Rust axum backend (REST API, WebSocket hub, ARP scanner, VyOS client)
├── agent/      # Rust lightweight agent (system metrics collector)
└── web/        # Next.js 15 frontend (shadcn/ui, dark theme)
```

## Prometheus Integration

Panoptikon exposes metrics at `GET /metrics` in [Prometheus text exposition format](https://prometheus.io/docs/instrumenting/exposition_formats/). No authentication is required for this endpoint.

**Exported metrics:**

| Metric | Type | Description |
|--------|------|-------------|
| `panoptikon_devices_online_total` | gauge | Devices currently online |
| `panoptikon_devices_offline_total` | gauge | Devices currently offline |
| `panoptikon_devices_total` | gauge | Total discovered devices |
| `panoptikon_agents_online_total` | gauge | Agents seen in the last 120 s |
| `panoptikon_alerts_total{severity,status}` | gauge | Alerts by severity × status |
| `panoptikon_traffic_rx_bps{device_id,ip}` | gauge | Latest RX bps per device |
| `panoptikon_traffic_tx_bps{device_id,ip}` | gauge | Latest TX bps per device |
| `panoptikon_netflow_flows_received_total` | counter | Total NetFlow v5 records received |

**Prometheus scrape config example (`prometheus.yml`):**

```yaml
scrape_configs:
  - job_name: panoptikon
    static_configs:
      - targets: ['localhost:8080']
```

## Docker Deployment

Build and run Panoptikon in a container:

```bash
# Build the image
docker build -t panoptikon .

# Run with docker-compose (recommended)
docker-compose up -d
```

The multi-stage Dockerfile builds the Rust server, Next.js frontend, and packages them into a minimal `debian:bookworm-slim` runtime image with `nmap` and `iperf3` pre-installed.

**Important notes:**

- **`network_mode: host`** is required for ARP scanning and receiving NetFlow UDP packets on the host network.
- **`NET_RAW` capability** is required for nmap raw socket scanning.
- **`NET_ADMIN` capability** is required for ARP table access and network administration.
- Data (SQLite database) is persisted in a Docker volume mounted at `/data`.

## License

MIT
