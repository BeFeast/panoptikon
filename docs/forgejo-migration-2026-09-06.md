# Forgejo migration — CI/CD conversion notes (2026-09-06)

Generated during the GitHub → Forgejo cutover. Three items (ci, release, deploy), each adversarially reviewed before landing.

---

## CHANGES — item `ci` (GitHub Actions CI -> Forgejo Actions CI)

Scope of this item: only the CI workflow. Deploy worker + docs are item `deploy` (done, see `CHANGES-deploy.md`); release/docker/version-bump workflows are item `release`; dependabot and greptile removal are listed in `DELETE-deploy.txt`.

## Added

| Path | Reason |
|---|---|
| `.forgejo/workflows/ci.yml` | Forgejo replacement for `.github/workflows/ci.yml`: same three gates (`rust`, `frontend`, `e2e`) on `push` to `main`, `pull_request` to `main`, plus `workflow_dispatch`. `concurrency: ci-${{ github.ref }}` with `cancel-in-progress: ${{ github.event_name == 'pull_request' }}` — superseded PR runs are cancelled, main runs queue so every merge leaves a deployable artifact. |

## Deleted (`DELETE-ci.txt`)

| Path | Reason |
|---|---|
| `.github/workflows/ci.yml` | Superseded by `.forgejo/workflows/ci.yml`. GitHub becomes a read-only push mirror; a workflow left behind would keep firing on the mirror against `blacksmith-*` runners that no longer exist. The same path is also in `DELETE-deploy.txt` — intentional overlap (both items depend on it being gone; deleting twice is a no-op), kept here because this item owns the replacement. |

## Modified

None in this item.

## What changed vs. the GitHub workflow, and why

| GitHub (`.github/workflows/ci.yml`) | Forgejo (`.forgejo/workflows/ci.yml`) | Why |
|---|---|---|
| `runs-on: blacksmith-4vcpu-ubuntu-2404` | `runs-on: ubuntu-latest` (baldr runner, `ghcr.io/catthehacker/ubuntu:act-24.04`, isolated, no docker socket) | `heavy` (host mode, docker) is not needed: nothing in this pipeline requires docker once Caddy is a plain binary. Isolation beats convenience for a job that runs on every PR. The image is buildpack-deps:24.04 + the act layer: gcc/g++/make, libssl-dev, libsqlite3-dev, pkgconf (via libglib2.0-dev), jq, curl, git, unzip, node 24, runs as root (verified from the image config + `act.sh` + the noble package index, 2026-09-06). |
| `actions/checkout@v4`, `actions/cache@v4`, `actions/upload-artifact@v4` (floating tags) | full code.forgejo.org URLs pinned by commit SHA with the tag in a trailing comment (Renovate keeps them current): `actions/checkout@11d5960a…` (= v4 = v4.4.0), `actions/cache@0057852b…` (= v4 = v4.3.0), `forgejo/upload-artifact@16871d9e…` (= v4, commit "v4.3.1: disable GHES check"), `forgejo/download-artifact@d8d0a990…` (= v4, commit "v4.1.4: disable GHES check") | Full URLs are required on Forgejo; upstream `actions/upload-artifact@v4` does not work there, only the forgejo forks do. SHA pinning is the org convention (BeFeast/ok-gobot). For the two artifact forks the pin is what their floating `v4` resolves to; their upstream-named tags `v4.3.1` / `v4.1.4` are the *unpatched* parents and must not be "upgraded" to. All SHAs resolved with `git ls-remote --tags` and the commit messages read through the code.forgejo.org API on 2026-09-06. |
| `dtolnay/rust-toolchain@stable`, `oven-sh/setup-bun@v2` with `bun-version: latest` | plain shell: rustup installer with `--default-toolchain 1.98.1 -c clippy -c rustfmt` (`RUST_TOOLCHAIN`, asserted via `rustc --version`), `bun.sh/install` with `bash -s bun-v1.4.2` (`BUN_VERSION`, asserted via `bun --version`), plus an idempotent `apt-get install build-essential pkg-config libssl-dev ca-certificates curl jq` guard | No dependency on GitHub-hosted actions. Every third-party input is pinned because the uploaded binary is what `scripts/deploy-worker.sh` ships to production. 1.98.1 = current stable (channel dated 2026-09-03), 1.4.2 = latest bun (both verified). No `rust-toolchain.toml`, `rust-version` or `packageManager` in the repo competes with these pins. |
| Caddy via `docker run -p 2019:2019 caddy:2-alpine` with `{"admin":{"listen":"0.0.0.0:2019"}}` | Caddy **2.11.4 with the cloudflare DNS module** (`CADDY_VERSION`), extracted docker-free from `ghcr.io/caddybuilds/caddy-cloudflare:2.11.4` (anonymous GHCR token -> image index -> linux/amd64 manifest -> layers walked in reverse -> `usr/bin/caddy`), cached per version via `actions/cache`, started in the job container with `{"admin":{"listen":"127.0.0.1:2019"}}`; asserts `caddy version` == `v2.11.4` and `dns.providers.cloudflare` in `caddy list-modules`; readiness probes `127.0.0.1:2019` and then `http://localhost:2019/config/` (exactly what the tests dial). | No docker socket on `ubuntu-latest`. `caddyserver.com/api/download` was rejected because it ignores `version=` (requesting v2.10.0 returned a v2.11.4 build), so it cannot pin. Loopback bind: the tests and `server/src/api/caddy.rs` only ever talk to `localhost:2019`; `0.0.0.0` was only needed for the separate container. Live-verified on shtrudel (Linux) 2026-09-06 with the extracted binary: `curl localhost` tries `::1` (refused) and falls back to `127.0.0.1` (200); Host headers `localhost:PORT`, `127.0.0.1:PORT`, `[::1]:PORT` are accepted (200), a foreign Host gets 403. Layer detection lists the tarball to a file first (`tar -tzf > list; grep -qx`), avoiding the `tar | grep -q` + `pipefail` SIGPIPE race on large layers. |
| `cargo build --release --all-targets` | `cargo build --release --workspace --bins` | `--all-targets` in release also compiled every test binary in release profile without running it. Tests are still compiled and run in the dev profile by the unchanged `cargo test` steps (`--lib --bins --test integration`, then `--test caddy_integration -- --test-threads=1`). Clippy still runs with `--all-targets --all-features`. |
| cache paths included `~/.cargo/bin/`; incremental compilation on | `~/.cargo/registry/{index,cache}`, `~/.cargo/git/db`, `target/`; key `${{ runner.os }}-cargo-${{ hashFiles('**/Cargo.lock') }}` + `restore-keys` prefix; `CARGO_INCREMENTAL: "0"` | Caching `~/.cargo/bin` would clobber the rustup proxies installed seconds earlier. `CARGO_INCREMENTAL=0` keeps `target/` (and each cache entry) smaller; incremental gives nothing on CI. Cache growth on baldr is bounded by the runner's cache server GC: entries unused for 7 days or older than 30 days are removed hourly (`forgejo/runner` `act/artifactcache/caches.go`, `keepUnused`/`keepUsed`). Bun (`~/.bun/install/cache`) and Playwright browsers (`~/.cache/ms-playwright`) are cached on `hashFiles('web/bun.lock')`. |
| e2e job re-installed Rust and rebuilt the server from cache | e2e downloads the binary the `rust` job just uploaded (`forgejo/download-artifact`), verifies its `.sha256`, starts it, then `bun install`, `bunx playwright install chromium --with-deps`, `bunx playwright test` | Tests the exact artifact that would be deployed and drops the Rust toolchain from the e2e job. Chromium runs headless inside act-24.04 (`--with-deps` apt-installs the shared libs; the container runs as root). Playwright report + server log uploaded on failure. |
| artifact `deploy-server-amd64` = `target/release/panoptikon-server` + `deploy-metadata.json`, only on `push` to `main`; metadata written by expanding `${{ github.sha }}` etc. inside a heredoc | artifact **`panoptikon-server-linux-x86_64`**, staged in `dist/` so the zip is flat: `panoptikon-server`, `panoptikon-server.sha256`, `deploy-metadata.json`; uploaded on **every** run (e2e consumes it); `retention-days` 3 on pull requests, 30 otherwise. Metadata built with `jq -n --arg` from a step-level `env:` block (`SHA`, `REF_NAME`, `EVENT`, `RUN_ID`, `RUN_NUMBER`, `REPO`, `SERVER_URL`); `run_url = ${SERVER_URL%/}/${REPO}/actions/runs/${RUN_NUMBER}`. | Name agreed with item `deploy`. Because PR runs upload too, the worker selects runs with `branch=main`, `event=push`, `status=success`. Fields gained: `event`, `run_number`, `run_url`, `artifact`. On Forgejo `run_id` is the instance-global id (API `id`, what the worker stores) while web run pages use the per-repo index = `run_number` (`services/actions/context.go`: `RunNumber: fmt.Sprint(run.Index)`; live: ok-gobot run `id=1399` has `html_url …/actions/runs/148`); `server_url` is `setting.AppURL`, which always ends in `/` (`modules/setting/server.go`), hence the `%/` trim. Context values go through `env:` so nothing is interpolated into script text. On PR builds `branch` is Forgejo's `ref_name` = `<n>/head` — informational, never deployed. |
| background processes started with bare `&` | `nohup ... > log 2>&1 < /dev/null &` | forgejo-runner runs each step through `docker exec`; a background child holding the step's stdout open would hang the step. Redirecting every fd is the act-safe pattern. |
| no `concurrency:` block | `group: ci-${{ github.ref }}`, `cancel-in-progress: ${{ github.event_name == 'pull_request' }}` | Forgejo docs (v16.0): with a group, `cancel-in-progress` defaults to **true** for push and pull_request(synchronize) and accepts expressions. Without the block, or with a plain `true`, a second quick merge to main would cancel the first run's artifact. This shape cancels only superseded PR runs and queues main runs. |
| eslint step `|| true` | kept `|| true` | Preserved as-is: lint was advisory on GitHub; making it blocking is a separate decision. |

