# Deployment Guide — Docker Compose

This guide covers deploying Panoptikon with Docker Compose, including HTTPS via Caddy and local DNS via Unbound.

---

## Prerequisites

| Requirement | Minimum version |
|---|---|
| Docker Engine | 24+ |
| Docker Compose | v2+ (`docker compose` — note: no hyphen) |
| `git` | any recent version (to clone the repository) |

Verify your installation:

```bash
docker --version        # Docker version 24.x+
docker compose version  # Docker Compose version v2.x+
```

---

## Quickstart

```bash
# 1. Clone the repository — the Compose file builds the Panoptikon image from
#    the in-repo Dockerfile, so the full checkout is required
git clone https://git.oklabs.uk/BeFeast/panoptikon.git
cd panoptikon

# 2. (Optional) Create a .env file to override defaults
cp .env.example .env
# edit .env: VYOS_URL, VYOS_API_KEY, MIKROTIK_*, CLOUDFLARE_TUNNEL_TOKEN, ...

# 3. Build the image and start all services
docker compose up -d --build
```

> **No pre-built container image is published.** The `ghcr.io/befeast/panoptikon` /
> Docker Hub images stopped being rebuilt with the move to Forgejo; `docker-compose.yml`
> uses `build: .` and tags the local result `panoptikon:local`. The first
> `docker compose up --build` compiles the Next.js frontend and the Rust server inside
> Docker (several minutes, needs network access for crates/npm). The maintainers'
> production instance does not use Docker at all — see *Maintainer deploy* below.

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
# Update the checkout (the Panoptikon image is built from it)
git pull

# Refresh the third-party images only (Caddy, Unbound, cloudflared);
# the Panoptikon service is buildable and is skipped here
docker compose pull --ignore-buildable

# Rebuild the Panoptikon image and recreate the containers
docker compose up -d --build
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

---

## Maintainer deploy: artifact-driven rollout to the production LXC

The Docker Compose stack above is the demo/self-host path. The maintainers' production
instance is a plain `panoptikon-server` binary under systemd in an LXC, and it is deployed
from CI artifacts rather than built on the target:

1. Every push to `main` and every pull request runs `.forgejo/workflows/ci.yml` on Forgejo
   Actions (<https://git.oklabs.uk/BeFeast/panoptikon>). The `rust` job uploads the artifact
   **`panoptikon-server-linux-x86_64`** (flat zip: the release binary,
   `panoptikon-server.sha256` and `deploy-metadata.json`) on **every** run — the Playwright
   `e2e` job runs against exactly that binary. The upload is therefore not the deploy gate:
   `scripts/deploy-worker.sh` only ships an artifact from a run that was triggered by a `push`
   to `main` and whose whole workflow — including the Caddy integration suite and the
   Playwright E2E gate — finished with status `success`.
2. `scripts/deploy-worker.sh` (run on the maintainers' deploy control host — never on the
   target LXC — one-shot or `--watch`) asks the Forgejo API for the newest such run, downloads
   its artifact as a zip (`GET /api/v1/repos/BeFeast/panoptikon/actions/artifacts/{id}/zip`),
   checks the sha256 sidecar and the metadata (commit/branch/event must match the run, the
   version must be a plain version token) and that the file is an ELF64 x86-64 binary — an
   artifact failing any of these is rejected and recorded, nothing is deployed — then backs up
   the current binary and pushes the new one into the LXC as
   `/usr/local/bin/panoptikon-server.new` and runs `panoptikon-server.new --version` **inside
   the LXC** as a pre-flight. Only when that succeeds is `panoptikon.service` stopped, the
   binary swapped (`mv`) and the service started again, followed by HTTP health checks and an
   automatic rollback to the backed-up binary on failure. A binary that fails the pre-flight
   is discarded without touching the running service. CI output is never executed on the
   control host unless `VERIFY_EXEC=on` is set explicitly. Telegram notifications are optional.
3. `scripts/deploy-lxc.sh <binary>` is the manual fallback for the same push/restart step.

```bash
# Token: ~/.config/forgejo/token.env (mode 0600) with FORGEJO_TOKEN=... (and optionally
# FORGEJO_URL=...), or export FORGEJO_TOKEN in the environment. The worker only reads runs
# and artifacts: use a dedicated token with just the `read:repository` scope for it.
scripts/deploy-worker.sh --check     # resolve latest run + artifact, no deploy (works while --watch runs)
scripts/deploy-worker.sh             # deploy the latest undeployed build once
scripts/deploy-worker.sh --watch     # poll every $POLL_INTERVAL seconds
scripts/deploy-worker.sh --rollback  # restore the previous binary
```

Tunables (environment): `REPO` (default `BeFeast/panoptikon`), `CI_WORKFLOW` (`ci.yml`),
`CI_BRANCH` (`main`), `CI_EVENT` (`push`), `ARTIFACT_NAME` (`panoptikon-server-linux-x86_64`),
`FORGEJO_API` (`https://git.oklabs.uk/api/v1`; must be https when a token is used),
`FORGEJO_TOKEN_FILE`, `DEPLOY_STATE_DIR` (`~/.panoptikon-deploy`), `VERIFY_EXEC`
(`off|on|auto`, default `off`), `ALLOW_UNVERIFIED_ARTIFACT` (`1` deploys an artifact without
sha256 sidecar / metadata — otherwise refused), `RETRY_FAILED_RUN` (`1` retries a run recorded
in `last-failed-run`).

State files under `~/.panoptikon-deploy/`: `last-deployed-run` stores the Forgejo run ID of the
last successful deploy (a stale GitHub-era value simply causes the next successful Forgejo
build to be deployed); `last-failed-run` records a run whose deploy failed — artifact rejected
by the contract checks (zip layout, sha256 sidecar, metadata commit/branch/event/version,
ELF64 x86-64), in-LXC pre-flight, mid-deploy or health check — so that `--watch`/cron do not
download, fail and roll back the same build every poll; it is retried only with
`RETRY_FAILED_RUN=1` (or by deleting the file) and is cleared by the next successful deploy;
`last-deploy.json` holds the details of the last attempt (`status`: `success`, `rejected`,
`preflight_failed` or `failed`). Transient errors (API unreachable, artifact listing or download
failed) record nothing and are simply retried on the next poll: `--watch` keeps running through
them and exits only when a rollback itself fails, so a plain supervisor (a systemd unit with
`Restart=on-failure`, or cron running the one-shot mode) is all that is needed to keep it alive.
