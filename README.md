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

## License

MIT
