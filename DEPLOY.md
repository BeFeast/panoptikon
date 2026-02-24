# Deployment Guide — Docker Compose

This guide covers deploying Panoptikon with Docker Compose, including HTTPS via Caddy and local DNS via Unbound.

---

## Prerequisites

| Requirement | Minimum version |
|---|---|
| Docker Engine | 24+ |
| Docker Compose | v2+ (`docker compose` — note: no hyphen) |
| `curl` | any recent version (for downloading files) |

Verify your installation:

```bash
docker --version        # Docker version 24.x+
docker compose version  # Docker Compose version v2.x+
```

---

## Quickstart

```bash
# 1. Download the Compose file
curl -O https://raw.githubusercontent.com/BeFeast/panoptikon/main/docker-compose.yml

# 2. Download supporting config files
mkdir -p docker/caddy docker/unbound
curl -o docker/caddy/Caddyfile \
  https://raw.githubusercontent.com/BeFeast/panoptikon/main/docker/caddy/Caddyfile
curl -o docker/unbound/unbound.conf \
  https://raw.githubusercontent.com/BeFeast/panoptikon/main/docker/unbound/unbound.conf

# 3. (Optional) Create a .env file to override defaults
cat > .env <<'EOF'
# DATABASE_PATH=/data/panoptikon.db
# VYOS_URL=https://192.168.1.1
# VYOS_API_KEY=your-vyos-api-key
EOF

# 4. Start all services
docker compose up -d
```

Panoptikon is now available at:

- **HTTPS:** `https://<your-host>` (port 443 — self-signed cert by default)
- **HTTP:** `http://<your-host>:8080` (direct, no TLS)

---

## Environment Variables Reference

All variables are optional. MikroTik, Caddy, and Unbound settings can also be configured at runtime through the web UI under **Settings**.

| Variable | Default | Description |
|---|---|---|
| `DATABASE_PATH` | `/data/panoptikon.db` | Path to the SQLite database inside the container. Stored on the `panoptikon-data` volume. |
| `VYOS_URL` | *(empty)* | VyOS router HTTP API URL (e.g. `https://192.168.1.1`). |
| `VYOS_API_KEY` | *(empty)* | API key for VyOS authentication. |
| `MIKROTIK_URL` | *(empty)* | MikroTik RouterOS REST API URL. Can also be set via the web UI. |
| `MIKROTIK_USER` | *(empty)* | MikroTik username. Can also be set via the web UI. |
| `MIKROTIK_PASSWORD` | *(empty)* | MikroTik password. Can also be set via the web UI. |
| `CADDY_ADMIN_URL` | *(empty)* | Caddy admin API endpoint. Can also be set via the web UI. |
| `UNBOUND_CONTROL_PATH` | *(empty)* | Unbound control socket/endpoint. Can also be set via the web UI. |
| `RUST_LOG` | `panoptikon_server=debug,tower_http=debug` | Controls server log verbosity. Uses the standard Rust [`tracing`](https://docs.rs/tracing) filter syntax. |

### Linux capabilities

The container requires two Linux capabilities (already set in the Compose file):

| Capability | Reason |
|---|---|
| `NET_RAW` | Required for nmap raw-socket scanning |
| `NET_ADMIN` | Required for ARP table access |

---

## Upgrade

```bash
# Pull the latest images
docker compose pull

# Recreate containers with the new images
docker compose up -d
```

Your data is stored on a persistent Docker volume (`panoptikon-data`) and is preserved across upgrades.

---

## Backup / Restore

### Backup

The SQLite database lives on the `panoptikon-data` volume at `/data/panoptikon.db`. Back it up with the SQLite `.backup` command for a consistent snapshot:

```bash
# Create a backup while the container is running
docker exec panoptikon sqlite3 /data/panoptikon.db ".backup '/data/backup.db'"

# Copy the backup to the host
docker cp panoptikon:/data/backup.db ./panoptikon-backup-$(date +%F).db
```

Alternatively, stop the container first and copy the database directly:

```bash
docker compose stop panoptikon
docker cp panoptikon:/data/panoptikon.db ./panoptikon-backup-$(date +%F).db
docker compose start panoptikon
```

### Restore

```bash
# Stop the service
docker compose stop panoptikon

# Copy the backup into the container
docker cp ./panoptikon-backup-2025-01-15.db panoptikon:/data/panoptikon.db

# Start the service
docker compose start panoptikon
```

---

## Reverse Proxy Setup

The included `docker-compose.yml` bundles a **Caddy** reverse proxy that automatically handles HTTPS. You can also use a Cloudflare Tunnel or expose the service directly.

### Option 1: Caddy auto-HTTPS (included)

By default, Caddy listens on ports 80 and 443 and proxies traffic to Panoptikon.

**Self-signed certificate (LAN only):** The default `Caddyfile` uses `:443`, which serves a self-signed certificate. This works for local/LAN access.

**Automatic Let's Encrypt certificate:** Replace `:443` with your domain name in `docker/caddy/Caddyfile`:

```caddyfile
panoptikon.example.com {
    reverse_proxy panoptikon:8080
}
```

Then restart Caddy:

```bash
docker compose restart caddy
```

Caddy will automatically obtain and renew a TLS certificate from Let's Encrypt. Make sure ports 80 and 443 are reachable from the internet and DNS points to your server.

### Option 2: Cloudflare Tunnel

If you don't want to expose ports 80/443 directly, use a [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/):

1. Remove or stop the Caddy service (optional — you can keep both):

   ```bash
   docker compose stop caddy
   ```

2. Install and authenticate `cloudflared`:

   ```bash
   docker run -d --name cloudflared --network panoptikon-net \
     cloudflare/cloudflared:latest tunnel --no-autoupdate run \
     --token <YOUR_TUNNEL_TOKEN>
   ```

3. In the Cloudflare Zero Trust dashboard, create a public hostname pointing to `http://panoptikon:8080`.

No TLS certificates to manage — Cloudflare handles encryption end-to-end.

### Option 3: Custom domain with an external reverse proxy

If you already run Nginx, Traefik, or another reverse proxy, remove the Caddy service from the Compose file and proxy to `localhost:8080`. Example Nginx snippet:

```nginx
server {
    listen 443 ssl;
    server_name panoptikon.example.com;

    ssl_certificate     /etc/letsencrypt/live/panoptikon.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/panoptikon.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket support (required for live updates)
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

Make sure to include the WebSocket headers — Panoptikon uses WebSockets for live device updates and agent communication.
