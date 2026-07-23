# Panoptikon

*The all-seeing eye for your network.*

Panoptikon is building a local-first network control platform around a primary
**x86-64 co-located Gateway**, an isolated **Proxmox Gateway VM** verification
profile, and an embedded **Panoptikon Edge / OpenWrt** profile.

**Current:** the shipped product is a self-hosted Controller for discovery,
telemetry, asset intelligence, and managed-router operations through MikroTik
and pfSense integrations. **Planned:** native Gateway forwarding uses separate
`panoptikon-core` and privileged `panoptikon-routerd` processes. Native
forwarding, routerd, OpenWrt firmware, and commit-confirm are not implemented yet.
The former VyOS integration was removed by database migration 026 and is retained
only in explicitly historical design documents.

---

## Architecture and product profiles

```
                         Browser / API clients
                                  |
                                  v
                    +---------------------------+
                    |     panoptikon-core       |
                    | UI/API, telemetry, policy |
                    | desired state and history |
                    +-------------+-------------+
                                  |
                  capability / desired-state /
                      transaction contract
                                  |
             +--------------------+--------------------+
             | local Unix socket                       | remote mTLS
             v                                         v
  +---------------------------+             +---------------------------+
  | panoptikon-routerd        |             | panoptikon-routerd        |
  | x86 Linux/Netlink adapter |             | OpenWrt ubus/UCI adapter  |
  +---------------------------+             +---------------------------+

Current Controller path:
panoptikon-server ---- router APIs ----> MikroTik / pfSense
```

- [Product Requirements Document](docs/PRD.md)
- [Canonical Gateway architecture](docs/GATEWAY-ARCHITECTURE.md)
- [Gateway product decision (#834)](https://github.com/BeFeast/panoptikon/issues/834)

---

## Quick Start

### Prerequisites

- Rust 1.75+ (install via [rustup](https://rustup.rs))
- Node.js 20+ (for frontend development only)

### Build & Run

```bash
# Clone the repository
git clone https://github.com/BeFeast/panoptikon.git
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
├── server/     # Rust axum backend (API, WebSocket hub, discovery, managed-router clients)
├── agent/      # Rust lightweight agent (system metrics collector)
└── web/        # Next.js 15 frontend (shadcn/ui, dark theme)
```

## Router integration

Current Controller mode remains a supported product profile:

- **MikroTik (primary/default)** — connects via the RouterOS 7+ REST API. Configure in **Settings → Router → MikroTik**.
- **pfSense** — supported managed-router integration for existing deployments.
- **VyOS (historical/removed)** — no longer shipped. Migration 026 removes its
  settings and legacy-router visibility flag; the old design remains in
  [the archived VyOS PRD](docs/PRD-VyOS-Management.md) for reference only.

The planned Gateway and Edge profiles add native data-plane ownership through the
Core/routerd contract. They do not remove managed-router support.

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

## Current Controller deployment

Build and run Panoptikon in a container:

```bash
# Build the image
docker build -t panoptikon .

# Run with docker-compose (recommended)
docker-compose up -d
```

The multi-stage Dockerfile builds the current Rust Controller and Next.js frontend
into a minimal `debian:bookworm-slim` runtime image. This packaging describes the
current x86 Controller; it is not a promise that x86 Gateway and constrained
OpenWrt Edge targets will share one binary or backend.

**Important notes:**

- **`network_mode: host`** is required for ARP scanning and receiving NetFlow UDP packets on the host network.
- **`NET_RAW` capability** is required for nmap raw socket scanning.
- **`NET_ADMIN` capability** is required for ARP table access and network administration.
- Data (SQLite database) is persisted in a Docker volume mounted at `/data`.

## Philosophy

- **Self-hosted by default** — your network data stays on your network.
- **Privacy-first and operator-controlled** — no cloud accounts, no phone-home telemetry.
- **Transparent over magical** — configuration is explicit; behavior is predictable.
- **Powerful without becoming brittle** — explicit contracts, bounded privilege,
  recoverable changes, and minimal moving parts per deployment profile.

## License

MIT
