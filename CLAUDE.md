# Panoptikon — Developer Guidelines

## E2E Test Requirement (Mandatory)

Every PR that implements a feature or fixes a bug **MUST** include a Playwright E2E test that verifies the change actually works.

### Rules

1. **New feature PRs** must include at least one Playwright test in `web/tests/e2e/` that:
   - Exercises the feature through the UI or API
   - Asserts the expected behavior (not just "page loads")
   - Would fail if the feature were removed

2. **Bug fix PRs** must include a test that:
   - Reproduces the bug (fails before the fix)
   - Passes after the fix

3. **If a test is genuinely impossible** (e.g., pure refactor with no behavior change, docs-only change, CI config change), the PR description must include a section:
   ```
   ## Why no E2E test
   <explanation of why this change cannot be tested with Playwright>
   ```

4. **Settings changes** must include a save → reload roundtrip test (see existing patterns in `web/tests/e2e/settings-router.spec.ts` and `web/tests/e2e/settings-xiaomi.spec.ts`).

5. **API endpoint changes** must include a test that calls the endpoint and verifies the response.

### Test patterns

- Test files go in `web/tests/e2e/<feature>.spec.ts`
- Import fixtures from `../../e2e/fixtures` (provides `login`, `test`, `expect`)
- Use `login(page)` in `beforeEach` for authenticated tests
- Take screenshots at key points: `await page.screenshot({ path: 'tests/screenshots/<name>.png' })`
- Use `{ timeout: 15000 }` for initial page load assertions

### Running tests locally

```bash
cd web
bunx playwright test                    # run all E2E tests
bunx playwright test settings-router    # run specific test file
bunx playwright test --headed           # run with browser visible
```

## Code Quality

- Run `cargo fmt --all` before every commit
- Run `cargo check` before pushing
- Run `cargo test` to verify Rust tests pass
- Follow existing code patterns — look at similar files before writing new code

## Project Structure

```
server/          — Rust backend (axum, SQLite)
web/             — Next.js frontend (TypeScript)
web/tests/e2e/   — Playwright E2E tests
web/e2e/         — Test fixtures (login, setup helpers)
scripts/         — Build, deploy, and test scripts
```
