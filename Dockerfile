# syntax=docker/dockerfile:1

# ── Stage 1: Build Rust server ─────────────────────────────────────────────
FROM rust:1.83-slim AS rust-builder
WORKDIR /app
RUN apt-get update && apt-get install -y pkg-config libssl-dev && rm -rf /var/lib/apt/lists/*
COPY Cargo.toml Cargo.lock ./
COPY server ./server
COPY agent ./agent
RUN cargo build --release --bin panoptikon-server

# ── Stage 2: Build Next.js frontend ────────────────────────────────────────
FROM node:22-slim AS frontend-builder
RUN npm install -g bun@latest
WORKDIR /app/web
COPY web/package.json web/bun.lock* web/bun.lockb* ./
RUN bun install --frozen-lockfile
COPY web/ ./
ENV NEXT_TELEMETRY_DISABLED=1
RUN bun run build

# ── Stage 3: Runtime ────────────────────────────────────────────────────────
FROM debian:bookworm-slim AS runtime
RUN apt-get update && apt-get install -y \
    ca-certificates \
    curl \
    nmap \
    iperf3 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=rust-builder /app/target/release/panoptikon-server /usr/local/bin/panoptikon-server
COPY --from=frontend-builder /app/web/.next /opt/panoptikon/web/.next
COPY --from=frontend-builder /app/web/public /opt/panoptikon/web/public

WORKDIR /data
ENV PANOPTIKON_DATA_DIR=/data
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8080/api/v1/auth/status || exit 1

ENTRYPOINT ["/usr/local/bin/panoptikon-server"]