## Runtime expectations on the baldr runner (capacity 2)

* `rust` and `frontend` run in parallel; `e2e` waits for `rust`.
* Cold `rust` job: apt (~30 s) + rustup (~40 s) + bun/web build (~1-2 min) + full Rust build/clippy/tests (cache miss, bounded by the box) + one-time Caddy extraction (~48 MB). Warm: cargo cache and Caddy cache hit.
* `timeout-minutes`: rust **90** (untested cold budget; tighten once the first cold run is measured), frontend 20, e2e 30.

## Cross-item contract (item `deploy`, already done)

`tree/scripts/deploy-worker.sh` consumes exactly this contract: artifact `panoptikon-server-linux-x86_64`, flat zip with `panoptikon-server` + `.sha256` + `deploy-metadata.json`, run selection `workflow_id=ci.yml`, `ref=main`, `event=push`, `status=success` via the Forgejo REST API, keyed on the global run `id` (= `run_id` in the metadata). `README.md`, `CLAUDE.md`, `DEPLOY.md`, `TESTING.md`, `docs/test-plan.md`, `docs/PRD.md` were updated in that item as well — nothing here is pending on the docs side.

## Verification performed (2026-09-06)

* YAML parses (PyYAML); every `run:` block passes `bash -n`; every `uses:` is a full URL pinned to a 40-hex SHA; no `${{ }}` inside any `run:` script.
* Action SHAs: `git ls-remote --tags` on code.forgejo.org for all four actions; commit messages of the two artifact-fork pins read via `GET /api/v1/repos/forgejo/{upload,download}-artifact/git/commits/<sha>`.
* Forgejo facts: `GET https://git.oklabs.uk/api/v1/version` = 16.0.3; run `id` vs `index_in_repo` vs `html_url` on BeFeast/ok-gobot; `services/actions/context.go`, `modules/setting/server.go` at tag v16.0.3; concurrency semantics from the v16.0 reference page.
* act-24.04 image: OCI config history (buildpack-deps:24.04 package list, `USER root`, node 24 on PATH), catthehacker `act.sh` package list, Ubuntu noble `Packages` index closure (`libglib2.0-dev -> pkgconf`, `pkgconf Provides pkg-config`).
* Caddy: extraction recipe + `127.0.0.1` bind + `localhost`/`::1` fallback + Host-origin matrix executed on shtrudel with the real 2.11.4 cloudflare build (`refs/caddy-verify-loopback.sh`).
* Pins: `channel-rust-1.98.1.toml` exists and `channel-rust-stable.toml` = 1.98.1; `bun-v1.4.2` is the `releases/latest` redirect target; `bun.sh/install` accepts the tag as `$1`.
* Repo: `web/bun.lock`, `web/scripts/check-design-tokens.sh`, `web/playwright.config.ts` exist; `server/tests/caddy_integration.rs` uses `http://localhost:2019`; `Cargo.toml` `[workspace.package] version` matches the `grep '^version'` extraction; `[[bin]] name = "panoptikon-server"`; `openssl-sys` present without `openssl-src`.

## Review notes

Each reviewer critique was re-verified before acting; dispositions:

1. **run_url uses `run_id` and double slash** (runner-compat minor + equivalence major) — **confirmed and fixed**: `run_url` is now built in shell as `${SERVER_URL%/}/${REPO}/actions/runs/${RUN_NUMBER}`; `run_id` stays the global id the worker compares against. Verified against Forgejo source and the live ok-gobot run (`id=1399`, `html_url …/runs/148`). The `branch = <n>/head` on PR builds is documented in the workflow header.
2. **"act-24.04 has no C toolchain" comment** (runner-compat minor) — **confirmed and fixed**: comments and this file now state buildpack-deps:24.04 (gcc/g++/make/libssl-dev/libsqlite3-dev), root, node 24. Went one step further than the critique: `pkgconf` is present too (transitively via `libglib2.0-dev`, Ubuntu noble index), so the apt step is described as a pure drift guard, not as the source of pkg-config.
3. **Floating `@v4` tags** (runner-compat minor + safety minor) — **confirmed and fixed**: all `uses:` pinned by SHA with a tag comment. One correction to the critique's data: `actions/checkout` `v4` resolves to `11d5960a…` = **v4.4.0**, not v4.3.0 (v4.3.0 is `08eba0b2…`); the comment says v4.4.0. The artifact forks are pinned to the GHES-patched commits their `v4` points to (`v4.3.1: disable GHES check` / `v4.1.4: disable GHES check`), not to the upstream-named tags.
4. **Caddy IPv4-only bind vs `localhost` -> `::1` first** (runner-compat minor, advisory) — **verified, no change to the design**: the `[::1]` path is refused instantly and curl/hyper fall back to `127.0.0.1` (live matrix on shtrudel above); switching to `:2019` dual-stack would widen the bind, which contradicts the safety critique. The readiness loop probes `127.0.0.1` and then `localhost` (the exact form the tests use), so a resolver/Host problem fails the job at Caddy start-up with the log printed, not inside the test run.
5. **`cancel-in-progress: true` cancels main runs** (equivalence minor) — **confirmed and fixed**: `cancel-in-progress: ${{ github.event_name == 'pull_request' }}` (Forgejo docs confirm the expression form and that the default with a group is `true`). Noted in the Added row and the comparison table.
6. **`tar | grep -q` under `pipefail` (SIGPIPE)** (equivalence minor + safety minor) — **confirmed and fixed**: the listing goes to a file first, then `grep -qx` on the file; the live extraction on shtrudel used the new form.
7. **`target/` cached with incremental on** (equivalence minor) — **confirmed and fixed** with `CARGO_INCREMENTAL: "0"`. Not done: `cargo-sweep` (an extra install per run to trim something the runner already garbage-collects) and the `cache/restore` + `cache/save if: always()` split (two more pinned action refs for the marginal case of a failed PR warming the cache). Verified the runner-side bound: forgejo-runner's cache server GC drops entries unused for 7 days / older than 30 days.
8. **`timeout-minutes: 60` untested** (equivalence minor) — **accepted**: 90 minutes with a comment to tighten after the first measured cold run.
9. **Stale "Follow-ups owned by other items" + duplicate delete** (equivalence minor) — **confirmed and fixed**: section replaced by "Cross-item contract (item `deploy`, already done)". `.github/workflows/ci.yml` stays in `DELETE-ci.txt` (this item owns the replacement) and the overlap with `DELETE-deploy.txt` is called out as intentional; the other item's list is not this item's file to edit.
10. **Admin API on `0.0.0.0:2019`** (safety minor) — **confirmed and fixed**: `127.0.0.1:2019`; Caddy's default origins for a loopback listener accept `localhost`, `127.0.0.1` and `[::1]` (verified: 200/200/200, foreign Host 403).
11. **Everything on mutable references (actions, bun, `stable`)** (safety minor) — **confirmed and fixed**: SHA pins, `BUN_VERSION: "1.4.2"` passed to the installer in all three jobs and asserted, `RUST_TOOLCHAIN: "1.98.1"` asserted via `rustc --version`.
12. **Template values interpolated into the heredoc** (safety minor) — **confirmed and fixed**: step-level `env:` + `jq -n --arg`; no `${{ }}` remains inside any `run:` block (checked mechanically).

