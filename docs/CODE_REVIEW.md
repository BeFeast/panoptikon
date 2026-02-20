# Panoptikon — Code Review Report

**Date:** 2026-02-20
**Reviewer:** Claude Code Review Agent Team
**Scope:** Full codebase audit — server (Rust/axum), agent (Rust), web (Next.js/React), CI, tests
**Codebase version:** v0.1.0 (Milestone 0 — scaffolding complete)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Architecture Assessment](#2-architecture-assessment)
3. [Server (Rust) Review](#3-server-rust-review)
4. [Agent (Rust) Review](#4-agent-rust-review)
5. [Frontend (Next.js) Review](#5-frontend-nextjs-review)
6. [Security Audit](#6-security-audit)
7. [Test Coverage Analysis](#7-test-coverage-analysis)
8. [CI/CD Review](#8-cicd-review)
9. [PRD vs. Implementation Gap Analysis](#9-prd-vs-implementation-gap-analysis)
10. [Summary of Issues by Severity](#10-summary-of-issues-by-severity)

---

## 1. Executive Summary

Panoptikon is well-structured for a v0.1.0 scaffold. The monorepo layout (`server/`, `agent/`, `web/`) is clean, the tech stack choices (axum, SQLite, Next.js 15, shadcn/ui) are sound, and the UI already delivers on the "UniFi dark theme" promise. However, the review uncovered **7 critical**, **12 high**, and **18 medium** issues across security, correctness, reliability, and missing test coverage.

**Biggest risks:**
- **Security:** CORS allows any origin (`Any`), no rate limiting on login, session stored in-memory (lost on restart), VyOS API key exposed in install script URL
- **Correctness:** Frontend/backend type mismatches (AuthStatus, LoginResponse), agent auth sends key as WS header but server expects JSON message
- **Reliability:** No data retention/cleanup task implemented, `sysinfo::System::new_all()` called every 30s (expensive)

---

## 2. Architecture Assessment

### 2.1 Project Structure

```
panoptikon/
├── Cargo.toml          # Workspace: server + agent
├── server/             # axum API server
│   └── src/
│       ├── api/        # REST handlers (auth, devices, agents, alerts, dashboard, vyos)
│       ├── db/         # SQLite init + migrations
│       ├── oui/        # MAC vendor lookup (stub)
│       ├── scanner/    # ARP scanner + periodic task
│       ├── vyos/       # VyOS HTTP API client
│       └── ws/         # WebSocket hub
├── agent/              # System metrics collector
│   └── src/
│       ├── collectors/ # cpu, memory, disk, network, os
│       ├── config.rs
│       └── ws.rs       # WebSocket session
├── web/                # Next.js 15 frontend
│   └── src/
│       ├── app/        # App Router pages
│       ├── components/ # UI components (shadcn/ui)
│       └── lib/        # API client, types, utils
└── docs/               # PRD
```

**Verdict:** Clean separation. Workspace setup correct. One concern: no `rust-embed` integration yet — static frontend is served via `ServeDir` from filesystem, not embedded in binary as PRD specifies.

### 2.2 Dependency Assessment

| Crate/Package | Version | Assessment |
|---|---|---|
| axum 0.7 | OK | Current stable |
| sqlx 0.7 | OK | Good choice for SQLite |
| tokio-tungstenite 0.21 | OK | Matches axum WS |
| bcrypt 0.15 | OK | Secure password hashing |
| reqwest 0.12 + rustls | OK | No OpenSSL dependency |
| sysinfo 0.30 | OK | Cross-platform metrics |
| Next.js 15 | OK | Latest stable |
| @playwright/test 1.58 | OK | Good E2E framework |

**Missing dependencies noted:** No `rust-embed` for static frontend embedding, no `tower-limit` for rate limiting, no `cookie` crate (manual cookie parsing).

---

## 3. Server (Rust) Review

### 3.1 Database Layer (`server/src/db/mod.rs`)

**Good:**
- WAL journal mode enabled (correct for concurrent reads)
- Migrations tracked in `_migrations` table
- Idempotent migration execution
- 4 unit tests covering migration scenarios

**Issues:**

| # | Severity | File:Line | Issue |
|---|----------|-----------|-------|
| S1 | **MEDIUM** | `db/mod.rs:48` | Migration SQL split on `;` is fragile — will break if any SQL value contains a semicolon. Should use a proper SQL statement parser or `sqlx::migrate!()` macro. |
| S2 | **MEDIUM** | `db/mod.rs:49-54` | Comment-stripping logic strips all lines starting with `--`, but inline comments after SQL (e.g., `SELECT 1; -- comment`) won't be handled correctly. |
| S3 | **LOW** | `db/mod.rs:17-18` | `max_connections(5)` — for SQLite with WAL, a pool of 5 connections is fine, but should document that SQLite has a single-writer constraint. |

### 3.2 API Router (`server/src/api/mod.rs`)

**Good:**
- Clean separation of public/protected/agent routes
- Auth middleware applied via `route_layer`
- Static file fallback for SPA routing

**Issues:**

| # | Severity | File:Line | Issue |
|---|----------|-----------|-------|
| S4 | **CRITICAL** | `api/mod.rs:49-52` | `CorsLayer::new().allow_origin(Any).allow_methods(Any).allow_headers(Any)` — **CORS is completely open.** This allows any website to make authenticated API calls if the user is logged in. Must restrict to same-origin or configure allowed origins. |
| S5 | **HIGH** | `api/mod.rs:24` | `SessionStore = HashMap<String, DateTime>` — Sessions stored in-memory only. **All sessions lost on server restart.** Users must re-login after every restart/deploy. |
| S6 | **MEDIUM** | `api/mod.rs:60` | `change-password` endpoint is in `public_routes` — **not protected by auth middleware.** Anyone can call it without being logged in. However, the handler requires knowledge of the current password, so the practical risk is lower but it still allows password brute-forcing without session. |
| S7 | **LOW** | `api/mod.rs:101-103` | `web/out` path is relative to CWD — will fail if binary is run from a different directory. Should use a compile-time embedded path or make it configurable. |

### 3.3 Authentication (`server/src/api/auth.rs`)

**Good:**
- bcrypt with default cost (12 rounds)
- HttpOnly + SameSite=Lax cookies
- First-run password setup flow
- Session expiry tracked

**Issues:**

| # | Severity | File:Line | Issue |
|---|----------|-----------|-------|
| S8 | **CRITICAL** | `auth.rs:64-78` | **First-run accepts ANY password without validation.** No minimum length check on initial setup. An empty password would be accepted and hashed. The `change_password` handler enforces min 8 chars but `login` (first-run path) does not. |
| S9 | **HIGH** | `auth.rs:35-108` | **No rate limiting on login.** An attacker can brute-force passwords unlimited. Need exponential backoff, account lockout, or IP-based rate limiting. |
| S10 | **HIGH** | `auth.rs:83` | `let _ = password_hash;` — dead code. The variable is used above but this suppression line is confusing and unnecessary. |
| S11 | **MEDIUM** | `auth.rs:96` | Cookie lacks `Secure` flag. For HTTPS deployments the session cookie will be sent over plain HTTP too. Should be configurable or auto-detect. |
| S12 | **LOW** | `auth.rs:241-253` | Manual cookie parsing. Consider using `axum_extra::extract::CookieJar` or `tower_cookies` for robustness. |

### 3.4 Agents API (`server/src/api/agents.rs`)

**Good:**
- Clean CRUD handlers
- bcrypt for API key hashing
- WebSocket auth with timeout (10s)
- Agent offline detection + alert creation on disconnect
- Broadcast to UI clients on state changes

**Issues:**

| # | Severity | File:Line | Issue |
|---|----------|-----------|-------|
| S13 | **CRITICAL** | `agents.rs:515-519` | Install script: `_key_exists` query checks `api_key_hash != ''` — this doesn't validate the specific key, just that _any_ agent exists. **The API key in the install URL is not verified.** Anyone with the URL can get the install script with the API key embedded. |
| S14 | **HIGH** | `agents.rs:529` | `replace("0.0.0.0", "10.10.0.14")` — **hardcoded IP address** for server URL in install script. Should be configurable or auto-detected from the request's `Host` header. |
| S15 | **HIGH** | `agents.rs:408-435` | Agent WS auth: server expects a JSON `{"api_key": "...", "agent_id": "..."}` message, but the agent in `agent/src/ws.rs` sends the key as an HTTP `Authorization` header during the WS handshake — **protocol mismatch.** The agent never sends the expected JSON auth message. |
| S16 | **MEDIUM** | `agents.rs:161` | API key format `pnk_{uuid}` — good prefix, but the UUID is stripped of hyphens. The resulting key has ~128 bits of entropy which is sufficient. |
| S17 | **MEDIUM** | `agents.rs:219-229` | `Agent::from_row` in the `update` handler uses `unwrap_or_default()` — silently returns empty strings instead of propagating errors. Inconsistent with `get_one` which uses `from_row` properly. |
| S18 | **LOW** | `agents.rs:47` | `#[allow(dead_code)]` on `AgentReport` — several fields are unused (they're only deserialized). Consider actually using them or structuring the code differently. |

### 3.5 Scanner (`server/src/scanner/mod.rs`, `arp.rs`)

**Good:**
- Clean ARP table parsing with fallback (`/proc/net/arp` → `arp -a`)
- Offline detection with configurable grace period
- State change logging and alert creation
- Good test coverage for ARP parsing (8 tests)

**Issues:**

| # | Severity | File:Line | Issue |
|---|----------|-----------|-------|
| S19 | **HIGH** | `scanner/mod.rs:24-28` | `scan_subnets()` ignores the `_subnets` parameter entirely — it only reads the ARP cache, never actively scans. Active ARP scanning (via `pnet`) is a TODO. This means devices that haven't recently communicated won't be discovered. |
| S20 | **MEDIUM** | `scanner/mod.rs:84-238` | `process_scan_results()` runs all DB operations sequentially per device with no transaction. A crash mid-processing could leave the database in an inconsistent state (device created without IP, etc.). Should wrap in a transaction. |
| S21 | **MEDIUM** | `scanner/mod.rs:166` | OUI vendor lookup called on every new device — `crate::oui::lookup()` is fine for the stub, but when the real IEEE database is loaded, this should be lazy or cached. |
| S22 | **LOW** | `scanner/arp.rs:93` | TODO: raw ARP scanning via `pnet`. This is the biggest functional gap for the scanner — passive ARP cache reading misses devices that don't talk to the server's subnet. |

### 3.6 VyOS Client (`server/src/vyos/client.rs`)

**Good:**
- Clean API abstraction
- Timeout configured (10s)
- Error messages include HTTP status and body

**Issues:**

| # | Severity | File:Line | Issue |
|---|----------|-----------|-------|
| S23 | **HIGH** | `vyos/client.rs:20` | `danger_accept_invalid_certs(true)` is **hardcoded always-on.** PRD has `insecure_tls` config option but it's never read. Should be conditional: `if config.insecure_tls { builder.danger_accept_invalid_certs(true) }`. |
| S24 | **MEDIUM** | `vyos/client.rs:18` | `VyosClient::new()` creates a new `reqwest::Client` on every call. The client should be created once and reused (connection pooling). Currently, `get_vyos_client()` in the API handler creates a new client per request. |
| S25 | **LOW** | `dashboard.rs:54` | Router status check: `!url.contains("192.168.1.1")` — **hardcoded IP exclusion.** This seems like debug code that shouldn't be in production. |

### 3.7 WebSocket Hub (`server/src/ws/hub.rs`)

**Good:**
- Clean broadcast pattern using `tokio::sync::broadcast`
- Agent command channel via `mpsc`
- Proper registration/unregistration

**Issues:**

| # | Severity | File:Line | Issue |
|---|----------|-----------|-------|
| S26 | **MEDIUM** | `hub.rs:31-32` | `_cmd_tx` is stored but never exposed via a public method to actually send commands to agents. The `send_command_to_agent()` API is missing. |
| S27 | **LOW** | `hub.rs:37` | Broadcast channel buffer of 256 — if UI clients are slow, messages will be dropped. This is fine for UI updates but should be documented. |

### 3.8 OUI Database (`server/src/oui/mod.rs`)

**Good:**
- Case-insensitive lookup
- 7 unit tests
- Clean HashMap-based approach

**Issues:**

| # | Severity | File:Line | Issue |
|---|----------|-----------|-------|
| S28 | **MEDIUM** | `oui/mod.rs:10-34` | Only 20 vendor entries. PRD specifies "embedded IEEE MA-L CSV at build time." The current stub will miss >99.9% of real devices. Needs a build script to embed the full IEEE database (~40K entries). |

---

## 4. Agent (Rust) Review

### 4.1 Connection & Authentication (`agent/src/ws.rs`)

**Issues:**

| # | Severity | File:Line | Issue |
|---|----------|-----------|-------|
| A1 | **CRITICAL** | `ws.rs:20-31` | Agent sends `Authorization: Bearer <key>` as HTTP header on WS handshake, but server's `wait_for_auth()` expects a JSON `{"api_key", "agent_id"}` message after connection. **Agent will never authenticate successfully.** This is a protocol mismatch. |
| A2 | **HIGH** | `ws.rs:40-73` | Agent sends reports immediately in a loop without first sending an auth message. Server will drop the connection after 10s timeout. |
| A3 | **MEDIUM** | `ws.rs:14-17` | URL construction: `config.server_url.trim_end_matches('/')` — if `server_url` is `http://...` the agent tries to connect via `http://` but `connect_async` expects `ws://` or `wss://`. The install script writes `server_url` as the HTTP URL, not a WS URL. |
| A4 | **LOW** | `config.rs:25-26` | Config field is `report_interval_secs` but the example TOML in the docstring uses `report_interval_seconds` — mismatch will cause deserialization failure. |

### 4.2 Collectors

**Good:**
- Clean separation per metric type
- Proper filtering (pseudo-fs excluded from disks, loopback from network)
- `sysinfo` is a solid cross-platform choice

**Issues:**

| # | Severity | File:Line | Issue |
|---|----------|-----------|-------|
| A5 | **HIGH** | `collectors/mod.rs:28` | `System::new_all()` is called **every 30 seconds.** This is very expensive — it re-enumerates all processes, disks, networks. Should create `System` once at startup and call `.refresh_*()` methods between reports. |
| A6 | **MEDIUM** | `collectors/cpu.rs:14` | CPU usage from `sys.global_cpu_info().cpu_usage()` after `System::new_all()` — `sysinfo` needs two measurements to compute CPU usage. A single `new_all()` will return 0% on the first call. Must call `refresh_cpu()` with a delay. |
| A7 | **MEDIUM** | `collectors/network.rs:35-36` | `tx_bytes_delta` and `rx_bytes_delta` use `data.transmitted()` / `data.received()` from `sysinfo` — these are "since last refresh" values, but since a new `System` is created each time, they represent "since boot" (same as `total_*`). Delta tracking is broken. |
| A8 | **LOW** | `collectors/network.rs:37` | `state: "up"` is always hardcoded. Should at least check if the interface has any addresses or use platform-specific APIs. |

### 4.3 Reconnection Logic

**Good:**
- Exponential backoff with cap (1s → 60s max)
- Clean session loop

---

## 5. Frontend (Next.js) Review

### 5.1 API Client (`web/src/lib/api.ts`)

**Issues:**

| # | Severity | File:Line | Issue |
|---|----------|-----------|-------|
| F1 | **HIGH** | `api.ts:20-30` | `getAuthHeaders()` reads `localStorage.getItem("token")` — but the server uses **HttpOnly cookies** for auth, not bearer tokens. The `Authorization` header is never checked by the server's auth middleware. This is dead code that creates confusion. |
| F2 | **HIGH** | `api.ts:134` | `setupPassword()` calls `/api/v1/auth/setup` — **this endpoint doesn't exist on the server.** The server's first-run flow is handled by the same `/api/v1/auth/login` endpoint. This will 404. |
| F3 | **MEDIUM** | `api.ts:42-45` | On 401, the client does `window.location.href = "/login"` — this causes a full page reload. Should use Next.js router for SPA navigation. |

### 5.2 Type Definitions (`web/src/lib/types.ts`)

**Issues:**

| # | Severity | File:Line | Issue |
|---|----------|-----------|-------|
| F4 | **HIGH** | `types.ts:91-94` | `AuthStatus` has `first_run: boolean` but server returns `needs_setup: boolean`. **Field name mismatch.** Login page reads `status.first_run` which will always be `undefined`. |
| F5 | **HIGH** | `types.ts:96-98` | `LoginResponse` expects `{ token: string }` but server returns `{ message: string }` and sets an HttpOnly cookie. **Login page tries to store `res.token` in localStorage, but `res.token` is `undefined`.** |
| F6 | **MEDIUM** | `types.ts:36-47` | `Agent` type includes `hostname`, `os_name`, `os_version` fields but the server's `Agent` struct doesn't return these. The agents page will show "—" for all of them. |

### 5.3 WebSocket Client (`web/src/lib/ws.ts`)

**Good:**
- Auto-reconnect with configurable interval
- Proper cleanup on unmount
- Typed messages

**Issues:**

| # | Severity | File:Line | Issue |
|---|----------|-----------|-------|
| F7 | **MEDIUM** | `ws.ts:29` | Default URL uses `ws://` — no WSS support. Should detect `https` and use `wss://`. |
| F8 | **MEDIUM** | `ws.ts:41` | WebSocket connection doesn't include auth cookie. The server's protected route for `/ws` requires auth via cookie, but WebSocket API doesn't automatically send cookies in all browsers for cross-origin. Works for same-origin only. |
| F9 | **LOW** | `ws.ts:61-62` | Reconnect uses fixed interval (3s) — should use exponential backoff to avoid thundering herd if server goes down. |

### 5.4 Page Components

**Dashboard (`dashboard/page.tsx`):**
- Good: Loading skeletons, error handling, polling (30s refresh)
- Issue: `routerStatusLabel()` checks for `"online"` but server returns `"connected"` — status mapping mismatch (F10, **MEDIUM**)

**Devices (`devices/page.tsx`):**
- Good: Client-side filtering, search, slide-in detail panel
- Good: Device cards with status dots and agent telemetry badges
- Issue: "Scan Now" button has no `onClick` handler — does nothing (F11, **LOW**)

**Agents (`agents/page.tsx`):**
- Good: Full CRUD flow, dialog-based creation, copy-to-clipboard with fallbacks
- Good: Inline rename, delete confirmation dialog
- Issue: CopyBlock uses `document.execCommand("copy")` as fallback — deprecated API (F12, **LOW**)

**Alerts (`alerts/page.tsx`):**
- Good: Read/unread state, click-to-mark-read
- No issues found.

**Login (`login/page.tsx`):**
- Issue: Stores `res.token` in localStorage (see F5) — will break auth flow
- Issue: Reads `status.first_run` (see F4) — first-run detection broken

**Settings (`settings/page.tsx`):**
- Good: Password strength indicator, validation, redirect after change
- Good: Direct `fetch()` call bypasses API client (works correctly with cookies)

### 5.5 Layout & UI Components

**Sidebar:** Clean, collapsible, tooltip support when collapsed. Version display.

**TopBar:** Hardcoded notification badge count ("2") — not dynamic (F13, **LOW**).

**Overall UI quality:** The dark theme implementation is excellent and achieves the UniFi-inspired look described in the PRD.

---

## 6. Security Audit

### Critical Issues

| # | Category | Description | Location |
|---|----------|-------------|----------|
| SEC-1 | **CORS** | `allow_origin(Any)` allows any website to make authenticated cross-origin requests. An attacker's page could steal data if the user is logged into Panoptikon. | `api/mod.rs:49-52` |
| SEC-2 | **Auth bypass** | First-run login accepts empty/short passwords. No minimum length enforced on initial setup. | `auth.rs:64-78` |
| SEC-3 | **Credential exposure** | API key is embedded in install script URL query parameter (`?key=pnk_...`). URLs may be logged by proxies, browser history, or server access logs. | `agents.rs:502-693` |
| SEC-4 | **Brute force** | No rate limiting on `/auth/login`. Unlimited password guessing. | `auth.rs:35` |

### High Issues

| # | Category | Description | Location |
|---|----------|-------------|----------|
| SEC-5 | **Session persistence** | Sessions in HashMap — lost on restart. No session cleanup for expired entries (memory leak over time). | `api/mod.rs:24` |
| SEC-6 | **TLS** | `danger_accept_invalid_certs(true)` is always on, ignoring config. MITM possible for VyOS API. | `vyos/client.rs:20` |
| SEC-7 | **Cookie flags** | Missing `Secure` flag for HTTPS. Missing `__Host-` prefix for additional protection. | `auth.rs:96` |
| SEC-8 | **SQL Injection** | `test_migrations_apply_cleanly()` uses `format!()` for table name in SQL — not exploitable in tests but sets a bad pattern. | `db/mod.rs:93` |

### Recommendations

1. **CORS:** Restrict to same-origin or `localhost` + configurable origins
2. **Rate limiting:** Add `tower::limit::RateLimitLayer` to login endpoint (e.g., 5 attempts/minute)
3. **Sessions:** Store in SQLite with expiry cleanup task, or use signed cookies (JWT/PASETO)
4. **First-run:** Enforce minimum 8-char password on initial setup
5. **Install script:** Move API key to POST body or use a time-limited token

---

## 7. Test Coverage Analysis

### 7.1 Rust Unit Tests

| Module | Tests | Coverage | Verdict |
|--------|-------|----------|---------|
| `db/mod.rs` | 4 | Migrations apply, idempotent, tracking table, version recorded | Good |
| `oui/mod.rs` | 7 | Known vendors, unknown, case-insensitive, short MAC | Good |
| `scanner/arp.rs` | 8 | ARP parsing, empty, incomplete, normalization | Good |
| `api/auth.rs` | 0 | **None** | **Critical gap** |
| `api/agents.rs` | 0 | **None** | **Critical gap** |
| `api/devices.rs` | 0 | **None** | **Critical gap** |
| `api/dashboard.rs` | 0 | **None** | Missing |
| `api/alerts.rs` | 0 | **None** | Missing |
| `vyos/client.rs` | 0 | **None** | Missing |
| `ws/hub.rs` | 0 | **None** | Missing |
| `config.rs` | 0 | **None** | Missing |
| Agent crate (all) | 0 | **None** | **Critical gap** |

**Total: 19 unit tests across 3 modules. 0 tests for all API handlers, all agent code.**

### 7.2 Playwright E2E Tests

| Test File | Tests | Coverage |
|-----------|-------|----------|
| `auth.spec.ts` | 3 | Login page load, wrong password, correct login |
| `dashboard.spec.ts` | 3 | Stat cards, alerts section, top devices |
| `devices.spec.ts` | 6 | Page load, filters, search, scan button, IPs display |
| `navigation.spec.ts` | 5 | Sidebar links, all pages, unauth redirect |
| `agents.spec.ts` | 5 | Page load, add button, dialog, creation flow, viewport |

**Total: 22 E2E tests.** Good coverage for happy-path UI flows. Missing:
- Negative/error scenarios (server down, network failures)
- WebSocket live update testing
- Alert interaction testing (mark read)
- Settings page (change password flow)
- Mobile responsive testing (only agents has viewport tests)

### 7.3 Missing Test Categories

| Category | Priority | What's Needed |
|----------|----------|---------------|
| **API integration tests** | P0 | Test each endpoint with real SQLite (in-memory), verify HTTP status codes, response shapes, auth enforcement |
| **Auth unit tests** | P0 | Login flow, first-run setup, session expiry, cookie handling, invalid inputs |
| **Scanner integration** | P1 | Test `process_scan_results()` with mock data, verify device creation/state changes/alerts |
| **Agent collector tests** | P1 | Test each collector returns valid data structures |
| **WebSocket tests** | P1 | Test agent auth flow, report handling, broadcast, disconnect handling |
| **Frontend unit tests** | P2 | Format utils (`formatBps`, `timeAgo`), API client mocking |
| **Load/stress tests** | P3 | Many concurrent WebSocket connections, rapid ARP scans |

---

## 8. CI/CD Review

### Current CI (`.github/workflows/ci.yml`)

```yaml
Jobs:
1. rust: fmt check, clippy, build, test
2. frontend: bun install, lint (soft fail), build
```

**Good:**
- `RUSTFLAGS: "-Dwarnings"` — clippy warnings are errors
- Cargo caching configured
- Both components built

**Issues:**

| # | Severity | Issue |
|---|----------|-------|
| CI-1 | **HIGH** | Frontend lint uses `|| true` — **lint failures are silently ignored.** Remove the `|| true` or use `--max-warnings=0` without fallback. |
| CI-2 | **MEDIUM** | No Playwright E2E tests in CI. The 22 tests exist but never run in the pipeline. |
| CI-3 | **MEDIUM** | No cross-compilation job for agent binaries (4 targets mentioned in PRD). |
| CI-4 | **LOW** | No Cargo.lock in repo (workspace). Should be committed for reproducible builds. |
| CI-5 | **LOW** | No release/deploy pipeline. PRD mentions GitHub Releases with pre-built binaries. |

---

## 9. PRD vs. Implementation Gap Analysis

### Milestone 0 (Scaffolding) — Status: ~90% Complete

| Item | Status | Notes |
|------|--------|-------|
| Repository setup (monorepo) | Done | Clean workspace |
| Rust workspace + axum skeleton | Done | Full API scaffolded |
| Next.js + Tailwind + shadcn/ui | Done | Excellent dark theme |
| SQLite + sqlx migrations | Done | Schema matches PRD exactly |
| CI: GitHub Actions | Partial | Lint soft-fails, no E2E |
| Basic Dockerfile | **Missing** | |

### Milestone 1 (MVP) — Status: ~60% Complete

| Feature | Status | Notes |
|---------|--------|-------|
| F1: Dashboard | Done | Stat cards, alerts, top devices |
| F2: Device Discovery | Partial | ARP cache only, no active scanning |
| F2: OUI Lookup | Stub | 20 vendors, needs full IEEE DB |
| F3: VyOS Integration | Done | Read-only: interfaces, routes, DHCP, firewall |
| F4: Authentication | Mostly done | First-run bug, no rate limiting |
| F5: Alerts (Basic) | Done | New device, online/offline, in-app feed |
| WebSocket live updates | Done | Hub + broadcast working |
| Static frontend embedding | **Missing** | PRD says `rust-embed`, currently filesystem |
| Settings page | Partial | Password change only, no VyOS/scan config |

### Milestone 2 (Agents) — Status: ~40% Complete

| Feature | Status | Notes |
|---------|--------|-------|
| Agent binary | Done | Collectors implemented |
| Agent registration | Done | API key generation |
| Agent reports | Done | WS handler + DB storage |
| **Agent auth protocol** | **Broken** | Header vs. JSON mismatch |
| Agent install script | Done | Multi-platform |
| Device ↔ Agent linking | **Missing** | |
| Traffic monitoring | **Missing** | Schema exists, no data pipeline |
| Data aggregation | **Missing** | No retention/cleanup tasks |

---

## 10. Summary of Issues by Severity

### Critical (7)

1. **SEC-1:** CORS allows any origin — data theft possible
2. **SEC-2:** First-run accepts empty passwords
3. **S13:** Install script doesn't validate API key
4. **A1:** Agent/server auth protocol mismatch — agents can never connect
5. **F2:** `setupPassword()` calls non-existent endpoint
6. **F4:** `AuthStatus.first_run` vs `needs_setup` field name mismatch
7. **F5:** `LoginResponse.token` vs `message` — auth flow broken on frontend

### High (12)

1. **S4:** CORS `allow_origin(Any)`
2. **S5:** Sessions lost on restart (in-memory HashMap)
3. **S9:** No rate limiting on login
4. **S14:** Hardcoded IP in install script
5. **S15/A1:** Agent WS auth protocol mismatch
6. **S19:** Scanner ignores subnet parameter
7. **S23:** `insecure_tls` config ignored, always accepts invalid certs
8. **A2:** Agent sends reports without auth message
9. **A5:** `System::new_all()` every 30s (performance)
10. **F1:** Dead `Authorization` header code in API client
11. **F6:** Agent type fields don't match server response
12. **CI-1:** Frontend lint failures silently ignored

### Medium (18)

S1, S2, S6, S11, S16, S17, S20, S21, S24, S26, S28, A3, A6, A7, F3, F7, F8, F10

### Low (11)

S3, S7, S12, S22, S25, S27, A4, A8, F9, F11, F12, F13

---

*This report was generated by the Panoptikon Code Review Agent Team. All findings should be triaged and addressed in priority order before the v0.1.0 release.*
