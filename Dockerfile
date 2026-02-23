# syntax=docker/dockerfile:1

# ── Stage 1: Build Next.js frontend (static export) ──────────────────────────
# The Rust server embeds web/out/ via rust-embed, so frontend must build first.
FROM oven/bun:1 AS frontend-builder
WORKDIR /app/web
COPY web/package.json web/bun.lock ./
RUN bun install --frozen-lockfile
COPY web/ ./
ENV NEXT_TELEMETRY_DISABLED=1
RUN bun run build

# ── Stage 2: Build Rust server binary ─────────────────────────────────────────
FROM rust:1.83-slim AS rust-builder
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
    pkg-config libssl-dev \
    && rm -rf /var/lib/apt/lists/*
COPY Cargo.toml Cargo.lock ./
COPY server ./server
COPY agent ./agent
# Provide the built frontend so rust-embed can embed it into the binary.
COPY --from=frontend-builder /app/web/out ./web/out
RUN cargo build --release --bin panoptikon-server

# ── Stage 3: Minimal runtime ─────────────────────────────────────────────────
FROM debian:bookworm-slim AS runtime

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=rust-builder /app/target/release/panoptikon-server /usr/local/bin/panoptikon-server
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

RUN mkdir -p /data
WORKDIR /data

# ── Configuration via environment variables ───────────────────────────────────
# Database
ENV DATABASE_PATH=/data/panoptikon.db
# VyOS router
ENV VYOS_URL=""
ENV VYOS_API_KEY=""
# MikroTik router (configured via web UI, declared here for docker-compose)
ENV MIKROTIK_URL=""
ENV MIKROTIK_USER=""
ENV MIKROTIK_PASSWORD=""
# Caddy reverse proxy (configured via web UI)
ENV CADDY_ADMIN_URL=""
# Unbound DNS (configured via web UI)
ENV UNBOUND_CONTROL_PATH=""

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -sf http://localhost:8080/api/v1/auth/status || exit 1

ENTRYPOINT ["docker-entrypoint.sh"]