Additional change made while finalizing (not from a critique): `retention-days` now keys on `event_name != 'pull_request'` instead of `== 'push'`, so a `workflow_dispatch` run on main keeps its artifact 30 days like a push (the header text was already promising "3 days on pull requests").

---

## CHANGES — item `release` (release / version-bump / docker workflows -> Forgejo)

Scope: `.github/workflows/release.yml`, `version-bump.yml`, `docker.yml` and everything the
release contract touches (installer, agent-download fallback, Cargo metadata, compose demo).
CI is item `ci`; deploy worker + docs are item `deploy`. Revised after review (see `## Review notes`).

Baseline facts that shaped the decisions (verified 2026-09-06 against Forgejo v16.0.3 sources on
codeberg, the Forgejo docs, and the live instance):

- GitHub has **zero** releases and `release.yml` **never ran** (no workflow runs at all); the last four
  `docker.yml` runs all failed. The existing `cross` musl builds could not have worked anyway:
  `ssh2 -> libssh2-sys -> openssl-sys` needs an OpenSSL for the target and cross-rs images ship none.
  So nothing depends on the old pipeline's output; the port is free to fix it properly.
- Forgejo 16.0.3 serves `/{owner}/{repo}/releases/download/<tag>/<asset>` (200, tested on ok-gobot)
  but **not** `/releases/latest/download/<asset>` (404). "Latest" must be resolved via
  `GET /api/v1/repos/{owner}/{repo}/releases/latest`. A stable raw-file URL does exist:
  `/{owner}/{repo}/raw/branch/main/scripts/install.sh` (200 today).
- `BeFeast/panoptikon` already exists on git.oklabs.uk with tags through `v0.6.105`, Actions enabled,
  **no** release yet (`/releases` -> `[]`, `/releases/latest` -> 404).
- baldr runner (`/etc/forgejo-runner/config.yml`, read live): labels `heavy:host`,
  `docker:docker://data.forgejo.org/oci/node:22-bookworm`,
  `ubuntu-latest:docker://ghcr.io/catthehacker/ubuntu:act-24.04`, capacity 2, `docker_host: "-"`.
  The act-24.04 image (probed live on baldr, `docker run --rm ... command -v`): root, Ubuntu 24.04.4,
  curl 8.5.0, git, gcc/g++/make, perl with core modules, pkg-config, jq, **unzip, xz, file** all
  present; **no** rustup/cargo/musl-gcc/libssl-dev; apt works.
- The automatic token (`${{ github.token }}` == `forgejo.token`) has write permission to the
  repository for every event except pull requests from forks (Forgejo docs, "Automatic token");
  ok-gobot's `release.yml` proves it creates releases on this instance.
- **Forgejo never starts a workflow for a change authored with the automatic token** — exactly like
  GitHub. `services/actions/notifier_helper.go::Notify` returns before workflow detection when
  `input.Doer.IsActions()`; a git push authenticated with a task token runs as the Actions user
  (`routers/web/repo/githttp.go` sets `EnvPusherID` from `ctx.Doer.ID`, `services/repository/push.go`
  maps `ActionsUserID` to `NewActionsUser()`). Docs: "no workflow will be triggered as a side effect of
  a change authored with this token". The earlier draft claimed the opposite and added `[skip ci]`;
  that was wrong (see Review notes).
- Forgejo's skip strings (`[skip ci]`, `[ci skip]`, `[no ci]`, `[skip actions]`, `[actions skip]`) are
  matched against the **commit message** of every `push` event, tag pushes included
  (`skipWorkflows`, `setting.Actions.SkipWorkflowStrings`). A `[skip ci]` commit therefore also mutes
  any release tag a person pushes at it.
- Forgejo does **not** aggregate matrix rows in `needs.<job>.result`: `services/actions/job_emitter.go
  ::prepareJobForEmitting` fills `jobResults[job.JobID] = job.Status.String()` in a loop over the run's
  jobs, and matrix rows share `JobID`, so the last row wins. A dependent job's `if:` can see `success`
  while one row failed.
- `github.server_url` on Forgejo is `setting.AppURL`, which ends with `/`
  (`https://git.oklabs.uk/`); `https://git.oklabs.uk//api/v1/version` answers 200, so a naive join
  works but bakes `//` into user-facing text.
- `github.event.head_commit.message` exists on Forgejo push payloads (`structs.PushPayload.HeadCommit`).

## Added

| Path | Reason |
|---|---|
| `.forgejo/workflows/release.yml` | Replaces `.github/workflows/release.yml`. `on: push tags v*` + `workflow_dispatch` (`tag`, `include_macos`, `replace_existing`). Jobs: `frontend` (bun pinned `1.4.2`, `ubuntu-latest`, validates the tag: SemVer, points at HEAD, **reachable from `origin/main`**) -> `build-linux` matrix amd64/arm64 (`ubuntu-latest`, rustup pinned `1.98.1` with assertion, static musl via `scripts/release-build-linux.sh`, only `~/.cargo/{registry,git}` cached) -> optional `build-macos` matrix arm64/amd64 (`runs-on: macos`, only when `include_macos`; pinned toolchain via `RUSTUP_TOOLCHAIN`, `file` asserts the Mach-O architecture of each asset) -> `release` (**asserts the complete expected asset set** before checksumming, generated notes with `${SERVER_URL%/}`, publish via REST with the run token, `--expect` for every asset, `--replace` only when `replace_existing`). Idempotent apt guards (`unzip` / `xz-utils file perl make`) with `DEBIAN_FRONTEND=noninteractive`, matching ci.yml. Only `code.forgejo.org` actions: `actions/checkout@v4`, `actions/cache@v4`, `forgejo/upload-artifact@v4`, `forgejo/download-artifact@v4` (v4 tags verified). |
| `.forgejo/workflows/version-bump.yml` | Port of `.github/workflows/version-bump.yml` (same bump algorithm, atomic push of `main` + tag). Pushes with the automatic token persisted by checkout; rustup pinned to `1.98.1`. Bump commit message is `chore: bump version to X [skip-bump]` — **no `[skip ci]`**: the Actions-user push starts no workflow by itself, and `[skip ci]` would also mute a release tag a person pushes at the bump commit. `[skip-bump]` + the `chore: bump version` prefix + the `if:` guard stay for hand-pushed bump commits. Consequences documented in the header: a bump tag never releases itself (use Release -> Run workflow), and the bump commit gets no CI run, so the deploy worker ships the merge commit's binary (version N) while main's Cargo.toml reads N+1 — the same offset as on GitHub. `maestro version-bump` remains the manual alternative. |
| `scripts/release-build-linux.sh` | Docker-free replacement for `cross`: pinned musl cross toolchain (cross-tools/musl-cross `20260823`, sha256-verified on **every** run now that it is no longer cached, `x86_64-unknown-linux-musl` / `aarch64-unknown-linux-musl`), `rustup target add`, `CC_*`/`AR_*`/`CARGO_TARGET_*_LINKER`, `cargo build --release --locked --features panoptikon-server/vendored-openssl`, asserts `file` reports a static binary of the right arch, runs `--version` for the host arch. Unchanged in this revision. Reproducible by hand on any x86_64 Linux. |
| `scripts/release-publish.sh` | curl + jq against the Forgejo REST API (paths verified in `swagger.v1.json`). **Immutable by default**: a published (non-draft) release for the tag is refused unless `--replace`. Retry-safe without overwriting anything: the release is created as a **draft**, assets are uploaded, then it is published (`PATCH {"draft": false}`); a draft left by a failed attempt is resumed. `--expect NAME` (repeatable) refuses to publish when a named asset is missing/empty (checked before any write). On `--replace`, title/notes are PATCHed **only if `--title`/`--notes` were given**, same-named attachments are deleted and re-uploaded, and every replaced name is listed at the end. The token never appears in argv: it is written to a 0600 header file under a 0700 mktemp dir and passed with `curl -H @file`; `FORGEJO_TOKEN` is unset after staging. Trailing `/` in `FORGEJO_API` is stripped. `--dry-run` does only the read-only lookups; exercised live (see Verification). |

