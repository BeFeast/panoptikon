# Panoptikon — Development Guidelines

## E2E Test Requirement (Mandatory)

Every PR that implements a feature or bug fix **MUST** include a Playwright E2E test that verifies the change actually works.

### Rules

1. **Test must exist** — Add or update a test in `web/tests/e2e/` that exercises the feature end-to-end.
2. **Test must fail before, pass after** — The test should demonstrate the fix/feature works. If modifying an existing test, the old behavior should fail and the new behavior should pass.
3. **No test = explicit justification** — If the change is genuinely untestable (e.g., pure CI config, docs-only), the PR description must include a section:
   ```
   ## Why no E2E test
   <explanation>
   ```
4. **Settings changes need roundtrip tests** — Any change to a settings page must include a save → reload → verify test (see existing patterns in `settings-xiaomi.spec.ts` and `settings-router.spec.ts`).
5. **UI changes need visual coverage** — Layout changes, new pages, or component changes should have screenshot assertions or at minimum verify elements are visible and correctly positioned.

### Test patterns

- Test files go in `web/tests/e2e/<feature>.spec.ts`
- Use shared fixtures from `web/e2e/fixtures.ts` (`login`, `setupIfNeeded`, `test`, `expect`)
- Follow existing test structure: `test.describe` → `test.beforeEach` (login + navigate) → individual `test()` cases
- Run tests locally: `cd web && bunx playwright test`
- Run a specific test: `cd web && bunx playwright test tests/e2e/<file>.spec.ts`

### Smoke tests

After deploy, a smoke test suite runs automatically to verify the deployment is healthy. Tests tagged with `@smoke` in `web/tests/e2e/smoke.spec.ts` cover:

- Health endpoint responds
- Login page loads
- Dashboard loads after authentication
- Key pages (Devices, Settings) are accessible
- No JavaScript errors or crashes

## Project Structure

```
panoptikon/
├── server/                 # Rust backend (axum, SQLite)
│   └── src/
│       ├── api/mod.rs      # Route registration
│       ├── api/<feature>.rs # Handlers
│       └── db/             # Database models
└── web/                    # Next.js frontend (TypeScript)
    └── src/
        ├── app/(app)/      # Pages
        ├── components/     # Shared components (shadcn/ui)
        └── lib/
            ├── api.ts      # API client functions
            └── types.ts    # TypeScript types
```

## Build & Test Commands

- **Rust format**: `cargo fmt --all`
- **Rust check**: `cargo check -p panoptikon-server`
- **Rust test**: `cd server && cargo test`
- **Frontend build**: `cd web && bun install && bun run build`
- **E2E tests**: `cd web && bunx playwright test`
- **Smoke tests**: `cd web && bunx playwright test tests/e2e/smoke.spec.ts`

## Code Quality

- Run `cargo fmt --all` before every commit
- Run `cargo check` before pushing
- Follow existing code patterns — look at similar files before writing
- Use shadcn/ui components, dark theme with slate palette
- No `window.alert/confirm/prompt` — use AlertDialog instead
