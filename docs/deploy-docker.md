# Docker Compose Deployment Guide

Deploy Panoptikon with a single `docker compose up -d`. The stack includes:

| Service | Purpose |
|---|---|
| **panoptikon** | Rust backend + embedded Next.js UI |
| **caddy** | Reverse proxy with automatic HTTPS |
| **unbound** | Local DNS resolver |
| **cloudflared** | *(optional)* Cloudflare Tunnel ingress |

---

## Prerequisites

| Requirement | Minimum version |
|---|---|
| Docker Engine | 24+ |
| Docker Compose | v2+ (`docker compose` — no hyphen) |

```bash
docker --version          # Docker version 24.x+
docker compose version    # Docker Compose version v2.x+
```

---

## Quickstart

```bash
# 1. Clone the repository
git clone https://github.com/BeFeast/panoptikon.git
cd panoptikon

# 2. (Optional) Create a .env from the example
cp .env.example .env
# Edit .env to set router credentials, tunnel tokens, etc.

# 3. Start all services
docker compose up -d
```

Within a few minutes, all services will be running:

| Endpoint | URL |
|---|---|
| Panoptikon UI | `http://localhost:8080` |
| HTTPS (via Caddy) | `https://localhost` |
| Caddy admin API | `http://localhost:2019` |
| Unbound DNS | `localhost:53` (TCP + UDP) |

---

## Service Details

### Panoptikon

The main application. Serves the web UI and REST/WebSocket API on port 8080.

The container requires `NET_RAW` and `NET_ADMIN` capabilities for ARP scanning and network discovery. These are set in the Compose file.

Data is persisted in a Docker volume mounted at `/data` (SQLite database).

### Caddy

Automatically proxies HTTPS traffic to Panoptikon. The admin API is exposed on port 2019 so Panoptikon can manage Caddy configuration at runtime.

**Self-signed certificate (default):** The Caddyfile uses `:443`, which serves a self-signed certificate suitable for LAN access.

**Automatic Let's Encrypt:** Replace `:443` with your domain in `docker/caddy/Caddyfile`:

```caddyfile
panoptikon.example.com {
    reverse_proxy panoptikon:8080
}
```

Then restart Caddy:

```bash
docker compose restart caddy
```

### Unbound

A local recursive DNS resolver. Listens on port 53 (TCP + UDP) and 5335 for Pi-hole integration.

### Cloudflared (optional)

Start with the `tunnel` profile to enable Cloudflare Tunnel ingress:

```bash
# Set your tunnel token
echo "CLOUDFLARE_TUNNEL_TOKEN=your-token-here" >> .env

# Start with the tunnel profile
docker compose --profile tunnel up -d
```

---

## Environment Variables

All variables are optional. Copy `.env.example` to `.env` and fill in the values you need.

| Variable | Default | Description |
|---|---|---|
| `VYOS_URL` | *(empty)* | VyOS router HTTP API URL |
| `VYOS_API_KEY` | *(empty)* | VyOS API key |
| `MIKROTIK_URL` | *(empty)* | MikroTik REST API URL |
| `MIKROTIK_USER` | *(empty)* | MikroTik username |
| `MIKROTIK_PASSWORD` | *(empty)* | MikroTik password |
| `UNBOUND_CONTROL_PATH` | *(empty)* | Unbound control socket/endpoint |
| `CLOUDFLARE_TUNNEL_TOKEN` | *(empty)* | Cloudflare Tunnel token (for `--profile tunnel`) |

---

## Development

The `docker-compose.override.yml` file is loaded automatically and builds the image from the local Dockerfile:

```bash
# Build and run locally
docker compose up -d --build

# Rebuild after code changes
docker compose build panoptikon
docker compose up -d
```

For production-only settings (skip the override):

```bash
docker compose -f docker-compose.yml up -d
```

---

## Upgrade

```bash
docker compose pull
docker compose up -d
```

Data is stored on the `panoptikon-data` volume and is preserved across upgrades.

---

## Backup / Restore

### Backup

```bash
# Online backup (container running)
docker exec panoptikon sqlite3 /data/panoptikon.db ".backup '/data/backup.db'"
docker cp panoptikon:/data/backup.db ./panoptikon-backup-$(date +%F).db
```

### Restore

```bash
docker compose stop panoptikon
docker cp ./panoptikon-backup-2025-01-15.db panoptikon:/data/panoptikon.db
docker compose start panoptikon
```
