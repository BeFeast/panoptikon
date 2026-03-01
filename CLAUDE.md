# Panoptikon — Claude Code Guidelines

## E2E Test Requirement

Every PR that implements a feature or bug fix **MUST** include a Playwright E2E test that verifies the change actually works.

### Rules

1. **Test must exist**: Add or update a Playwright test in `web/tests/e2e/` that exercises the new behavior.
2. **Test must be meaningful**: The test should fail before the fix/feature and pass after. A test that always passes is not a real test.
3. **Test must cover the user flow**: If you changed a settings page, test save → reload → verify persisted. If you added UI, test that it renders and responds to interaction.
4. **No test = justification required**: If the change is genuinely untestable (e.g., documentation-only, CI config, dependency bump), the PR description must explain why under a `## Why No E2E Test` section.

### What to test

| Change type | Required test |
|---|---|
| New settings field | Save value → reload → assert value persists |
| New page / route | Navigate to page → assert key elements render |
| Bug fix | Reproduce the bug scenario → assert it no longer occurs |
| API endpoint | Call endpoint → assert response (can use Playwright `request` context) |
| Layout change | Load page → screenshot → assert no visual regression |

### Test patterns

- Tests live in `web/tests/e2e/*.spec.ts`
- Use fixtures from `web/e2e/fixtures.ts` (`login`, `setupIfNeeded`, `expect`)
- Follow existing test patterns (see `settings-router.spec.ts`, `devices.spec.ts`)
- Take screenshots for visual verification: `page.screenshot({ path: 'tests/screenshots/<name>.png' })`

### Smoke tests

After every deploy to LXC 115, the smoke test suite runs automatically:
- Health check: `curl -sf http://10.10.0.22:8080/api/health`
- Playwright smoke suite: `bunx playwright test --grep @smoke`
- If smoke fails, the deploy is NOT marked as successful and Oleg is alerted.

## Build & Format

- Run `cargo fmt --all` before every commit
- Run `cargo check` before pushing — don't open PRs with compile errors
- Use `bun` for all JS operations (never npm/yarn)

## Project Structure

```
server/           — Rust backend (axum, SQLite)
web/              — Next.js frontend (TypeScript)
web/tests/e2e/    — Playwright E2E tests
web/e2e/          — Playwright fixtures
scripts/          — Deploy and utility scripts
```
