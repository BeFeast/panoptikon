# Panoptikon — Architecture & Code Improvement Proposals

**Date:** 2026-02-20
**Author:** Claude Code Review Agent Team
**Based on:** Full codebase review + PRD analysis

---

## Table of Contents

1. [P0 — Must Fix Before Release](#1-p0--must-fix-before-release)
2. [P1 — Architecture Improvements](#2-p1--architecture-improvements)
3. [P2 — Code Quality & DX](#3-p2--code-quality--dx)
4. [P3 — Feature Gaps & Enhancements](#4-p3--feature-gaps--enhancements)
5. [Testing Strategy](#5-testing-strategy)
6. [Proposed File Structure Changes](#6-proposed-file-structure-changes)

---

## 1. P0 — Must Fix Before Release

These are blockers that prevent the application from functioning correctly.

### 1.1 Fix Agent ↔ Server Auth Protocol

**Problem:** Agent sends API key as HTTP `Authorization` header during WebSocket handshake. Server ignores this and waits for a JSON auth message that never arrives. Result: agents can never authenticate.

**Fix (choose one):**

**Option A — Server reads from handshake headers (Recommended):**
```rust
// server/src/api/agents.rs — ws_handler
pub async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
    headers: HeaderMap,  // extract headers from the upgrade request
) -> impl IntoResponse {
    // Extract agent_id and api_key from Authorization header
    let auth = headers.get("Authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.strip_prefix("Bearer "));

    ws.on_upgrade(move |socket| handle_agent_ws(socket, state, auth))
}
```

**Option B — Agent sends JSON auth message after connect:**
```rust
// agent/src/ws.rs — after connect_async, before report loop:
let auth_msg = serde_json::json!({
    "api_key": config.api_key,
    "agent_id": config.agent_id,
});
write.send(Message::Text(auth_msg.to_string())).await?;
// Wait for ack...
```

**Recommendation:** Option A is simpler and aligns with standard WebSocket auth patterns. Option B requires the agent to also send the `agent_id` which is redundant if the server can look it up from the API key.

### 1.2 Fix Frontend ↔ Backend Type Mismatches

**Problem:** Multiple type/field name mismatches cause broken functionality.

**Fixes needed in `web/src/lib/types.ts`:**

```typescript
// Fix 1: AuthStatus field name
export interface AuthStatus {
  authenticated: boolean;
  needs_setup: boolean;  // was: first_run
}

// Fix 2: LoginResponse — server returns message, not token
// Auth is via HttpOnly cookie, not bearer token
export interface LoginResponse {
  message: string;  // was: token
}
```

**Fixes needed in `web/src/app/login/page.tsx`:**
```typescript
// Fix 3: Read correct field name
setFirstRun(status.needs_setup);  // was: status.first_run

// Fix 4: Don't store token — cookie-based auth
// Remove: localStorage.setItem("token", res.token);
window.location.href = "/dashboard";
```

**Fixes needed in `web/src/lib/api.ts`:**
```typescript
// Fix 5: Remove dead Authorization header logic
// The server uses HttpOnly cookies, not bearer tokens
function getAuthHeaders(): HeadersInit {
  return { "Content-Type": "application/json" };
}

// Fix 6: setupPassword should call /auth/login (first-run path)
export function setupPassword(password: string): Promise<LoginResponse> {
  return apiPost<LoginResponse>("/api/v1/auth/login", { password });
}
```

### 1.3 Fix First-Run Password Validation

```rust
// server/src/api/auth.rs — in the `None` (first-run) branch of login():
None => {
    // Enforce minimum password length on first setup
    if body.password.len() < 8 {
        return Err(StatusCode::UNPROCESSABLE_ENTITY);
    }
    let hash = bcrypt::hash(&body.password, bcrypt::DEFAULT_COST)...
```

### 1.4 Fix CORS

```rust
// server/src/api/mod.rs
let cors = CorsLayer::new()
    .allow_origin(tower_http::cors::AllowOrigin::mirror_request())  // same-origin
    .allow_methods([Method::GET, Method::POST, Method::PATCH, Method::DELETE])
    .allow_headers([header::CONTENT_TYPE, header::COOKIE])
    .allow_credentials(true);
```

Or for development, allow configurable origins:
```toml
# panoptikon.toml
[server]
cors_origins = ["http://localhost:3000"]
```

---

## 2. P1 — Architecture Improvements

### 2.1 Persistent Sessions (SQLite-backed)

**Current:** In-memory HashMap — all sessions lost on restart.

**Proposed:** Add a `sessions` table to SQLite.

```sql
-- Add to migration
CREATE TABLE IF NOT EXISTS sessions (
    token   TEXT PRIMARY KEY,
    expires TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires);
```

```rust
// New: server/src/session.rs
pub struct SqliteSessionStore { db: SqlitePool }

impl SqliteSessionStore {
    pub async fn create(&self, expiry: DateTime<Utc>) -> String { ... }
    pub async fn validate(&self, token: &str) -> bool { ... }
    pub async fn revoke(&self, token: &str) { ... }
    pub async fn cleanup_expired(&self) { ... }  // run periodically
}
```

**Benefits:** Sessions survive restarts, no memory leak, easy to audit active sessions.

### 2.2 Error Response Standardization

**Current:** Handlers return bare `StatusCode` — no JSON error body. Frontend can't show meaningful error messages.

**Proposed:** Introduce a standard error type.

```rust
// server/src/api/error.rs
#[derive(Serialize)]
pub struct ApiError {
    pub code: &'static str,
    pub message: String,
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let status = match self.code {
            "not_found" => StatusCode::NOT_FOUND,
            "unauthorized" => StatusCode::UNAUTHORIZED,
            "validation" => StatusCode::UNPROCESSABLE_ENTITY,
            _ => StatusCode::INTERNAL_SERVER_ERROR,
        };
        (status, Json(self)).into_response()
    }
}
```

### 2.3 Database Transaction Wrapping for Scanner

**Current:** `process_scan_results()` runs ~10 SQL queries per device without a transaction.

**Proposed:**
```rust
async fn process_scan_results(db: &SqlitePool, ...) -> Result<()> {
    let mut tx = db.begin().await?;

    for dev in discovered {
        // ... all device operations using &mut tx instead of db
    }

    // ... offline detection also within transaction

    tx.commit().await?;
    Ok(())
}
```

### 2.4 Agent Collector Performance

**Current:** `System::new_all()` every 30 seconds — re-enumerates everything.

**Proposed:** Hold `System` in a long-lived struct, refresh incrementally.

```rust
// agent/src/collectors/mod.rs
pub struct SystemCollector {
    sys: System,
}

impl SystemCollector {
    pub fn new() -> Self {
        let mut sys = System::new_all();
        // Initial CPU measurement
        std::thread::sleep(Duration::from_millis(200));
        sys.refresh_cpu();
        Self { sys }
    }

    pub fn collect(&mut self, config: &AgentConfig) -> AgentReport {
        self.sys.refresh_cpu();
        self.sys.refresh_memory();
        // Only refresh disks/networks occasionally (every 5th report?)

        AgentReport {
            cpu: cpu::collect(&self.sys),
            memory: memory::collect(&self.sys),
            ...
        }
    }
}
```

**Benefit:** ~10x less CPU/memory usage per report cycle.

### 2.5 VyOS Client as Shared Resource

**Current:** A new `reqwest::Client` (and TLS context) is created per API request.

**Proposed:** Create once in `AppState`, reuse the connection pool.

```rust
// server/src/api/mod.rs
pub struct AppState {
    pub db: SqlitePool,
    pub config: AppConfig,
    pub sessions: SessionStore,
    pub ws_hub: Arc<WsHub>,
    pub vyos_client: Option<VyosClient>,  // created once, None if unconfigured
}
```

### 2.6 Rate Limiting on Login

```rust
// Add to Cargo.toml:
// tower = { version = "0.4", features = ["limit"] }

// In router():
let login_route = Router::new()
    .route("/auth/login", post(auth::login))
    .layer(tower::limit::RateLimitLayer::new(5, Duration::from_secs(60)));
```

Or implement a custom middleware with per-IP tracking for more control.

### 2.7 Data Retention Background Task

**PRD specifies** hourly aggregation + cleanup. Currently not implemented.

```rust
// server/src/retention.rs
pub fn start_retention_task(db: SqlitePool) {
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_secs(3600)); // hourly
        loop {
            interval.tick().await;
            if let Err(e) = run_retention(&db).await {
                error!("Retention task failed: {e}");
            }
        }
    });
}

async fn run_retention(db: &SqlitePool) -> Result<()> {
    // 1. Aggregate traffic_samples > 1h → traffic_hourly
    // 2. Aggregate traffic_hourly > 24h → traffic_daily
    // 3. DELETE traffic_samples WHERE sampled_at < now - 48h
    // 4. DELETE agent_reports WHERE reported_at < now - 7d
    // 5. DELETE alerts WHERE created_at < now - 90d
    // 6. Weekly VACUUM (check last vacuum time in settings)
    Ok(())
}
```

---

## 3. P2 — Code Quality & DX

### 3.1 Remove Hardcoded Values

| Location | Hardcoded Value | Fix |
|----------|----------------|-----|
| `agents.rs:529` | `10.10.0.14` | Read from request `Host` header |
| `dashboard.rs:54` | `192.168.1.1` | Remove special-case, always check |
| `TopBar.tsx:22` | Badge count `2` | Fetch from `DashboardStats.alerts_unread` |
| `Sidebar.tsx:113` | `v0.1.0` | Read from API or build-time constant |
| `ws.ts:29` | `ws://` only | Auto-detect `ws://` vs `wss://` from `window.location.protocol` |

### 3.2 Consistent Error Handling Pattern

Currently handlers mix:
- `map_err(|e| { error!(...); StatusCode::... })?`
- `.unwrap_or_default()`
- `.ok()?`

**Proposed:** Use a crate-level `AppError` type with `From<sqlx::Error>`, `From<bcrypt::BcryptError>`, etc.

```rust
pub enum AppError {
    Database(sqlx::Error),
    NotFound,
    Unauthorized,
    Validation(String),
    Internal(anyhow::Error),
}

impl IntoResponse for AppError { ... }
impl From<sqlx::Error> for AppError { ... }
```

This eliminates repetitive `map_err` blocks.

### 3.3 Extract Shared Login Helper for E2E Tests

All 5 E2E test files duplicate the `login()` helper. Extract to a shared fixture:

```typescript
// web/tests/e2e/fixtures.ts
import { Page } from '@playwright/test';

export const PASSWORD = 'testpass123';

export async function login(page: Page) {
  await page.goto('/login/');
  await page.locator('text=Sign in').waitFor({ timeout: 5000 });
  await page.fill('#password', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard**', { timeout: 10000 });
}
```

### 3.4 WebSocket URL Auto-Detection

```typescript
// web/src/lib/ws.ts
function getWsUrl(): string {
  if (typeof window === "undefined") return "ws://localhost:8080/api/v1/ws";
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/api/v1/ws`;
}
```

### 3.5 Frontend Data Fetching: SWR / React Query

Currently every page has manual `useState` + `useEffect` + `setInterval` polling. This leads to:
- Duplicated loading/error state management
- No caching between page navigations
- No automatic revalidation

**Consider:** `swr` or `@tanstack/react-query` for data fetching.

```typescript
// Example with SWR:
import useSWR from 'swr';

function DashboardPage() {
  const { data: stats, error } = useSWR('/api/v1/dashboard/stats', fetcher, {
    refreshInterval: 30_000,
  });
  // No useState, no useEffect, no setInterval cleanup needed
}
```

**Trade-off:** Adds a dependency (~8KB gzipped). Worth it for the DX improvement and reduced bugs.

### 3.6 Commit Cargo.lock

The workspace `Cargo.lock` should be committed for reproducible builds. Currently it may not be in git.

---

## 4. P3 — Feature Gaps & Enhancements

### 4.1 Full OUI Database

Replace the 20-entry stub with the real IEEE MA-L database (~40K entries).

**Approach:**
1. Download `oui.csv` from IEEE at build time (build.rs)
2. Parse into a `phf::Map` (compile-time perfect hash map)
3. ~2MB addition to binary size

```rust
// server/build.rs
fn main() {
    // Download and parse IEEE OUI database
    // Generate Rust code with phf_codegen
}
```

### 4.2 Active ARP Scanning

Replace passive ARP cache reading with active subnet scanning:

```rust
// server/src/scanner/raw.rs (future)
pub async fn active_scan(subnet: &str) -> Result<Vec<DiscoveredDevice>> {
    // Use pnet to craft ARP requests for each IP in the subnet
    // Listen for ARP replies
    // Requires CAP_NET_RAW
}
```

**Fallback chain:** raw ARP scan → `/proc/net/arp` → `arp -a` command

### 4.3 Device ↔ Agent Linking

When an agent reports, match its MAC address to a discovered device:

```rust
// On agent report, after storing in agent_reports:
for iface in &report.network_interfaces {
    let mac = iface.mac.to_lowercase();
    if let Some(device_id) = find_device_by_mac(&db, &mac).await? {
        sqlx::query("UPDATE agents SET device_id = ? WHERE id = ?")
            .bind(&device_id)
            .bind(agent_id)
            .execute(&db).await?;
        break;
    }
}
```

### 4.4 Static Frontend Embedding

Replace filesystem `ServeDir` with compile-time embedding:

```toml
# server/Cargo.toml
rust-embed = "8"
```

```rust
#[derive(RustEmbed)]
#[folder = "../web/out/"]
struct WebAssets;

// In router:
.fallback(get(|path: axum::extract::Path<String>| async move {
    WebAssets::get(&path.0)
        .map(|file| ([(header::CONTENT_TYPE, file.metadata.mimetype())], file.data))
        .ok_or(StatusCode::NOT_FOUND)
}))
```

### 4.5 Global Search

The TopBar search input is currently non-functional. Implement:

```rust
// GET /api/v1/search?q=...
pub async fn search(
    State(state): State<AppState>,
    Query(params): Query<SearchQuery>,
) -> Result<Json<SearchResults>, StatusCode> {
    // Search across: devices (name, hostname, mac, ip), agents (name), alerts (message)
    // Return categorized results
}
```

### 4.6 Dockerfile

```dockerfile
# Multi-stage build
FROM rust:1.77 AS builder
WORKDIR /app
COPY . .
RUN cargo build --release --bin panoptikon-server

FROM node:20 AS frontend
WORKDIR /app/web
COPY web/ .
RUN npm ci && npm run build

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/target/release/panoptikon-server /usr/local/bin/
COPY --from=frontend /app/web/out /opt/panoptikon/web/out
EXPOSE 8080
ENTRYPOINT ["panoptikon-server", "--listen", "0.0.0.0:8080"]
```

---

## 5. Testing Strategy

### 5.1 Recommended Test Pyramid

```
                    ┌──────────┐
                    │  E2E     │  22 existing (Playwright)
                    │ (Browser)│  + 10 new scenarios
                    ├──────────┤
                 ┌──┤ API      │  NEW: 30-40 integration tests
                 │  │ Integr.  │  (axum test client + in-memory SQLite)
                 │  ├──────────┤
              ┌──┤  │  Unit    │  19 existing + 25-30 new
              │  │  │  Tests   │  (format utils, OUI, ARP, config parsing)
              │  │  └──────────┘
```

### 5.2 Priority Test Cases to Add

**P0 — API Integration Tests:**

```rust
// server/tests/api_tests.rs
#[tokio::test]
async fn test_login_first_run() { ... }
#[tokio::test]
async fn test_login_wrong_password() { ... }
#[tokio::test]
async fn test_protected_route_requires_auth() { ... }
#[tokio::test]
async fn test_device_crud() { ... }
#[tokio::test]
async fn test_agent_registration_returns_api_key() { ... }
#[tokio::test]
async fn test_alerts_list_and_mark_read() { ... }
#[tokio::test]
async fn test_dashboard_stats_empty_db() { ... }
```

**P0 — Frontend Unit Tests:**

```typescript
// web/__tests__/format.test.ts
describe('formatBps', () => {
  it('formats small values', () => expect(formatBps(500)).toBe('500 bps'));
  it('formats Kbps', () => expect(formatBps(1500)).toBe('1.5 Kbps'));
  it('formats Mbps', () => expect(formatBps(12_300_000)).toBe('12.3 Mbps'));
  it('formats Gbps', () => expect(formatBps(1_500_000_000)).toBe('1.50 Gbps'));
});

describe('timeAgo', () => {
  it('shows seconds', () => ...);
  it('shows minutes', () => ...);
  it('shows hours', () => ...);
});
```

**P1 — E2E Additions:**

```typescript
// web/tests/e2e/websocket.spec.ts - live update testing
// web/tests/e2e/settings.spec.ts - password change flow
// web/tests/e2e/responsive.spec.ts - sidebar collapse, mobile layouts
// web/tests/e2e/alerts-interaction.spec.ts - mark read, filtering
```

### 5.3 Playwright Configuration Fix

Current `playwright.config.ts` uses hardcoded `baseURL: "http://10.10.0.14:8080"`. Should use an environment variable:

```typescript
use: {
  baseURL: process.env.PANOPTIKON_URL || "http://localhost:8080",
}
```

---

## 6. Proposed File Structure Changes

### New Files Needed

```
server/
├── src/
│   ├── api/
│   │   ├── error.rs          # NEW: Unified error type
│   │   └── search.rs         # NEW: Global search endpoint
│   ├── session.rs            # NEW: SQLite-backed session store
│   └── retention.rs          # NEW: Data retention background task
├── tests/
│   └── api_integration.rs    # NEW: Integration tests
├── build.rs                  # NEW: OUI database embedding
└── Dockerfile                # NEW

agent/
├── src/
│   └── collectors/
│       └── mod.rs            # MODIFY: SystemCollector struct

web/
├── src/
│   └── lib/
│       └── types.ts          # MODIFY: Fix type mismatches
├── __tests__/
│   └── format.test.ts        # NEW: Unit tests for utilities
└── tests/
    └── e2e/
        ├── fixtures.ts       # NEW: Shared login helper
        ├── websocket.spec.ts # NEW
        └── settings.spec.ts  # NEW
```

### Summary of Changes by Priority

| Priority | Area | Change | Effort |
|----------|------|--------|--------|
| P0 | Agent WS | Fix auth protocol mismatch | 2h |
| P0 | Frontend | Fix type mismatches (AuthStatus, LoginResponse) | 1h |
| P0 | Server | Fix CORS (restrict origins) | 30m |
| P0 | Server | Fix first-run password validation | 15m |
| P1 | Server | SQLite-backed sessions | 3h |
| P1 | Server | Rate limiting on login | 1h |
| P1 | Server | Data retention task | 4h |
| P1 | Agent | Persistent System + incremental refresh | 2h |
| P1 | Server | VyOS client as shared resource | 1h |
| P1 | Server | DB transactions in scanner | 1h |
| P1 | Tests | API integration tests (30 tests) | 8h |
| P2 | Server | Unified error type | 3h |
| P2 | Frontend | SWR/React Query migration | 4h |
| P2 | Server | Full OUI database embedding | 4h |
| P2 | Tests | Frontend unit tests | 3h |
| P2 | CI | Fix lint, add E2E, add cross-compilation | 4h |
| P3 | Server | Active ARP scanning (pnet) | 8h |
| P3 | Server | Device ↔ Agent linking | 2h |
| P3 | Server | Static frontend embedding (rust-embed) | 3h |
| P3 | Server | Global search endpoint | 3h |
| P3 | Deploy | Dockerfile | 2h |

**Total estimated effort: ~60h for all improvements**

---

*This document should be treated as a living roadmap. Address P0 items immediately, P1 items before MVP release, and P2/P3 items iteratively.*