## Modified

| Path | Reason |
|---|---|
| `server/Cargo.toml` | New feature `vendored-openssl = ["ssh2/vendored-openssl"]`. libssh2 needs OpenSSL; musl and cross targets have no system libssl, so release builds compile OpenSSL in (openssl-src). Off by default: dev/CI native builds are unchanged. (Unchanged in this revision.) |
| `Cargo.lock` | Adds `openssl-src 300.6.1+3.6.3` (only delta, +10 lines) so `--locked` release builds resolve. Generated with `cargo update --workspace`, validated with `cargo metadata --locked`. (Unchanged in this revision.) |
| `Cargo.toml` | `repository` -> `https://git.oklabs.uk/BeFeast/panoptikon` (deferred to this item by item `deploy`). (Unchanged in this revision.) |
| `scripts/install.sh` | Downloads from Forgejo: latest tag via `GET /api/v1/repos/BeFeast/panoptikon/releases/latest` (`tag_name`, sed-parsed, no jq needed), assets from `/releases/download/<tag>/<asset>`; `FORGEJO_URL` override; checksum grep anchored to the asset name. Header now advertises the **stable** one-liner `curl -fsSL https://git.oklabs.uk/BeFeast/panoptikon/raw/branch/main/scripts/install.sh \| sh` (200 today) and the pinned per-release form `.../releases/download/<tag>/install.sh \| sh -s -- panoptikon-server <tag>`. Shipped as a release asset. |
| `server/src/api/agents.rs` | The three fallbacks (Rust redirect, generated Unix installer, generated PowerShell installer) no longer pin `v<CARGO_PKG_VERSION>` — production runs `main` builds bumped per merge while releases are cut on demand, so that release almost never exists. They resolve the **latest published release at request/install time**: Rust `latest_release_tag()` (reqwest, 10 s timeout, `OnceLock` client, 10-minute cache in a `static Mutex`, tag sanitised before it goes into `Location`) -> `302`-style `TEMPORARY_REDIRECT` to `RELEASE_DOWNLOAD_BASE/<tag>/<asset>`, or **503** with a pointer to the releases page when Forgejo cannot be resolved (the generated installers then resolve the tag themselves). Unix installer: `curl … /releases/latest \| sed` with `v<version>` as last-resort fallback; PowerShell: `(Invoke-RestMethod …/releases/latest).tag_name` in try/catch with the same fallback. `cargo fmt --check` and `cargo clippy -p panoptikon-server --all-targets --features vendored-openssl -- -D warnings` clean. |
| `docker-compose.yml` | `image: ghcr.io/befeast/panoptikon:latest` -> `build: .` + `image: panoptikon:local`: no image is published any more, so the demo stack builds from the in-repo Dockerfile (`docker compose up --build`). (Unchanged in this revision.) |

## Deleted (see `DELETE-release.txt`)

| Path | Reason |
|---|---|
| `.github/workflows/release.yml` | Replaced by `.forgejo/workflows/release.yml` (blacksmith/GitHub macOS runners, `cross`, `softprops/action-gh-release`, `taiki-e/install-action` — none applicable). |
| `.github/workflows/version-bump.yml` | Replaced by `.forgejo/workflows/version-bump.yml`; would push to the read-only GitHub mirror. |
| `.github/workflows/docker.yml` | **Dropped, not ported.** GHCR push with `GITHUB_TOKEN`, Docker Hub, `useblacksmith/*` and QEMU multi-arch are all GitHub-specific; every recent run failed; production is the systemd binary in LXC 115 and the compose stack is a demo; nothing consumes the image. A `heavy`-runner port (hedroom pattern) would cost a host-mode multi-stage build per push plus registry storage for zero consumers. If an image is wanted later: `docker build -t git.oklabs.uk/befeast/panoptikon .` on `heavy` with the bot PAT from Infisical `services/prod/forgejo` (`OKLABS_BOT_USERNAME`/`OKLABS_BOT_PAT`) exactly as hedroom's `deploy.yml` does. |

## Design decisions

1. **Static musl for both Linux arches, no `cross`, no docker.** The original intent was musl
   (`*-unknown-linux-musl` via `cross`). Native glibc builds on the act-24.04 image would produce
   binaries needing glibc >= 2.38/2.39, which is wrong for a `curl | sh` installer aimed at arbitrary
   hosts. `musl-tools` from apt only covers the host arch, so a pinned prebuilt musl toolchain
   (cross-tools/musl-cross, GitHub release, checksums pinned in the script) is used for **both**
   targets — one code path, symmetric assets, and an `aarch64` build that is a first-class static
   binary rather than a glibc-dynamic one. The apt `gcc-aarch64-linux-gnu` route was rejected because
   it yields a glibc-dynamic arm64 asset and needs an arm64 OpenSSL via multiarch (fragile).
2. **Vendored OpenSSL feature instead of system libssl.** Only way to satisfy libssh2 on musl/cross
   targets with `--locked`. Side effect for item `ci`: `cargo clippy --all-targets --all-features`
   now also compiles openssl-src (perl + make present in the image; ~2-4 min once, then cached in
   `target/`). If that is unwanted, CI can enumerate features instead of `--all-features`.
