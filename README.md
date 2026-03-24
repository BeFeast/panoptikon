# Panoptikon

*The all-seeing eye for your home network.*

Panoptikon gives your homelab a local-first control surface for discovery, telemetry, and router operations — without shipping your network metadata to someone else's cloud.

**Panoptikon** is a self-hosted network operations dashboard that combines discovery, router management, asset intelligence, and lightweight telemetry in one operator-focused interface.

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
│  │ REST API │ │ WS Hub   │ │ Scanner  │ │ Router │  │
│  │          │ │          │ │ (ARP)    │ │ Client │  │
│  │          │ │          │ │          │ │MT/VyOS │  │
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
bun install
bun run dev
# Open http://localhost:3000
```

## Project Structure

```
panoptikon/
├── server/     # Rust axum backend (REST API, WebSocket hub, ARP scanner, MikroTik + VyOS router clients)
├── agent/      # Rust lightweight agent (system metrics collector)
└── web/        # Next.js 15 frontend (shadcn/ui, dark theme)
```

## Router Integration

Panoptikon provides a control plane for two router platforms:

- **MikroTik (primary/default)** — connects via the RouterOS 7+ REST API. Configure in **Settings → Router → MikroTik**.
- **VyOS (legacy/optional)** — connects via the VyOS HTTP API. Hidden by default for new users. To expose it, enable **Settings → Advanced → Show legacy routers**, then configure in **Settings → Router → VyOS (Legacy)**.

## Prometheus Integration

Panoptikon exposes operator-facing metrics at `GET /metrics` in [Prometheus text exposition format](https://prometheus.io/docs/instrumenting/exposition_formats/) — giving you network visibility in your existing monitoring stack. No authentication is required for this endpoint.

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

The multi-stage Dockerfile builds the Rust server and Next.js frontend into a minimal `debian:bookworm-slim` runtime image — self-hosted, single-binary, no external dependencies beyond what ships in the container.

**Important notes:**

- **`network_mode: host`** is required for ARP scanning and receiving NetFlow UDP packets on the host network.
- **`NET_RAW` capability** is required for nmap raw socket scanning.
- **`NET_ADMIN` capability** is required for ARP table access and network administration.
- Data (SQLite database) is persisted in a Docker volume mounted at `/data`.

## Philosophy

- **Self-hosted by default** — your network data stays on your network.
- **Privacy-first and operator-controlled** — no cloud accounts, no phone-home telemetry.
- **Transparent over magical** — configuration is explicit; behavior is predictable.
- **Powerful without becoming brittle** — one binary, one database, minimal moving parts.

## License

MIT
