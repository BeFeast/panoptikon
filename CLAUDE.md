# Panoptikon — Claude Code Guidelines

## E2E Test Requirement (Mandatory)

Every PR that implements a **feature** or **bug fix** MUST include:

1. **A Playwright E2E test** that verifies the feature actually works end-to-end
   - Test must be in `web/tests/e2e/`
   - Test must exercise the real UI (not just unit-test a function)
   - Test must fail before the fix and pass after
2. **Save→reload roundtrip** — if the PR touches a settings page, include a test that:
   - Fills the form with values
   - Clicks Save
   - Reloads the page
   - Asserts the values persisted
3. **No test = explicit justification** — if a test is genuinely impossible (e.g., hardware-only integration), the PR description must explain why under a `## Why No E2E Test` section

### What counts as a valid E2E test

- Uses Playwright (`web/tests/e2e/*.spec.ts`)
- Imports fixtures from `../../e2e/fixtures`
- Logs in via `login(page)` or uses `authenticatedPage` fixture
- Asserts visible UI state (not just API responses)
- Includes a screenshot on key assertions (`page.screenshot(...)`)

### Examples of PRs that MUST have tests

- New settings page → save/reload roundtrip test
- New dashboard widget → page loads, widget visible, data renders
- Bug fix for persisting a value → test that value persists after reload
- New API endpoint with UI → navigate to page, interact, verify result
- Layout fix → screenshot comparison or element visibility check

### Examples where tests may be skipped (with justification)

- Pure CI/CD configuration changes
- Documentation-only changes
- Dependency bumps with no behavior change
- Infrastructure scripts that require hardware (e.g., MikroTik physical router)

## Project Structure

- `server/` — Rust backend (axum, SQLite)
- `web/` — Next.js frontend (TypeScript, shadcn/ui)
- `web/tests/e2e/` — Playwright E2E tests
- `web/e2e/fixtures.ts` — Shared test fixtures (login, setup)
- `scripts/` — Build and deploy scripts

## Build & Test Commands

```bash
# Rust
cargo fmt --all              # Format (required before every commit)
cargo check                  # Type check
cargo clippy                 # Lint
cargo test                   # Run backend tests

# Frontend (use bun, never npm/yarn)
cd web && bun install && bun run build
cd web && bunx playwright test            # Run all E2E tests
cd web && bunx playwright test smoke      # Run smoke tests only

# Deploy smoke test
scripts/smoke-test.sh        # Run post-deploy health + smoke checks
```

## Code Conventions

- Use `bun` for all JavaScript operations (never npm/yarn)
- `cargo fmt --all` before every commit
- Dark theme — slate color palette for UI
- shadcn/ui components — no window.alert/confirm/prompt
- Loading states use skeleton components, not spinners