3. **macOS is opt-in only.** `runs-on: macos` is a personal laptop that is often offline; a job
   queued for an offline runner would hold the `release` job forever (it `needs` macOS and waits
   for `skipped`/`success`). The old rule "auto-build macOS for `*.0.0` tags" is therefore dropped;
   `workflow_dispatch` with `include_macos` is the way. On that runner Rust lives in
   `$HOME/.panoptikon-ci/{rustup,cargo}` (no Homebrew, no touching the laptop's own `~/.cargo`), the
   pinned toolchain is installed idempotently and selected with `RUSTUP_TOOLCHAIN`; OpenSSL comes
   from the vendored feature, so `brew --prefix openssl@3` is gone. `x86_64-apple-darwin` is
   cross-compiled on the same Apple-silicon runner (Xcode CLT supports `-arch x86_64`) — **this
   path is unverified** (only the aarch64 `vendored-openssl` clippy build was run on a Mac); the
   job now asserts via `file` that each asset really is the advertised architecture, so a broken
   cross build fails the job instead of shipping a mislabelled binary. Run one `workflow_dispatch`
   with `include_macos` before relying on the first real macOS release.
4. **Automatic token, no secret.** `${{ github.token }}` creates the release and uploads assets
   (proven pattern on this instance: ok-gobot uses `forgejo.token` with the forgejo-release action).
   Plain curl was chosen over `https://data.forgejo.org/actions/forgejo-release` per the brief; the
   script is reusable from a shell/Maestro with a PAT. The token is passed to curl through a private
   header file, never on a command line (`heavy` jobs of other repos share the baldr host and
   `/proc/<pid>/cmdline` is world-readable).
5. **Release notes** are generated in-job (`git log prev-tag..tag`, compare link, quick-install block
   with the stable raw-URL one-liner and the tag-pinned `install.sh` form) — Forgejo has no
   `generate_release_notes`. `${SERVER_URL%/}` strips Forgejo's trailing slash.
6. **version-bump kept (ported), not replaced by Maestro; no `[skip ci]`.** 105 patch tags show the
   auto-bump-per-merge habit; dropping it would change versioning behaviour. Forgejo already drops
   every event whose doer is the Actions user, so the bump push starts neither CI nor Release nor
   itself — the same silence as on GitHub, with no marker needed. A `[skip ci]` marker would
   additionally mute a release tag a person pushes at the bump commit (main's HEAD after every
   merge), so it is deliberately absent. Releases are cut deliberately: Release -> Run workflow ->
   tag (the way to release a bump tag), or a person pushes / deletes-and-re-pushes a `v*` tag.
   Deploy consequence: the bump commit has no CI run, so `scripts/deploy-worker.sh` (latest
   successful `ci.yml` run on `main`) ships the merge commit's binary — `--version` reports N while
   main's Cargo.toml already says N+1. That is the pre-existing GitHub behaviour, not a regression;
   a release tag for N+1 is built from the bump commit itself.
7. **Published releases are immutable; retries are safe.** `release-publish.sh` creates the release as
   a draft, uploads, then publishes; an existing published release is refused unless `--replace`
   (workflow input `replace_existing`, never set on the tag-push path). Mirrors ok-gobot's
   `override: false`, while still letting a failed run be re-run (the draft is resumed).
8. **No complete-asset-set trust in `needs`.** Because Forgejo reports one matrix row's result per job
   id, the `release` job asserts every expected binary is present and non-empty (4 Linux, +4 macOS
   when `include_macos`) before checksumming, rejects unexpected files in the artifact directory, and
   passes the full list to `release-publish.sh --expect` as a second guard.
9. **Cache policy for release builds.** The runner cache is repository-scoped, not ref-scoped, so a
   release job restores only what cargo verifies itself (`~/.cargo/registry`, `~/.cargo/git` —
   checksums in `Cargo.lock`). The musl cross toolchain (compiler + linker of every published
   binary) is downloaded and sha256-verified on every run (~80 MB, seconds), and `target/` is never
   restored: a release always compiles from source. Cost: ~10 min per arch, in parallel (measured).
10. **Toolchains pinned to the CI pins.** `RUST_TOOLCHAIN=1.98.1`, `BUN_VERSION=1.4.2` in
    `release.yml` (and the Rust pin in `version-bump.yml`), asserted after install, copied from
    `ci.yml`. Bump all files together.

## Runtime expectations (baldr, capacity 2)

- `frontend` ~2 min. `build-linux` per arch: rustup ~40 s + toolchain download 80 MB + full release
  build incl. OpenSSL from source — **~9-10 min every time** (no `target/` cache by design, decision
  9); registry cache saves the crate downloads. amd64 and arm64 run in parallel (two runner slots).
  `release` < 1 min.
- Artifacts: `frontend`, `binaries-linux-{amd64,arm64}`, optionally `binaries-darwin-*`, 7-day retention.
- Release assets: `panoptikon-{server,agent}-linux-{amd64,arm64}`, `[…-darwin-{arm64,amd64}]`,
  `SHA256SUMS.txt`, `install.sh` — the names `scripts/install.sh` and `server/src/api/agents.rs` expect.

## Verification performed (2026-09-06, revised)

- Both workflow files parse (PyYAML); every `uses:` is a full `https://code.forgejo.org/...` URL with a
  tag verified to exist; `bash -n` on all 14 `run:` blocks of `release.yml` and all of
  `version-bump.yml`; `bash -n` / `sh -n` on all scripts; `sh -n` on the Unix installer text generated
  by `agents.rs` (extracted with the placeholders substituted). No `pwsh` locally — the PowerShell
  block was reviewed by eye only.
- `scripts/release-publish.sh --dry-run` against the live API: `--expect` with a missing asset fails
  before any lookup (exit 1); `BeFeast/panoptikon v0.6.105` -> 404 -> would POST a **draft** then
  `PATCH {"draft": false}`; `BeFeast/ok-gobot v0.15.2` (published, 4 attachments) -> **refused** without
  `--replace` (exit 1); with `--replace` and no `--notes`/`--title` -> no PATCH at all; with
  `--title` only -> `PATCH ["name"]`; colliding `checksums.txt` -> `DELETE …/assets/428` + POST and
  "would replace: checksums.txt"; bad tag and missing token rejected; `FORGEJO_API` with a trailing
  slash produces no `//`.
- Forgejo v16.0.3 sources fetched from codeberg and read for the claims above:
  `services/actions/notifier_helper.go` (`Notify`, `skipWorkflows`), `services/actions/job_emitter.go`
  (`prepareJobForEmitting`, `Resolve`), `routers/web/repo/githttp.go`, `services/repository/push.go`,
  `routers/api/v1/repo/release.go` + `release_tags.go` (draft releases are returned to a writer via
  `GET /releases/tags/{tag}`; `POST /releases` upgrades an existing tag-only record; `PATCH` accepts
  `draft`). Docs `docs/user/actions/basic-concepts.md` §Automatic token.
- act-24.04 image probed live on baldr (throwaway `docker run --rm`): `unzip xz file jq perl make gcc
  curl` present, curl 8.5.0 (`-H @file` supported), uid 0.
- `server/Cargo.toml` feature + `Cargo.lock`: `cargo metadata --locked` OK; `cargo tree -i openssl-src`
  shows the expected chain. After the `agents.rs` change: `cargo fmt --check` and
  `cargo clippy -p panoptikon-server --all-targets --features vendored-openssl -- -D warnings` pass
  (local cargo 1.96.1, aarch64-apple-darwin).
- Full dry run of the Linux path executed on **baldr inside the real `ubuntu-latest` image**
  (`docker run --rm ghcr.io/catthehacker/ubuntu:act-24.04`, throwaway container): rustup install,
  bun install + `next build`, then `scripts/release-build-linux.sh amd64` and `arm64` with the patched
  Cargo files — see the "Dry-run evidence" section below.

## Dry-run evidence (baldr, `ghcr.io/catthehacker/ubuntu:act-24.04`, 2026-09-06 13:58–14:19 UTC)

Throwaway `docker run --rm` container on the runner host, tag `v0.6.105` plus the patched
`server/Cargo.toml` / `Cargo.lock` and `scripts/release-build-linux.sh`, steps mirroring the workflow
(`/tmp/pano-dry` removed from baldr afterwards; full log kept in the scratchpad as
`panoptikon-forgejo/dryrun/baldr-dryrun.log`):

- rustup (stable at the time = **1.98.1**, the version now pinned) and bun (**1.4.2**, now pinned) +
  `bun install --frozen-lockfile` + `bun run build` (Next.js 15.5.12) succeed in the image. The dry run
  apt-installed `unzip xz-utils file` first as insurance; the later probe showed all three are already
  in the image, and the workflow now carries the same packages as idempotent guard steps, so the
  workflow as written matches what was exercised.
- `release-build-linux.sh amd64`: toolchain fetched and checksum-verified; `Finished release in 8m 11s`;
  `panoptikon-server: ELF 64-bit LSB pie executable, x86-64 … static-pie linked`, agent likewise;
  `--version` prints `panoptikon-server 0.6.105` / `panoptikon-agent 0.6.105`. Step wall time 8m41s.
- `release-build-linux.sh arm64`: `Finished release in 9m 34s`;
  `ELF 64-bit LSB executable, ARM aarch64 … statically linked` for both binaries. Step wall time 9m49s.
  (openssl-src, libssh2-sys, libsqlite3-sys, ring all cross-compiled with the aarch64 musl toolchain.)
- Sizes: server 43.6 MB (amd64) / 41.9 MB (arm64) — embedded `web/out`; agent 6.3 MB / 6.1 MB.
- sha256 of the dry-run assets: server amd64 `830e36a3…cb33f`, server arm64 `467b87e3…b8441`,
  agent amd64 `2f7cd8a7…eec80`, agent arm64 `f35ac3a0…4ad83`.
- Sequential total ~22 min cold; these numbers are now the steady state per release (decision 9),
  halved by the two arches running in parallel.
- macOS path (not runnable on the laptop from here): on this Mac (aarch64-apple-darwin, no Homebrew),
  `cargo clippy -p panoptikon-server --all-targets --features vendored-openssl -- -D warnings` compiles
  openssl-src with the system perl/make and finishes clean, and `cargo fmt --check` passes — the same
  feature path the `build-macos` job uses. The `x86_64-apple-darwin` cross build is **unverified**
  (decision 3).

## Review notes

Each critique was re-verified against the Forgejo v16.0.3 sources / live instance before acting.

| # | Lens / file | Verdict | Action |
|---|---|---|---|
| 1 | runner-compat + safety, `version-bump.yml` `[skip ci]` premise | **Confirmed.** `Notify()` drops Actions-user events before detection; a task-token push is attributed to the Actions user; `skipWorkflows` matches tag pushes. | ` [skip ci]` removed from the commit message; header, `if:` comment and this document rewritten to the real mechanism (baseline bullets, Added rows, decision 6). `[skip-bump]` + `if:` guard kept. |
| 2 | runner-compat + equivalence, `release.yml` partial matrix | **Confirmed.** `jobResults[JobID]` is overwritten per row; `Resolve()` moves the dependent job to waiting regardless of failures. | "Assemble" asserts the full expected set (+ rejects unexpected files); `release-publish.sh --expect` added and fed the same list. Matrices kept (split jobs would be equivalent but longer); documented in the job comment. |
| 3 | runner-compat, trailing slash in `github.server_url` | **Confirmed** (`setting.AppURL`; ci.yml already strips it). | `repo_url="${SERVER_URL%/}/$REPO"`; `FORGEJO_API` computed in-script from `${SERVER_URL%/}`; the script also strips a trailing `/` itself. |
| 4 | runner-compat + safety, `agents.rs` fallback pinned to `v<CARGO_PKG_VERSION>` | **Confirmed.** Live: `/releases` is `[]`; main is bumped per merge, releases on demand. | Rust redirect resolves the latest release through the API (cached 10 min) and answers 503 when unresolvable; both generated installers resolve the tag at install time with `v<version>` as last resort. |
| 5 | runner-compat + safety, floating toolchains | **Confirmed.** | `RUST_TOOLCHAIN=1.98.1` / `BUN_VERSION=1.4.2` env + assertions in all three rustup steps and the bun step; `version-bump.yml` pinned too. |
| 6 | runner-compat, "act image has no unzip" comment | **Confirmed wrong comment** — probe on baldr: `/usr/bin/unzip` (also xz, file, perl, make). | Kept the apt calls as idempotent image-drift guards with accurate comments and `DEBIAN_FRONTEND=noninteractive` (ci.yml pattern); `build-linux` gained the same guard for its own prerequisites so the dry run's `apt-get install unzip xz-utils file` is now representative. |
| 7 | equivalence, `release-publish.sh` wipes notes/title on re-run | **Confirmed** (`body: ""` and `name: <tag>` were always PATCHed). | PATCH sends only the fields explicitly given (`--title`, `--notes`); verified by dry run (`PATCH ["name"]` with `--title` only, no PATCH without either). |
| 8 | equivalence, no stable "latest installer" URL | **Confirmed** (`raw/branch/main/scripts/install.sh` -> 200). | Advertised as the stable one-liner in `install.sh` and in the generated release notes; the `/releases/download/<tag>/install.sh` form kept as the pinned variant (now with the tag passed as the version argument, otherwise it would resolve "latest" anyway). |
| 9 | equivalence, macOS amd64 cross build unverified / no arch assertion | **Confirmed.** | `file`-based architecture assertion per arch in "Collect binaries"; unverified status recorded in decision 3 and Dry-run evidence; one `include_macos` dispatch recommended before relying on it. |
| 10 | equivalence, `CHANGES` silent on the deploy version offset | **Confirmed** (offset exists — but it is caused by the Actions-user suppression, not by `[skip ci]`, and it already existed on GitHub). | Sentence added to decision 6 and to the `version-bump.yml` header. `DEPLOY.md` belongs to item `deploy` — flagged under Open items for a one-line note in its verification step. |
| 11 | safety, silent overwrite of published releases | **Confirmed** (no guard anywhere; ok-gobot uses `override: false`). | Immutable by default: draft -> upload -> publish flow, published release refused without `--replace`; `replace_existing` dispatch input (default false, never set on tag push); replaced attachment names logged at the end. |
| 12 | safety, token in curl argv | **Confirmed** (`heavy` jobs share the host). | 0600 header file in a 0700 mktemp dir, `curl -H @file` for every call incl. uploads; `FORGEJO_TOKEN` unset after staging; no `set -x`. |
| 13 | safety, cached musl toolchain trusted without re-verification; repo-scoped cache | **Confirmed** (`release-build-linux.sh` skips the download + `sha256sum -c` when the cached dir exists; runner cache has no ref scoping). | `~/.cache/musl-cross/` **and** `target/` removed from the cache; only `~/.cargo/{registry,git}` (verified by cargo against `Cargo.lock`) is restored. Went further than the suggested exact-key `target/` cache because a PR job can still write that exact key; cost is ~10 min per arch (decision 9). |
| 14 | safety, release from a tag on any branch | **Confirmed** (only format + points-at-HEAD were checked). | `fetch-depth: 0` on the `frontend` checkout and `git merge-base --is-ancestor <tag^{commit}> origin/main` (ancestor rather than ok-gobot's "== current main HEAD", so an older tag on main can still be released via dispatch). |

## Open items for the orchestrator / Oleg

- **First real run**: dispatch Release with `tag: v0.6.105` once the tree is on Forgejo `main` (a bump tag
  can only be released this way). Expect ~10 min for the Linux builds (parallel), cold every time by
  design. The tag `v0.6.105` (commit `5020424`) is an ancestor of `main` (`02702d7`, 5 commits ahead —
  verified via `compare/v0.6.105...main` and `git merge-base --is-ancestor`), so the on-main guard passes.
- Run one dispatch with `include_macos` before announcing macOS assets — the `x86_64-apple-darwin`
  cross build has not been executed anywhere yet (it now fails loudly instead of shipping a wrong arch).
- If `main` is branch-protected against the Actions user, `version-bump.yml`'s push will fail; either
  allow the Actions bot or switch the checkout `token:` to a bot PAT secret (a PAT push **would**
  trigger workflows, so the `[skip-bump]` / `chore: bump version` `if:` guard then becomes the only
  recursion stop — it is already in place).
- Item `deploy` / `DEPLOY.md`: add one line to the verification step that the deployed binary reports
  the merge commit's version (N) while `main`'s Cargo.toml is already N+1 after the bump; not a fault.
- GitHub as "distribution" mirror: the push mirror copies tags but never release assets. If public
  downloads via github.com are still wanted, a follow-up job (after the weekly mirror sync, e.g. on
  maestro) would have to re-create each Forgejo release on GitHub from its assets. Not done here.
- Item `ci` should know about the `vendored-openssl` feature cost under `--all-features` (decision 2),
  and that `release.yml`/`version-bump.yml` copy its `RUST_TOOLCHAIN` / `BUN_VERSION` pins — bump together.

---

## CHANGES — item `deploy` (deploy worker + docs for the Forgejo move)

Scope: `scripts/deploy-worker.sh` and every doc that referenced GitHub Actions / Greptile /
Dependabot / blacksmith or the GitHub repo as canonical. CI workflow (`.forgejo/workflows/ci.yml`)
is item `ci`; release/docker/version-bump workflow ports, `docker-compose.yml`, `scripts/install.sh`,
`server/src/api/agents.rs` and `Cargo.toml` are item `release` (`CHANGES-release.md`). The
Docker-related doc edits below coordinate with item `release`'s `docker-compose.yml` change
(`image: ghcr.io/...` → `build: .` + `image: panoptikon:local`; no image is published any more).

## Modified

| Path | Reason |
|---|---|
| `scripts/deploy-worker.sh` | **Source of builds:** `gh run list` / `gh run download` replaced by the Forgejo REST API (`FORGEJO_TOKEN` from env or `~/.config/forgejo/token.env`, base `https://git.oklabs.uk/api/v1`, repo `BeFeast/panoptikon`): newest `success` run of `ci.yml` on `main` with event `push` → artifact `panoptikon-server-linux-x86_64` on that run → `GET /actions/artifacts/{id}/zip`. The token is staged in a private header file (`curl -H @file`), never on argv or in the environment of ssh/scp children; the access probe is `/repos/{REPO}` (a repo-scoped token gets 403 on `/user`). **Artifact contract enforcement** (new): flat zip with `panoptikon-server`, `panoptikon-server.sha256` (verified) and `deploy-metadata.json` whose commit/branch/event must match the run and whose `version` must be a plain token (`^[0-9A-Za-z._+~-]{1,64}$`); ELF64 x86-64 and size checks; `ALLOW_UNVERIFIED_ARTIFACT=1` is the only override. Download + checks run in a subshell stage (`prepare_artifact`) so that a rejection never terminates `--watch`: exit 2 = transient (download/listing failed → nothing recorded, retried next poll), exit 1 = rejected → run written to `last-failed-run`, `last-deploy.json` status `rejected`, Telegram `rejected` notice, production untouched. **Production path rewritten** (not byte-identical to GitHub version): `deploy_binary` stages the file as `/usr/local/bin/panoptikon-server.new` via `pct push --perms 0755`, runs `timeout 15 panoptikon-server.new --version` **inside LXC 115** as a pre-flight, and only then `systemctl stop` → `mv -f` → `systemctl start` (remote exit 3 = pre-flight rejected, service untouched → `preflight_failed` state + Telegram; any other non-zero = failure after stop → rollback as before). Only the numeric LXC id (validated in `main`) is put on the remote command line — ssh flattens argv into one string the remote root shell re-parses, so the artifact's version string is no longer passed to the Proxmox host; the version comparison happens locally on the `PRE-FLIGHT OK:` line the remote echoes. **Failure memory:** `last-failed-run` marker (rejected / pre-flight / mid-deploy / health-check failures) so `--watch` and cron do not redeploy-fail-rollback the same build every poll (`RETRY_FAILED_RUN=1` retries). `last-deploy.json` is generated with `jq -n --arg` (artifact-controlled strings cannot break the JSON) and gains `forge`, `run_number`, `run_url`, `artifact_id`, `artifact_name`, `status`. **Telegram:** bot token fed through `curl -K -` (config on stdin, never argv), message body via `--data-urlencode`, links use the run's `html_url`, new statuses `preflight_failed` and `rejected`. **Ops:** new `--check` mode (resolve run + artifact, no download/deploy/lock); log redirect (`tee` to `logs/deploy-<ts>.log`) now happens before config loading so token-file mode / non-https warnings land in the log; `list_run_artifact_names` prints `<none>` for an empty run; state dir `chmod 700`; per-cycle temp dir removed (previously leaked in `--watch`); `VERIFY_EXEC=off|on|auto` gates executing CI output on the control host (default off — the in-LXC pre-flight is the mandatory dynamic check). |
| `README.md` | Top banner: canonical repo is `https://git.oklabs.uk/BeFeast/panoptikon`, GitHub is a weekly read-only push mirror, issues/PRs on Forgejo. Clone URL and the #834 issue link point at Forgejo. New short **Contributing** section (Forgejo Actions CI + E2E gate, PR-Agent review, org Renovate, artifact-driven deploy). |
| `CLAUDE.md` | #834 link → Forgejo. New **Repository, CI and Deploy (Forgejo)** section: canonical repo, `.forgejo/workflows/`, runner labels (`ubuntu-latest` has no Docker socket; `heavy`; `ci-interactive` reserved), Forgejo artifact-action forks, PR-Agent, Renovate, deploy worker contract (flat zip; change `ci.yml` and the worker together), and a bullet that **no container image is published any more** — `docker-compose.yml` builds from the Dockerfile (`docker compose up -d --build`) and is the demo/self-host path only. `.forgejo/workflows/` added to Project Structure. |
| `TESTING.md` | Automated tests section now documents the canonical split (`--test integration` then `--test caddy_integration -- --test-threads=1`) and a **Continuous integration** paragraph (Forgejo Actions, real Caddy 2.11.x with the cloudflare DNS module started as a background process because the default runner has no Docker socket, mandatory Playwright gate). |
| `DEPLOY.md` | Quickstart rewritten for the build-from-source compose stack: prerequisite `curl` → `git`; the `raw.githubusercontent.com` file downloads are gone, replaced by `git clone https://git.oklabs.uk/BeFeast/panoptikon.git` + `cp .env.example .env` + `docker compose up -d --build`; new note that **no pre-built container image is published** (GHCR/Docker Hub images stopped with the move; `docker-compose.yml` uses `build: .` → `panoptikon:local`; first build compiles frontend + server inside Docker). Upgrade section rewritten: `git pull` → `docker compose pull --ignore-buildable` (third-party images only) → `docker compose up -d --build`. New **Maintainer deploy** section describing the artifact-driven LXC rollout: CI artifact contract, worker modes (`--check`, one-shot, `--watch`, `--rollback`), read-only token file, tunables, in-LXC pre-flight before the swap, and state-file semantics (`last-deployed-run`, `last-failed-run` incl. contract rejections, `last-deploy.json` statuses `success`/`rejected`/`preflight_failed`/`failed`; transient errors record nothing and are retried; `--watch` exits only on a failed rollback, so a plain supervisor / cron suffices). The section names no internal hosts or IPs ("the maintainers' deploy control host"). |
| `docs/test-plan.md` | Caddy admin API line notes the CI runs a plain Caddy binary; section 2 gets a note that C-01..C-24 are automated in `server/tests/caddy_integration.rs` and run on Forgejo Actions for every push to `main` and every PR. |
| `docs/PRD.md` | #834 link and clone URL → Forgejo; Milestone 0 "CI: GitHub Actions" → Forgejo Actions with the current gates; backlog "Release pipeline: GitHub Releases" → Forgejo Actions release workflow (asset host left to item `release`). |
| `docs/deploy-docker.md` | Clone URL → Forgejo; Quickstart step 3 → `docker compose up -d --build` plus a note that no pre-built Panoptikon image is published (`build: .`, first start compiles frontend + server, several minutes); Development paragraph reworded (`docker-compose.override.yml` tags the local build `panoptikon:dev` and adds dev-only settings on top of a base file that already builds from the Dockerfile); Upgrade rewritten (`git pull`, `docker compose pull --ignore-buildable`, `docker compose up -d --build`). |
| `docs/GATEWAY-ARCHITECTURE.md` | "[GitHub issue #834]" → "[issue #834]" with the Forgejo URL (issue numbers were preserved by the migration; verified `GET /repos/BeFeast/panoptikon/issues/834` → open, same title). |
| `docs/test-environment.md` | #834 link → Forgejo. |
| `docs/FEATURE_GAPS.md` | #834 link → Forgejo. |
| `docs/PRD-VyOS-Management.md` | #834 link → Forgejo. |

## Deleted (see `DELETE-deploy.txt`)

| Path | Reason |
|---|---|
| `.github/workflows/ci.yml` | Replaced by `.forgejo/workflows/ci.yml` (item `ci`). |
| `.github/workflows/docker.yml` | GHCR push with `GITHUB_TOKEN`, `useblacksmith/*` builder and Docker Hub tags — none of it exists on Forgejo. Item `release` decided not to port an image job (see `CHANGES-release.md`); the compose demo builds locally instead. |
| `.github/workflows/release.yml` | Uses `cross` (docker-based), GitHub-hosted macOS runners and `softprops/action-gh-release`; superseded by the Forgejo release workflow (item `release`). |
| `.github/workflows/version-bump.yml` | Pushes with `GITHUB_TOKEN` to GitHub `main`; the mirror is read-only. Replacement is item `release`'s `.forgejo/workflows/version-bump.yml`. |
| `.github/workflows/dependabot-auto-merge.yml` | Dependabot is gone; Renovate is org-hosted (`BeFeast/renovate`). |
| `.github/dependabot.yml` | Replaced by org-hosted Renovate; central config, nothing in-repo. |
| `greptile.json` | Greptile replaced by the org PR-Agent webhook; nothing to configure in the repo. |

`.github/` contains nothing else (no ISSUE_TEMPLATE, CODEOWNERS or FUNDING) — verified with `find .github -type f` — so the whole directory disappears.

## Deliberately untouched

- `docs/CODE_REVIEW.md` — dated review snapshot (2026-02-20, already carries a "Historical snapshot" banner); its `.github/workflows/ci.yml` / "CI: GitHub Actions" lines describe the code at review time and are left as history. Current CI facts live in `CLAUDE.md` and `TESTING.md`.
- `scripts/install.sh`, `server/src/api/agents.rs`, `Cargo.toml`, `docker-compose.yml` — the release-asset decision (Forgejo Releases, no GitHub Releases on the mirror) and these edits belong to item `release`; the tree already contains that item's versions. See `CHANGES-release.md` "Modified".

## Verification performed (2026-09-06)

- API paths and shapes checked against `https://git.oklabs.uk/swagger.v1.json` (Forgejo 16.0.3): `GET /repos/{owner}/{repo}/actions/runs` → `{total_count, workflow_runs[ActionRun]}` with `id`, `index_in_repo`, `status`, `workflow_id`, `prettyref`, `event`, `commit_sha`, `html_url`; `GET .../actions/runs/{run_id}/artifacts` and `GET .../actions/artifacts` → plain array of `ActionArtifact` (`id`, `name`, `run_id`, `size_in_bytes`, `expired`, `expires_at`, `archive_download_url`); `GET .../actions/artifacts/{artifact_id}/zip` → zip.
- Live behaviour: the `status`, `ref`, `workflow_id` and `event` query filters work server-side; `limit` is honoured only together with `page`, so both are sent and the worker re-filters and sorts by `id` client-side. Newest run has the highest `id`. Anonymous artifact zip download on a public repo returns 200 (`application/octet-stream`, `PK\x03\x04`); tested end-to-end with `BeFeast/t3code` artifact 147 through the worker's own `download_artifact` function.
- Token semantics: an invalid token yields 401 on every endpoint (even `/version`); the real deploy token on the control host (`~/.config/forgejo/token.env`, keys `FORGEJO_URL`, `FORGEJO_TOKEN`, mode 0600, scopes `write:organization,write:repository`) gets **403 on `/user`** but **200** on `/repos/BeFeast/panoptikon`, `/actions/runs`, `/actions/artifacts` and an artifact `/zip`. The worker therefore probes `/repos/{REPO}` (not `/user`) and queries `/version` unauthenticated.
- `--check` mode run locally (with a `flock` shim) and on the control host against `BeFeast/ok-gobot` (has `ci.yml` push runs on `main`) — run selection works; `BeFeast/panoptikon` on Forgejo had no runs/artifacts yet at the time (repo was still in "Migrating" state on the web UI).
- Tooling on the control host (Ubuntu 26.04, x86_64, glibc 2.43): `unzip bsdtar jq curl flock python3 file ssh scp` all present. LXC 115 is Ubuntu 24.04 / glibc 2.39 / x86_64 running `panoptikon-server 0.6.103` — a binary built in the `ubuntu:act-24.04` runner image (glibc 2.39) links against the same glibc; the in-LXC pre-flight is the authoritative check either way.
- `bash -n` clean; `.forgejo/workflows/*.yml` parse with PyYAML (ci/release/version-bump).
- **Fake-Forgejo harness** (`finalize-deploy/` in the scratchpad: python HTTP stub serving runs/artifacts/zips, `pct`/`ssh`/`scp`/`flock` shims — the `ssh` shim flattens argv into one string and re-parses it with `bash -c`, exactly like a real remote login shell), every scenario exercised through the real `do_deploy` and, where noted, the real `deploy_binary` + remote script:
  - happy path → `last-deployed-run=5001`, `last-deploy.json` `status=success version=0.6.106`, Telegram `success`.
  - bad sha256, missing sidecar, nested zip layout, aarch64 ELF, missing metadata, non-zip body, metadata commit/branch/event mismatch, version `0.6.106;echo INJECTED-BY-VERSION`, version containing `"}` + newline → all **rejected**: `do_deploy` returns 1 (process alive), `last-failed-run=5001`, state `rejected` (valid JSON, version `unknown` where the token was not plain), Telegram `rejected`; the next cycle logs "already failed to deploy … skipping" without downloading; `RETRY_FAILED_RUN=1` downloads and rejects again.
  - `ALLOW_UNVERIFIED_ARTIFACT=1` with no metadata → deploys with version `unknown`; run_id/run_number mismatch only → warning, deploys.
  - artifact 404 on download → **transient**: returns 1, nothing recorded, next poll retries; API unreachable → returns 1, nothing recorded.
  - real `deploy_binary`: happy (`PRE-FLIGHT OK: panoptikon-server 0.6.106`, no warning), metadata 0.6.107 vs binary 0.6.106 → local WARNING, `--version` failing in the LXC → rc 3 → `preflight_failed` + marker, `pct push` failure → rc 3, `scp` failure → rc 3, `mv` failure after stop → rc 1 → `failed` + rollback; health-check failure → `failed` + rollback.
  - `--watch` (real `main`, `POLL_INTERVAL=1`, 5 s): rejecting artifact → 1 download then 3 skipped cycles, process alive until killed; transient 404 → 8 retry lines, no state files.
  - `--check` on a run without artifacts → `(available: <none>)`; token file with mode 644 → the WARNING is present in `logs/deploy-*.log`.
  - Injection evidence: the **previous** revision's `deploy_binary`, fed `x;echo INJECTED-BY-ARG2` as version through the ssh shim, produced `cmd=<bash -s 115 x;echo INJECTED-BY-ARG2>` and printed `INJECTED-BY-ARG2`; the current revision sends `cmd=<bash -s -- 115>` and the string only appears in the local mismatch warning (and, in the real flow, is rejected by the regex before `deploy_binary` is ever reached).

## Operational notes for the switch-over

- The worker keys on the Forgejo run `id`; the leftover GitHub run id in `~/.panoptikon-deploy/last-deployed-run` (if any) never matches, so the first cycle after the switch deploys the newest successful Forgejo build — intended.
- No `~/.panoptikon-deploy` state dir exists on the control host today and no cron/systemd unit references the worker there; how the worker is scheduled (or whether it ran from another host) is an open question. With this revision a systemd unit with `Restart=on-failure` (or cron running the one-shot mode) is sufficient: only a failed rollback exits.
- Run `scripts/deploy-worker.sh --check` once the first `ci.yml` run on `main` has finished on Forgejo; it prints the run and artifact it would ship without touching LXC 115.
- Telegram, if enabled, now also reports `rejected` and `preflight_failed`; both mean production was not touched.

## Review notes

All ten critiques were verified against the tree and the original `repo-deploy/` checkout before acting; every one held.

1. *runner-compat / equivalence / safety — CHANGES-deploy.md stale or wrong* (three critiques): confirmed (`rg 'raw/branch' tree/*.md tree/docs/*.md` → nothing; `deploy_binary` had been rewritten; "Deliberately not changed" contradicted `CHANGES-release.md`). This file is rewritten from the final tree: accurate rows for `scripts/deploy-worker.sh`, `DEPLOY.md`, `docs/deploy-docker.md`, `CLAUDE.md`; the `raw/branch/main` claims (row and verification bullet) are gone; the old "Deliberately not changed" section is replaced by "Deliberately untouched" pointing at `CHANGES-release.md`; the coordination with item `release`'s `docker-compose.yml` change is stated in the scope paragraph.
2. *runner-compat — transient download error kills `--watch`*: confirmed (`|| die` on the curl). `download_artifact` now returns 2 on a curl failure; `do_deploy` treats 2 as transient (log, retry next poll, nothing recorded).
3. *runner-compat — config warnings miss the log file; empty artifact list*: confirmed (`load_forgejo_config` ran before the `exec > >(tee …)`; `join(", ")` of `[]` is `""`). The log redirect now comes first in `main`; `list_run_artifact_names` prints `<none>`.
4. *equivalence — `die` in the verification path never records `last-failed-run`*: confirmed with the reviewer's fixtures. Download + metadata cross-check (moved into `check_artifact_metadata`) + `verify_binary` now run inside `prepare_artifact`, a parenthesised (subshell) function, so `die` ends only that stage; `do_deploy` maps exit 1 → `save_last_failed_run` + state `rejected` + Telegram, exit 2 → transient. Because `set -e` is inert inside a `f || rc=$?` call, every filesystem step in that stage carries an explicit `|| die` (`mkdir`, `extract_zip`, `mv`, `cp`, `chmod`). Header comment and `DEPLOY.md` updated accordingly.
5. *safety — artifact-controlled version reaches the Proxmox root shell via ssh argv*: confirmed and reproduced with the harness's argv-flattening `ssh` shim (see Verification). Fixed three ways: the version is validated against `^[0-9A-Za-z._+~-]{1,64}$` in `check_artifact_metadata` (rejection path), `deploy_binary` no longer passes it to the remote at all (comparison done locally on the `PRE-FLIGHT OK:` line, which the remote now emits as one line), and the only remote argument — the LXC id — is asserted numeric in `main` and `printf %q`-quoted.
6. *safety — `maestro` hostname leaked into `DEPLOY.md`*: confirmed (absent from the original repo). Replaced by "the maintainers' deploy control host — never on the target LXC"; this CHANGES file also no longer names the host. Note for the orchestrator: `tree/.forgejo/workflows/version-bump.yml` (item `release`) mentions `maestro version-bump` — that is the Maestro CLI command, not a hostname, and is outside this item.
7. *safety — `last-deploy.json` written with unescaped strings*: confirmed. `write_deploy_state` now uses `jq -n --arg …`; the `json-breaker` fixture (version containing `"}` and a newline) yields a valid file (`jq -e .` passes).
8. *safety — contract violations `die` inside `do_deploy` without a marker*: same root cause as 4; fixed by the `prepare_artifact` stage (rejections record the run, transient errors do not).
9. *safety — `docs/CODE_REVIEW.md` GitHub reference*: confirmed; listed above as deliberately untouched (it is a dated snapshot with its own "Historical snapshot" banner). No edit made to that file.
