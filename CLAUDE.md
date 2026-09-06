# Panoptikon — Claude Code Guidelines

## Gateway Roadmap Constraints (Mandatory)

The canonical roadmap is
[`docs/GATEWAY-ARCHITECTURE.md`](docs/GATEWAY-ARCHITECTURE.md), implementing the
decision in [#834](https://git.oklabs.uk/BeFeast/panoptikon/issues/834). Every worker
must preserve these boundaries:

- **Current:** Controller mode and supported MikroTik and pfSense integrations
  remain supported. VyOS was removed by migration 026 and must not be described
  as shipped or supported.
- **Planned:** the primary x86-64 Gateway uses separate unprivileged
  `panoptikon-core` and privileged `panoptikon-routerd` processes; the isolated
  Proxmox Gateway VM is mandatory for development/verification; Panoptikon Edge
  uses OpenWrt `ubus`/UCI with target-specific packaging.
- **Blocked:** do not claim native forwarding, routerd, OpenWrt firmware, or
  commit-confirm is shipped until implementation and the documented packet-path,
  failure, and recovery gates pass.
- Local Core↔routerd transport is a restricted Unix socket; remote transport is
  mTLS. Both use the shared capability/desired-state/transaction contract.
- Commit-confirm and out-of-band recovery are blocking invariants, not optional
  follow-up work.
- Never use the working production router or current Controller-mode LXC 115 for
  Gateway experiments.
- ER605 V1 is sacrificial HIL/recovery hardware only, never the reference
  appliance.
- Do not promise one executable or backend across x86-64 and constrained
  OpenWrt/MIPS-class targets.
- When documenting roadmap work, use **current**, **planned**, and **blocked**
  explicitly and keep shipped behavior separate from accepted direction.

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

## Repository, CI and Deploy (Forgejo)

- Canonical repo: <https://git.oklabs.uk/BeFeast/panoptikon> (Forgejo). GitHub is a weekly
  read-only push mirror — never open issues/PRs there and never target it with tooling.
- CI is Forgejo Actions: workflows live in `.forgejo/workflows/` (there is no `.github/`).
  `ci.yml` must keep running on `push` to `main` and on `pull_request`, and must keep the
  Playwright E2E gate and the Caddy integration suite (C-01..C-24, real Caddy 2.11.x) green.
- Runner labels: `ubuntu-latest` is the isolated default (container, **no Docker socket**
  inside the job — start services as background processes, not `docker run`); `heavy` runs
  on the host with Docker available; `ci-interactive` is reserved and must not be used.
- Actions: use full URLs (`https://code.forgejo.org/actions/checkout@v4`); artifacts only via
  the Forgejo forks `https://code.forgejo.org/forgejo/upload-artifact@v4` /
  `download-artifact@v4`; prefer plain shell over third-party GitHub actions.
- Automated PR review comes from the org PR-Agent webhook (nothing to configure here).
  Dependency updates come from org-hosted Renovate (`BeFeast/renovate`), not Dependabot.
- Production deploy: `scripts/deploy-worker.sh` downloads the `panoptikon-server-linux-x86_64`
  artifact of the latest successful `push` run of `ci.yml` on `main` through the Forgejo API
  (read-only `FORGEJO_TOKEN`, see `DEPLOY.md`), verifies sha256 sidecar + metadata, and ships
  it to LXC 115 where it is smoke-tested (`--version`) before the running service is swapped.
  The artifact contract (flat zip: binary, `.sha256`, `deploy-metadata.json`) is enforced —
  change `ci.yml` and the worker together. `scripts/deploy-lxc.sh` is the manual fallback.
- No container image is published any more; `docker-compose.yml` builds from the Dockerfile
  (`docker compose up -d --build`) and is the demo/self-host path only.

## Project Structure

- `server/` — Rust backend (axum, SQLite)
- `web/` — Next.js frontend (TypeScript, shadcn/ui)
- `web/tests/e2e/` — Playwright E2E tests
- `web/e2e/fixtures.ts` — Shared test fixtures (login, setup)
- `scripts/` — Build and deploy scripts
- `.forgejo/workflows/` — Forgejo Actions CI workflows

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
- Dark theme — navy/cobalt/cyan operator-console color palette for UI
- shadcn/ui components — no window.alert/confirm/prompt
- Loading states use skeleton components, not spinners
