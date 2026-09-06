#!/usr/bin/env bash
#
# deploy-worker.sh — Local artifact-driven deploy worker for Panoptikon.
#
# Decouples production deploys from CI. Polls Forgejo Actions
# (https://git.oklabs.uk/BeFeast/panoptikon) for successful CI runs on main,
# downloads the server binary artifact through the Forgejo REST API, verifies
# it, deploys to LXC 115, runs health checks, and sends Telegram notifications.
#
# Modes:
#   deploy-worker.sh                — One-shot: deploy latest undeployed build
#   deploy-worker.sh --watch        — Continuous: poll for new builds
#   deploy-worker.sh --rollback     — Rollback to previous version
#   deploy-worker.sh --check        — Resolve latest run + artifact and verify
#                                     API access; no download, no deploy, no lock
#
# Environment:
#   FORGEJO_TOKEN       — Forgejo access token. If unset, read from
#                         FORGEJO_TOKEN_FILE. Optional for a public repo, but
#                         recommended (rate limits, private repos). The worker
#                         only READS: a dedicated token with the
#                         `read:repository` scope is all it needs.
#   FORGEJO_TOKEN_FILE  — KEY=VALUE file (default: ~/.config/forgejo/token.env;
#                         keys FORGEJO_TOKEN and optionally FORGEJO_URL).
#                         Should be mode 0600 (warned otherwise).
#   FORGEJO_API         — API base URL (default: https://git.oklabs.uk/api/v1,
#                         or derived from FORGEJO_URL in the token file). Must
#                         be https:// when a token is set.
#   REPO                — Forgejo repo owner/name (default: BeFeast/panoptikon)
#   CI_WORKFLOW         — Workflow file that produces the artifact (default: ci.yml)
#   CI_BRANCH           — Branch whose builds get deployed (default: main)
#   CI_EVENT            — Trigger event of deployable runs (default: push;
#                         empty = any event). PR runs also upload the
#                         artifact, so branch+event filtering is what makes
#                         a run deployable.
#   ARTIFACT_NAME       — CI artifact name (default: panoptikon-server-linux-x86_64)
#   VERIFY_EXEC         — off|on|auto: additionally run `panoptikon-server
#                         --version` on THIS host before deploying. Default
#                         off: the binary is always smoke-tested inside the
#                         target LXC (its own failure domain) before the
#                         running service is touched, so executing CI output
#                         on the control host is an explicit opt-in.
#                         auto = on only on a Linux x86_64 host.
#   ALLOW_UNVERIFIED_ARTIFACT — set to 1 to deploy an artifact that lacks the
#                         sha256 sidecar or deploy-metadata.json (default: refuse)
#   RETRY_FAILED_RUN    — set to 1 to retry a run recorded in last-failed-run
#                         (default: a run that failed to deploy is skipped)
#   TELEGRAM_BOT_TOKEN  — Bot token (optional, enables Telegram)
#   TELEGRAM_CHAT_ID    — Chat ID (optional)
#   DEPLOY_STATE_DIR    — State dir (default: ~/.panoptikon-deploy)
#   POLL_INTERVAL       — Seconds between polls in --watch (default: 60)
#
# State directory layout:
#   ~/.panoptikon-deploy/
#   ├── deploy.lock             — flock-based single-flight lock
#   ├── last-deployed-run       — Forgejo run ID (numeric `id`, not the
#   │                             per-repo run number) of the last deploy
#   ├── last-failed-run         — Forgejo run ID of a run whose deploy failed
#   │                             (artifact rejected by the contract checks,
#   │                             pre-flight, mid-deploy or health check);
#   │                             skipped until RETRY_FAILED_RUN=1 or a newer
#   │                             run appears. Removed on the next success.
#   │                             Transient API/download errors do NOT set it.
#   ├── last-deploy.json        — Details of the last deploy attempt
#   ├── logs/
#   │   └── deploy-<timestamp>.log
#   └── rollback/
#       └── panoptikon-server   — Previous binary for rollback
#
# Forgejo API surface used (verified against Forgejo 16.0.3 swagger):
#   GET /version
#   GET /repos/{owner}/{repo}                              (token/access check)
#   GET /repos/{owner}/{repo}/actions/runs?status=&ref=&workflow_id=&event=&limit=&page=
#       -> {"total_count": N, "workflow_runs": [ActionRun...]}
#   GET /repos/{owner}/{repo}/actions/runs/{run_id}/artifacts?name=
#       -> [ActionArtifact...]
#   GET /repos/{owner}/{repo}/actions/artifacts/{artifact_id}/zip
#       -> application/zip
#
# Artifact contract (.forgejo/workflows/ci.yml): a FLAT zip containing exactly
#   panoptikon-server, panoptikon-server.sha256 (sha256sum format) and
#   deploy-metadata.json {commit, version, branch, event, built_at, run_id,
#   run_number, run_url, artifact}. Any other layout is refused.
#
# Deploy sequence on the target (all via `pct` on the Proxmox host):
#   push binary to /usr/local/bin/panoptikon-server.new (0755)
#   -> run `panoptikon-server.new --version` inside the LXC (pre-flight)
#   -> only then: systemctl stop, mv .new over the old binary, systemctl start
#   -> HTTP health check; rollback to the backed-up binary on failure.
#
# Failure handling per deploy cycle (one-shot and --watch alike):
#   transient  — API unreachable, artifact listing/download failed: logged,
#                nothing recorded, retried on the next poll.
#   rejected   — artifact violates the contract (layout, sha256, metadata,
#                not an x86-64 ELF): run recorded in last-failed-run, state
#                "rejected", production untouched, Telegram notice.
#   preflight_failed / failed — see above; recorded in last-failed-run.
#   Only a failed ROLLBACK terminates the process (manual intervention).
# Nothing read from the artifact is ever passed to a remote shell: the LXC id
# is a validated numeric constant and the version string is compared locally.
#
set -euo pipefail

# ── Configuration ─────────────────────────────────────────────────────────────

REPO="${REPO:-BeFeast/panoptikon}"
CI_WORKFLOW="${CI_WORKFLOW:-ci.yml}"
CI_BRANCH="${CI_BRANCH:-main}"
CI_EVENT="${CI_EVENT-push}"
ARTIFACT_NAME="${ARTIFACT_NAME:-panoptikon-server-linux-x86_64}"
BINARY_NAME="panoptikon-server"
FORGEJO_TOKEN_FILE="${FORGEJO_TOKEN_FILE:-$HOME/.config/forgejo/token.env}"
VERIFY_EXEC="${VERIFY_EXEC:-off}"
ALLOW_UNVERIFIED_ARTIFACT="${ALLOW_UNVERIFIED_ARTIFACT:-0}"
RETRY_FAILED_RUN="${RETRY_FAILED_RUN:-0}"
MIN_BINARY_BYTES=$((4 * 1024 * 1024))

DEPLOY_STATE_DIR="${DEPLOY_STATE_DIR:-$HOME/.panoptikon-deploy}"
POLL_INTERVAL="${POLL_INTERVAL:-60}"

LOCK_FILE="$DEPLOY_STATE_DIR/deploy.lock"
LAST_RUN_FILE="$DEPLOY_STATE_DIR/last-deployed-run"
FAILED_RUN_FILE="$DEPLOY_STATE_DIR/last-failed-run"
LOG_DIR="$DEPLOY_STATE_DIR/logs"
ROLLBACK_DIR="$DEPLOY_STATE_DIR/rollback"

DEVBOX="root@10.10.0.11"
LXC_ID="115"
LXC_HOST="10.10.0.22"
PANOPTIKON_URL="http://${LXC_HOST}:8080"
REMOTE_BINARY="/usr/local/bin/panoptikon-server"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Filled in by do_deploy for notifications / state files.
RUN_INDEX=""
RUN_URL=""

# Authorization header file (never the token itself on a command line).
AUTH_HEADER_FILE=""

# Paths removed by the EXIT trap (auth dir, per-cycle temp dirs).
CLEANUP_PATHS=()

# ── Helpers ───────────────────────────────────────────────────────────────────

log() {
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"
}

die() {
  log "FATAL: $*"
  exit 1
}

cleanup() {
  local p
  for p in ${CLEANUP_PATHS[@]+"${CLEANUP_PATHS[@]}"}; do
    rm -rf "$p"
  done
}

ensure_dirs() {
  mkdir -p "$DEPLOY_STATE_DIR" "$LOG_DIR" "$ROLLBACK_DIR"
  chmod 700 "$DEPLOY_STATE_DIR" 2>/dev/null || true
}

sha256_of() {
  (sha256sum "$1" 2>/dev/null || shasum -a 256 "$1") | awk '{print $1}'
}

file_mode() {
  stat -c %a "$1" 2>/dev/null || stat -f %Lp "$1"
}

# Normalises VERIFY_EXEC (off|on|auto) to on|off. Called once, early, so that
# require_cmds can demand `timeout` only when the local exec check is enabled.
resolve_verify_exec() {
  case "$VERIFY_EXEC" in
    on|off) ;;
    auto)
      if [[ "$(uname -s)" == "Linux" && "$(uname -m)" == "x86_64" ]]; then
        VERIFY_EXEC="on"
      else
        VERIFY_EXEC="off"
      fi
      ;;
    *) die "VERIFY_EXEC must be off, on or auto (got '$VERIFY_EXEC')" ;;
  esac
}

require_cmds() {
  local missing=()
  local c
  for c in curl jq flock ssh scp od mktemp awk sed stat; do
    command -v "$c" >/dev/null 2>&1 || missing+=("$c")
  done
  if ! command -v unzip >/dev/null 2>&1 \
     && ! command -v bsdtar >/dev/null 2>&1 \
     && ! command -v python3 >/dev/null 2>&1; then
    missing+=("unzip|bsdtar|python3")
  fi
  if ! command -v sha256sum >/dev/null 2>&1 && ! command -v shasum >/dev/null 2>&1; then
    missing+=("sha256sum|shasum")
  fi
  if [[ "$VERIFY_EXEC" == "on" ]]; then
    command -v timeout >/dev/null 2>&1 || missing+=("timeout (needed for VERIFY_EXEC=on)")
  fi
  (( ${#missing[@]} == 0 )) || die "Missing required tools: ${missing[*]}"
}

# ── Lock ──────────────────────────────────────────────────────────────────────

acquire_lock() {
  exec 200>"$LOCK_FILE"
  if ! flock -n 200; then
    die "Another deploy is in progress (lock: $LOCK_FILE). Exiting."
  fi
  log "Deploy lock acquired"
}

release_lock() {
  flock -u 200 2>/dev/null || true
}

# ── Forgejo Actions ──────────────────────────────────────────────────────────

# Read KEY=VALUE (optionally `export KEY=VALUE`, optionally quoted) from a
# dotenv-style file without sourcing it. Prints the value, or nothing.
dotenv_get() {
  local file="$1" key="$2"
  [[ -r "$file" ]] || return 0
  sed -n -E "s/^[[:space:]]*(export[[:space:]]+)?${key}[[:space:]]*=[[:space:]]*//p" "$file" \
    | tail -n 1 | tr -d '\r' \
    | sed -E "s/^\"(.*)\"[[:space:]]*$/\1/; s/^'(.*)'[[:space:]]*$/\1/; s/[[:space:]]+$//"
}

load_forgejo_config() {
  # The token never lives in a variable of this shell (bash -x would trace it)
  # and never goes on a command line (/proc/<pid>/cmdline is world-readable):
  # it is written straight into a private header file that curl reads with
  # -H @file. FORGEJO_TOKEN from the environment is consumed here and unset so
  # that ssh/scp/curl children do not inherit it either.
  local auth_dir
  auth_dir="$(mktemp -d)"
  chmod 700 "$auth_dir"
  CLEANUP_PATHS+=("$auth_dir")
  local hdr="$auth_dir/authorization"
  local source="env"
  [[ -n "${FORGEJO_TOKEN:+x}" ]] || source="file"

  local rc=0
  (
    { set +x; } 2>/dev/null
    umask 077
    tok="${FORGEJO_TOKEN:-}"
    [[ -n "$tok" ]] || tok="$(dotenv_get "$FORGEJO_TOKEN_FILE" FORGEJO_TOKEN)"
    [[ -n "$tok" ]] || exit 3
    printf 'Authorization: token %s\n' "$tok" > "$hdr"
  ) || rc=$?
  unset FORGEJO_TOKEN
  if (( rc == 0 )); then
    AUTH_HEADER_FILE="$hdr"
    if [[ "$source" == "file" ]]; then
      local mode
      mode="$(file_mode "$FORGEJO_TOKEN_FILE" 2>/dev/null || echo "?")"
      case "$mode" in
        600|400) ;;
        *) log "WARNING: $FORGEJO_TOKEN_FILE has mode $mode — should be 0600" ;;
      esac
    fi
  elif (( rc == 3 )); then
    AUTH_HEADER_FILE=""
  else
    die "Could not stage the Forgejo token (rc=$rc)"
  fi

  FORGEJO_API="${FORGEJO_API:-}"
  if [[ -z "$FORGEJO_API" ]]; then
    local url
    url="$(dotenv_get "$FORGEJO_TOKEN_FILE" FORGEJO_URL)"
    url="${url%/}"
    if [[ -z "$url" ]]; then
      FORGEJO_API="https://git.oklabs.uk/api/v1"
    elif [[ "$url" == */api/v1 ]]; then
      FORGEJO_API="$url"
    else
      FORGEJO_API="$url/api/v1"
    fi
  fi
  FORGEJO_API="${FORGEJO_API%/}"
  FORGEJO_WEB="${FORGEJO_API%/api/v1}"

  if [[ -n "$AUTH_HEADER_FILE" ]]; then
    # Never send the token in cleartext, whatever FORGEJO_URL/FORGEJO_API says.
    [[ "$FORGEJO_API" == https://* ]] \
      || die "Refusing to send FORGEJO_TOKEN to non-https API $FORGEJO_API (fix FORGEJO_API/FORGEJO_URL or unset the token)"
  fi
}

drop_forgejo_token() {
  [[ -z "$AUTH_HEADER_FILE" ]] || rm -f "$AUTH_HEADER_FILE"
  AUTH_HEADER_FILE=""
}

# Authenticated curl against the Forgejo API.
# Usage: api_curl <path-or-absolute-url> [extra curl args...]
api_curl() {
  local target="$1"; shift
  [[ "$target" == http* ]] || target="${FORGEJO_API}${target}"
  local -a auth=()
  if [[ -n "$AUTH_HEADER_FILE" ]]; then
    auth=(-H "@${AUTH_HEADER_FILE}")
  fi
  curl -fsSL --proto-redir =https --retry 3 --retry-delay 2 --max-time 300 \
    ${auth[@]+"${auth[@]}"} "$@" "$target"
}

api_get_json() {
  api_curl "$1" -H "Accept: application/json"
}

# Confirms the API is reachable and that the token (if any) can read the repo.
# The version probe is unauthenticated on purpose: an invalid token turns every
# request into 401, which would otherwise look like "API unreachable". The repo
# itself is probed rather than /user because a repo-scoped token has no
# read:user scope and gets 403 there while being perfectly able to read runs
# and artifacts. A rejected token is dropped so a public repo keeps working
# anonymously.
# Returns 0 = OK, 1 = API unreachable, 2 = repo not readable.
check_forgejo_access() {
  local version=""
  version="$(curl -fsS --max-time 30 "${FORGEJO_API}/version" 2>/dev/null | jq -r '.version // empty')" || true
  if [[ -z "$version" ]]; then
    log "WARNING: Forgejo API not reachable at $FORGEJO_API"
    return 1
  fi
  log "Forgejo API: $FORGEJO_API (server $version)"

  if [[ -n "$AUTH_HEADER_FILE" ]]; then
    if api_get_json "/repos/${REPO}" >/dev/null 2>&1; then
      log "Forgejo token accepted (repo $REPO readable)"
    else
      log "WARNING: FORGEJO_TOKEN rejected for $FORGEJO_API/repos/${REPO} — continuing anonymously (public repo only)"
      drop_forgejo_token
    fi
  else
    log "WARNING: no FORGEJO_TOKEN (env or $FORGEJO_TOKEN_FILE) — anonymous API access (public repo only)"
  fi

  if ! api_get_json "/repos/${REPO}" >/dev/null 2>&1; then
    log "WARNING: repo $REPO is not readable via $FORGEJO_API (private repo without a usable token?)"
    return 2
  fi
  return 0
}

require_forgejo_access() {
  local rc=0
  check_forgejo_access || rc=$?
  case "$rc" in
    0) ;;
    1) die "Forgejo API unreachable at $FORGEJO_API" ;;
    *) die "Repo $REPO is not readable via $FORGEJO_API (missing/insufficient token, or the repo does not exist)" ;;
  esac
}

# Newest successful run of $CI_WORKFLOW on $CI_BRANCH (trigger $CI_EVENT).
# The status/ref/workflow_id/event filters are applied server-side and the API
# returns runs newest-first (verified on Forgejo 16.0.3). `limit` is honoured
# only together with `page` — without `page` the whole run history comes back —
# so both are sent. The client-side re-filter + sort is a safety net only.
# Prints one compact JSON object or nothing.
get_latest_successful_run() {
  local query="status=success&ref=refs/heads/${CI_BRANCH}&workflow_id=${CI_WORKFLOW}&limit=20&page=1"
  if [[ -n "$CI_EVENT" ]]; then
    query="${query}&event=${CI_EVENT}"
  fi
  api_get_json "/repos/${REPO}/actions/runs?${query}" \
    | jq -c --arg wf "$CI_WORKFLOW" --arg br "$CI_BRANCH" --arg ev "$CI_EVENT" '
        [ .workflow_runs[]?
          | select(.status == "success"
                   and .workflow_id == $wf
                   and (.prettyref == $br or .prettyref == ("refs/heads/" + $br))
                   and ($ev == "" or .event == $ev)) ]
        | sort_by(.id) | reverse | .[0] // empty
        | {id, index: .index_in_repo, event, commit: .commit_sha, created, stopped, url: .html_url}'
}

# Usable (non-expired) artifact named $ARTIFACT_NAME on a run.
# Prints one compact JSON object or nothing.
find_run_artifact() {
  local run_id="$1"
  local list
  if ! list="$(api_get_json "/repos/${REPO}/actions/runs/${run_id}/artifacts?name=${ARTIFACT_NAME}")"; then
    # Fallback for instances without the per-run endpoint: repo-wide list.
    if ! list="$(api_get_json "/repos/${REPO}/actions/artifacts?name=${ARTIFACT_NAME}")"; then
      log "Could not list artifacts for run $run_id via $FORGEJO_API"
      return 1
    fi
  fi
  jq -c --arg n "$ARTIFACT_NAME" --argjson run "$run_id" '
      [ .[]? | select(.name == $n and .run_id == $run and ((.expired // false) | not)) ]
      | sort_by(.id) | reverse | .[0] // empty
      | {id, name, run_id, size: .size_in_bytes, expires_at}' <<<"$list"
}

list_run_artifact_names() {
  api_get_json "/repos/${REPO}/actions/runs/${1}/artifacts" 2>/dev/null \
    | jq -r '[.[]? | .name + (if (.expired // false) then " (expired)" else "" end)] | join(", ") | if . == "" then "<none>" else . end' \
    || echo "<unavailable>"
}

get_last_deployed_run() {
  if [[ -f "$LAST_RUN_FILE" ]]; then
    cat "$LAST_RUN_FILE"
  else
    echo ""
  fi
}

save_last_deployed_run() {
  echo "$1" > "$LAST_RUN_FILE"
}

get_last_failed_run() {
  if [[ -f "$FAILED_RUN_FILE" ]]; then
    cat "$FAILED_RUN_FILE"
  else
    echo ""
  fi
}

save_last_failed_run() {
  echo "$1" > "$FAILED_RUN_FILE"
}

clear_last_failed_run() {
  rm -f "$FAILED_RUN_FILE"
}

extract_zip() {
  local zip="$1" dest="$2"
  if command -v unzip >/dev/null 2>&1; then
    unzip -q -o "$zip" -d "$dest"
  elif command -v bsdtar >/dev/null 2>&1; then
    bsdtar -xf "$zip" -C "$dest"
  else
    python3 -c 'import sys, zipfile; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])' "$zip" "$dest"
  fi
}

# Called inside prepare_artifact's subshell: `die` rejects the artifact,
# `return 2` marks a transient failure (nothing recorded, retried next poll).
download_artifact() {
  local artifact_id="$1"
  local dest_dir="$2"
  local zip="$dest_dir/${ARTIFACT_NAME}.zip"

  log "Downloading artifact $artifact_id ($ARTIFACT_NAME) from Forgejo..."
  if ! api_curl "/repos/${REPO}/actions/artifacts/${artifact_id}/zip" -o "$zip"; then
    log "Artifact download failed (artifact $artifact_id) — will retry on the next poll"
    return 2
  fi

  # Forgejo serves application/zip; anything else here is an error page.
  [[ "$(od -An -tx1 -N4 "$zip" | tr -d ' \n')" == "504b0304" ]] \
    || die "Downloaded file is not a zip archive: $zip"

  local extract="$dest_dir/extract"
  mkdir -p "$extract" || die "Could not create $extract"
  extract_zip "$zip" "$extract" || die "Could not extract $zip (corrupt archive?)"

  # Contract: flat zip, binary at the root. Anything else means ci.yml changed
  # its staging step and nothing should be shipped until the worker is updated.
  local found="$extract/$BINARY_NAME"
  if [[ ! -f "$found" ]]; then
    die "Artifact does not contain $BINARY_NAME at the zip root (contents: $(cd "$extract" && find . -type f | head -n 20 | tr '\n' ' '))"
  fi

  # CI ships a sha256sum-format sidecar next to the binary. It is a corruption
  # check, not an authenticity check (same zip), and it is mandatory.
  local sidecar="$extract/${BINARY_NAME}.sha256"
  if [[ -f "$sidecar" ]]; then
    local expected actual
    expected="$(awk 'NR==1 {print $1}' "$sidecar")"
    actual="$(sha256_of "$found")"
    [[ -n "$expected" && "$expected" == "$actual" ]] \
      || die "sha256 mismatch for $BINARY_NAME (sidecar: ${expected:-<empty>}, actual: $actual)"
    log "sha256 sidecar verified: $actual"
  elif [[ "$ALLOW_UNVERIFIED_ARTIFACT" == "1" ]]; then
    log "WARNING: no ${BINARY_NAME}.sha256 sidecar in artifact — continuing because ALLOW_UNVERIFIED_ARTIFACT=1"
  else
    die "Artifact has no ${BINARY_NAME}.sha256 sidecar — refusing to deploy (ALLOW_UNVERIFIED_ARTIFACT=1 overrides)"
  fi
  mv "$found" "$dest_dir/$BINARY_NAME" || die "Could not move $found into place"

  local meta="$extract/deploy-metadata.json"
  if [[ -f "$meta" ]]; then
    jq -e 'type == "object"' "$meta" >/dev/null 2>&1 \
      || die "Artifact deploy-metadata.json is not a JSON object"
    cp "$meta" "$dest_dir/deploy-metadata.json" || die "Could not copy deploy-metadata.json"
  elif [[ "$ALLOW_UNVERIFIED_ARTIFACT" == "1" ]]; then
    log "WARNING: artifact has no deploy-metadata.json — continuing because ALLOW_UNVERIFIED_ARTIFACT=1"
  else
    die "Artifact has no deploy-metadata.json — refusing to deploy (ALLOW_UNVERIFIED_ARTIFACT=1 overrides)"
  fi
  rm -rf "$extract" "$zip"
}

# Version strings from deploy-metadata.json end up in log lines, Telegram
# messages and the state file, so only a plain version token is accepted.
VERSION_RE='^[0-9A-Za-z._+~-]{1,64}$'

# Prints the artifact's version ("unknown" when absent or not a plain version
# token — check_artifact_metadata has already rejected the artifact in that
# case, this is only for logging/state after the fact).
artifact_version() {
  local dir="$1" v="unknown"
  if [[ -f "$dir/deploy-metadata.json" ]]; then
    v="$(jq -r '.version // "unknown"' "$dir/deploy-metadata.json" 2>/dev/null || echo unknown)"
  fi
  [[ "$v" =~ $VERSION_RE ]] || v="unknown"
  printf '%s\n' "$v"
}

# Cross-checks deploy-metadata.json against the run the API reported. The
# artifact must be the one this run built for this branch; anything else means
# the artifact contract changed and nothing should be shipped (`die`).
# Usage: check_artifact_metadata <dir> <run-commit> <run-id> <run-index>
check_artifact_metadata() {
  local dir="$1" run_commit="$2" run_id="$3" run_index="$4"
  local meta="$dir/deploy-metadata.json"
  if [[ ! -f "$meta" ]]; then
    log "WARNING: deploying without deploy-metadata.json (ALLOW_UNVERIFIED_ARTIFACT=1) — no branch/event/commit cross-check"
    return 0
  fi

  local version meta_commit meta_branch meta_event meta_run_id meta_run_number
  version=$(jq -r '.version // "unknown"' "$meta")
  meta_commit=$(jq -r '.commit // ""' "$meta")
  meta_branch=$(jq -r '.branch // ""' "$meta")
  meta_event=$(jq -r '.event // ""' "$meta")
  meta_run_id=$(jq -r '.run_id // ""' "$meta")
  meta_run_number=$(jq -r '.run_number // ""' "$meta")

  [[ "$version" =~ $VERSION_RE ]] \
    || die "deploy-metadata version is not a plain version string ($(printf '%q' "$version")) — refusing to deploy"
  log "Artifact metadata: version=$version commit=${meta_commit:0:8} branch=${meta_branch:-?} event=${meta_event:-?} run_id=${meta_run_id:-?} run_number=${meta_run_number:-?}"

  if [[ -n "$meta_commit" && "$meta_commit" != "$run_commit" ]]; then
    die "deploy-metadata commit ($meta_commit) differs from run commit ($run_commit) — refusing to deploy"
  fi
  if [[ -n "$meta_branch" && "$meta_branch" != "$CI_BRANCH" ]]; then
    die "deploy-metadata branch ($meta_branch) is not $CI_BRANCH — refusing to deploy"
  fi
  if [[ -n "$CI_EVENT" && -n "$meta_event" && "$meta_event" != "$CI_EVENT" ]]; then
    die "deploy-metadata event ($meta_event) is not $CI_EVENT — refusing to deploy"
  fi
  if [[ -n "$meta_run_id" && "$meta_run_id" != "$run_id" && "$meta_run_number" != "$run_index" ]]; then
    log "WARNING: deploy-metadata run_id/run_number ($meta_run_id/$meta_run_number) do not match API run $run_id (#$run_index)"
  fi
}

# Static + (optionally) local dynamic verification of the downloaded binary.
# The dynamic check that always runs is the pre-flight inside the LXC
# (deploy_binary); running CI output on this host is opt-in (VERIFY_EXEC=on).
verify_binary() {
  local bin="$1"
  local expected_version="${2:-}"
  [[ -f "$bin" ]] || die "Binary missing: $bin"

  local size
  size="$(stat -c %s "$bin" 2>/dev/null || stat -f %z "$bin")"
  (( size >= MIN_BINARY_BYTES )) || die "Binary too small ($size bytes): $bin"

  # ELF64 little-endian x86-64: magic 7f454c46, EI_CLASS=02, e_machine=0x003e
  local magic class machine
  magic="$(od -An -tx1 -N4 "$bin" | tr -d ' \n')"
  class="$(od -An -tx1 -j4 -N1 "$bin" | tr -d ' \n')"
  machine="$(od -An -tx1 -j18 -N2 "$bin" | tr -d ' \n')"
  [[ "$magic" == "7f454c46" ]] || die "Not an ELF binary: $bin"
  [[ "$class" == "02" ]] || die "Not a 64-bit ELF binary: $bin"
  [[ "$machine" == "3e00" ]] || die "Not an x86-64 ELF binary (e_machine=$machine): $bin"
  chmod +x "$bin" || die "Could not chmod +x $bin"

  local sha
  sha="$(sha256_of "$bin")"
  log "Binary OK: ELF64 x86-64, $size bytes, sha256=$sha"

  if [[ "$VERIFY_EXEC" == "on" ]]; then
    local out
    if ! out="$(timeout 15 "$bin" --version 2>&1)"; then
      die "Binary failed to execute locally ($BINARY_NAME --version): $out"
    fi
    log "Binary reports (local): $out"
    if [[ -n "$expected_version" && "$expected_version" != "unknown" && "$out" != *"$expected_version"* ]]; then
      log "WARNING: binary version ($out) does not match deploy-metadata version ($expected_version)"
    fi
  else
    log "Local execution check disabled (VERIFY_EXEC=$VERIFY_EXEC); pre-flight runs inside LXC $LXC_ID"
  fi
}

# Download + contract checks + static verification of one artifact, run in a
# SUBSHELL (function body in parentheses) so that `die` ends only this stage
# and never the --watch loop. `set -e` is inert inside a `f || rc=$?` call,
# which is why every step above carries an explicit `|| die`.
# Exit codes: 0 = artifact staged at <dir>/panoptikon-server and ready;
#             2 = transient (download failed; nothing recorded, retry next poll);
#             1 = artifact rejected (do_deploy records the run in last-failed-run).
# Usage: prepare_artifact <artifact-id> <dir> <run-commit> <run-id> <run-index>
prepare_artifact() (
  local artifact_id="$1" dir="$2" run_commit="$3" run_id="$4" run_index="$5"
  download_artifact "$artifact_id" "$dir" || exit $?
  check_artifact_metadata "$dir" "$run_commit" "$run_id" "$run_index" || exit $?
  verify_binary "$dir/$BINARY_NAME" "$(artifact_version "$dir")" || exit $?
)

# ── Backup / Rollback ────────────────────────────────────────────────────────

backup_current_binary() {
  log "Backing up current binary from LXC $LXC_ID..."
  # Pull current binary from LXC via DevBox
  ssh "$DEVBOX" "pct pull $LXC_ID $REMOTE_BINARY /tmp/panoptikon-server-backup" 2>/dev/null || true
  scp "$DEVBOX":/tmp/panoptikon-server-backup "$ROLLBACK_DIR/panoptikon-server" 2>/dev/null || {
    log "WARNING: Could not backup current binary (first deploy?)"
    return 0
  }
  log "Backup saved to $ROLLBACK_DIR/panoptikon-server"
}

do_rollback() {
  if [[ ! -f "$ROLLBACK_DIR/panoptikon-server" ]]; then
    die "No rollback binary found at $ROLLBACK_DIR/panoptikon-server"
  fi

  log "=== ROLLBACK: Restoring previous binary ==="
  local rc=0
  deploy_binary "$ROLLBACK_DIR/panoptikon-server" "" || rc=$?
  if (( rc != 0 )); then
    log "CRITICAL: Rollback deploy step failed (rc=$rc)! Manual intervention required."
    notify_telegram "rollback_failed" "" "" ""
    exit 1
  fi

  if health_check; then
    log "Rollback successful — server is healthy"
    notify_telegram "rollback_success" "" "" ""
  else
    log "CRITICAL: Rollback also failed! Manual intervention required."
    notify_telegram "rollback_failed" "" "" ""
    exit 1
  fi
}

# ── Deploy ────────────────────────────────────────────────────────────────────

# Everything that runs on the Proxmox host. $1 = LXC id (the only argument —
# ssh flattens argv into one string that the remote login shell re-parses, so
# nothing derived from the artifact may ever be passed here; the version
# comparison happens locally on the "PRE-FLIGHT OK:" line this script echoes).
# Exit codes: 0 ok, 3 = pre-flight rejected the new binary (production
# untouched), anything else = failure after the service was stopped (caller
# must roll back). Wrapped in a function so `bash -s` parses the whole script
# before any `pct` child can read from the same stdin.
read -r -d '' REMOTE_DEPLOY_SCRIPT <<'REMOTE_SCRIPT' || true
remote_main() {
  set -uo pipefail
  local LXC_ID="$1"
  local CUR=/usr/local/bin/panoptikon-server
  local NEW=/usr/local/bin/panoptikon-server.new
  local out

  fail_preflight() {
    echo "PRE-FLIGHT FAILED: $*"
    pct exec "$LXC_ID" -- rm -f "$NEW" >/dev/null 2>&1 </dev/null || true
    rm -f /tmp/panoptikon-server
    exit 3
  }

  # Stage next to the live binary and smoke-test it INSIDE the container
  # before the running service is touched.
  pct exec "$LXC_ID" -- rm -f "$NEW" </dev/null || fail_preflight "could not remove stale $NEW"
  pct push "$LXC_ID" /tmp/panoptikon-server "$NEW" --perms 0755 </dev/null || fail_preflight "pct push failed"
  if ! out="$(pct exec "$LXC_ID" -- timeout 15 "$NEW" --version 2>&1 </dev/null)"; then
    fail_preflight "$NEW --version exited non-zero: $out"
  fi
  # One line, so the caller can pick the reported version out of the stream.
  echo "PRE-FLIGHT OK: $(printf '%s' "$out" | tr '\n' ' ')"

  # Swap: from here on a failure needs a rollback.
  set -e
  pct exec "$LXC_ID" -- systemctl stop panoptikon </dev/null || true
  pct exec "$LXC_ID" -- mv -f "$NEW" "$CUR" </dev/null
  pct exec "$LXC_ID" -- systemctl start panoptikon </dev/null
  rm -f /tmp/panoptikon-server
  echo "SWAP OK: $CUR replaced, panoptikon.service started"
}
remote_main "$@"
REMOTE_SCRIPT

# Usage: deploy_binary <local-binary> [expected-version]
# Returns 0, 3 (pre-flight rejected, production untouched) or another non-zero
# code (failure after the service was stopped).
deploy_binary() {
  local binary_path="$1"
  local expected_version="${2:-}"

  log "Deploying binary to LXC $LXC_ID..."
  log "  Binary: $binary_path ($(ls -lh "$binary_path" | awk '{print $5}'))"

  # Copy to DevBox
  if ! scp "$binary_path" "$DEVBOX":/tmp/panoptikon-server; then
    log "PRE-FLIGHT FAILED: scp to $DEVBOX failed"
    return 3
  fi

  # Stage, pre-flight inside the LXC, then stop/swap/start. Only the numeric
  # LXC id goes on the remote command line (validated in main); the remote's
  # output is kept so the version can be compared here, not on the PVE host.
  local rc=0 remote_out
  remote_out="$(mktemp)"
  ssh "$DEVBOX" "bash -s -- $(printf '%q' "$LXC_ID")" <<<"$REMOTE_DEPLOY_SCRIPT" 2>&1 \
    | tee "$remote_out" | sed 's/^/  [pve] /' || rc=$?
  if (( rc == 0 )) && [[ -n "$expected_version" && "$expected_version" != "unknown" ]]; then
    local reported
    reported="$(sed -n 's/^PRE-FLIGHT OK: //p' "$remote_out" | head -n 1)"
    if [[ "$reported" != *"$expected_version"* ]]; then
      log "WARNING: binary in LXC $LXC_ID reports '${reported:-<nothing>}' — does not match deploy-metadata version $expected_version"
    fi
  fi
  rm -f "$remote_out"
  if (( rc == 0 )); then
    log "Binary deployed and service restarted"
  elif (( rc == 3 )); then
    log "Pre-flight in LXC $LXC_ID rejected the binary — running service untouched"
  else
    log "Remote deploy step failed (rc=$rc) after the service was stopped"
  fi
  return "$rc"
}

# ── Health Check ──────────────────────────────────────────────────────────────

health_check() {
  log "Running health checks against $PANOPTIKON_URL..."

  local ok=false
  for i in $(seq 1 15); do
    if curl -sf "${PANOPTIKON_URL}/login" > /dev/null 2>&1; then
      log "Health check passed after ${i}s"
      ok=true
      break
    fi
    log "  Waiting for server... (${i}/15)"
    sleep 2
  done

  if [[ "$ok" == "false" ]]; then
    log "HEALTH CHECK FAILED: Server not responding at ${PANOPTIKON_URL}/login"
    return 1
  fi

  # Verify we can reach the API
  if curl -sf "${PANOPTIKON_URL}/api/v1/settings" > /dev/null 2>&1; then
    log "API health check passed"
  else
    log "WARNING: /login responds but /api/v1/settings does not (may need auth)"
  fi

  return 0
}

# ── Telegram ──────────────────────────────────────────────────────────────────

notify_telegram() {
  local status="$1"    # success, failure, preflight_failed, rejected, rollback_success, rollback_failed
  local version="$2"
  local commit="$3"
  local run_id="$4"

  if [[ -z "${TELEGRAM_BOT_TOKEN:-}" || -z "${TELEGRAM_CHAT_ID:-}" ]]; then
    log "Telegram not configured — skipping notification"
    return 0
  fi

  local run_label="${RUN_INDEX:-$run_id}"
  local run_url="${RUN_URL:-${FORGEJO_WEB}/${REPO}/actions}"

  local emoji
  local body
  case "$status" in
    success)
      emoji="✅"
      body="*Panoptikon deployed*

${emoji} Deploy successful

*Version:* \`${version}\`
*Commit:* \`${commit:0:8}\`
*Host:* LXC ${LXC_ID} (${LXC_HOST})
*Health:* ${PANOPTIKON_URL}/login ✓
*CI Run:* [#${run_label}](${run_url})"
      ;;
    failure)
      emoji="❌"
      body="*Panoptikon deploy FAILED*

${emoji} Deploy failed — rolling back

*Version:* \`${version}\`
*Commit:* \`${commit:0:8}\`
*CI Run:* [#${run_label}](${run_url})"
      ;;
    preflight_failed)
      emoji="🚫"
      body="*Panoptikon deploy REJECTED*

${emoji} New binary failed its pre-flight inside LXC ${LXC_ID} — running service untouched

*Version:* \`${version}\`
*Commit:* \`${commit:0:8}\`
*CI Run:* [#${run_label}](${run_url})"
      ;;
    rejected)
      emoji="🚫"
      body="*Panoptikon deploy REJECTED*

${emoji} Artifact failed the contract/verification checks before deploy — running service untouched (see last-deploy.json / logs)

*Version:* \`${version}\`
*Commit:* \`${commit:0:8}\`
*CI Run:* [#${run_label}](${run_url})"
      ;;
    rollback_success)
      emoji="⚠️"
      body="*Panoptikon rollback complete*

${emoji} Rolled back to previous version
*Host:* LXC ${LXC_ID} (${LXC_HOST})
*Health:* ${PANOPTIKON_URL}/login ✓"
      ;;
    rollback_failed)
      emoji="🔴"
      body="*Panoptikon CRITICAL*

${emoji} Deploy AND rollback failed!
Manual intervention required on LXC ${LXC_ID}"
      ;;
  esac

  # The bot token is part of the URL; feed it through a curl config on stdin
  # so it never appears in argv (/proc/<pid>/cmdline, `bash -x` traces).
  curl -s -K - \
    -d "chat_id=${TELEGRAM_CHAT_ID}" \
    -d "parse_mode=Markdown" \
    --data-urlencode "text=${body}" > /dev/null 2>&1 \
    <<<"url = \"https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage\"" || {
    log "WARNING: Failed to send Telegram notification"
  }
}

# ── Main: One-shot deploy ────────────────────────────────────────────────────

# status: success | failed | preflight_failed | rejected. Built with jq so
# that values taken from the artifact can never break the JSON.
write_deploy_state() {
  local status="$1" run_id="$2" commit="$3" version="$4" artifact_id="$5"
  jq -n \
    --arg forge forgejo \
    --arg repo "$REPO" \
    --arg run_id "$run_id" \
    --arg run_number "$RUN_INDEX" \
    --arg run_url "$RUN_URL" \
    --arg artifact_id "$artifact_id" \
    --arg artifact_name "$ARTIFACT_NAME" \
    --arg commit "$commit" \
    --arg version "$version" \
    --arg deployed_at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    --arg status "$status" \
    '{forge: $forge, repo: $repo, run_id: $run_id, run_number: $run_number,
      run_url: $run_url, artifact_id: $artifact_id, artifact_name: $artifact_name,
      commit: $commit, version: $version, deployed_at: $deployed_at, status: $status}' \
    > "$DEPLOY_STATE_DIR/last-deploy.json" \
    || log "WARNING: could not write $DEPLOY_STATE_DIR/last-deploy.json"
}

do_deploy() {
  log "=== Panoptikon Deploy Worker ==="
  log "Checking Forgejo for new successful builds ($REPO, workflow $CI_WORKFLOW, branch $CI_BRANCH)..."

  # Get latest successful CI run
  local run_json
  if ! run_json="$(get_latest_successful_run)"; then
    log "Failed to query $FORGEJO_API for workflow runs"
    return 1
  fi

  if [[ -z "$run_json" ]]; then
    log "No successful $CI_WORKFLOW runs found on $CI_BRANCH"
    return 1
  fi

  local run_id run_index commit created_at
  run_id=$(jq -r '.id' <<<"$run_json")
  run_index=$(jq -r '.index' <<<"$run_json")
  commit=$(jq -r '.commit' <<<"$run_json")
  created_at=$(jq -r '.created' <<<"$run_json")
  RUN_INDEX="$run_index"
  RUN_URL=$(jq -r '.url // empty' <<<"$run_json")

  log "Latest successful build: run=$run_id (#$run_index) commit=${commit:0:8} at=$created_at"
  log "  $RUN_URL"

  # Check if already deployed
  local last_deployed
  last_deployed=$(get_last_deployed_run)

  if [[ "$last_deployed" == "$run_id" ]]; then
    log "Run $run_id already deployed — nothing to do"
    return 0
  fi

  # A run that already failed to deploy is tried once, not every poll: the
  # Forgejo run stays "success" forever, so without this marker --watch would
  # deploy/fail/roll back the same build every POLL_INTERVAL.
  local last_failed
  last_failed=$(get_last_failed_run)
  if [[ -n "$last_failed" && "$last_failed" == "$run_id" && "$RETRY_FAILED_RUN" != "1" ]]; then
    log "Run $run_id already failed to deploy (see $DEPLOY_STATE_DIR/last-deploy.json) — skipping until a newer run appears; set RETRY_FAILED_RUN=1 or remove $FAILED_RUN_FILE to retry"
    return 1
  fi

  log "New build detected (last deployed: ${last_deployed:-none})"

  # Locate the artifact on that run
  local artifact_json
  if ! artifact_json="$(find_run_artifact "$run_id")"; then
    log "Could not list artifacts of run $run_id — will retry on the next poll"
    return 1
  fi
  if [[ -z "$artifact_json" ]]; then
    log "Run $run_id has no usable artifact named '$ARTIFACT_NAME' (available: $(list_run_artifact_names "$run_id"))"
    return 1
  fi

  local artifact_id
  artifact_id=$(jq -r '.id' <<<"$artifact_json")
  log "Artifact: id=$artifact_id name=$(jq -r '.name' <<<"$artifact_json") size=$(jq -r '.size' <<<"$artifact_json") bytes expires=$(jq -r '.expires_at' <<<"$artifact_json")"

  # Download, contract checks (sha256 sidecar, metadata cross-check, ELF64
  # x86-64) — all before anything touches production.
  local tmp_dir
  tmp_dir=$(mktemp -d)
  CLEANUP_PATHS+=("$tmp_dir")

  local prep_rc=0
  prepare_artifact "$artifact_id" "$tmp_dir" "$commit" "$run_id" "$run_index" || prep_rc=$?
  if (( prep_rc == 2 )); then
    log "=== Artifact not retrievable right now — nothing deployed, will retry on the next poll ==="
    rm -rf "$tmp_dir"
    return 1
  elif (( prep_rc != 0 )); then
    log "=== Artifact REJECTED — nothing deployed; run $run_id is skipped until a newer run appears or RETRY_FAILED_RUN=1 ==="
    local rejected_version
    rejected_version="$(artifact_version "$tmp_dir")"
    save_last_failed_run "$run_id"
    notify_telegram "rejected" "$rejected_version" "$commit" "$run_id"
    write_deploy_state "rejected" "$run_id" "$commit" "$rejected_version" "$artifact_id"
    rm -rf "$tmp_dir"
    return 1
  fi

  local binary="$tmp_dir/$BINARY_NAME"
  local version
  version="$(artifact_version "$tmp_dir")"

  # Backup current binary
  backup_current_binary

  # Deploy (pre-flight inside the LXC happens before the service is stopped)
  log "=== Deploying version $version (commit ${commit:0:8}) ==="
  local deploy_rc=0
  deploy_binary "$binary" "$version" || deploy_rc=$?

  if (( deploy_rc == 3 )); then
    log "=== Deploy REJECTED by pre-flight — production untouched ==="
    save_last_failed_run "$run_id"
    notify_telegram "preflight_failed" "$version" "$commit" "$run_id"
    write_deploy_state "preflight_failed" "$run_id" "$commit" "$version" "$artifact_id"
    rm -rf "$tmp_dir"
    return 1
  elif (( deploy_rc != 0 )); then
    log "=== Deploy FAILED after service stop — initiating rollback ==="
    save_last_failed_run "$run_id"
    notify_telegram "failure" "$version" "$commit" "$run_id"
    write_deploy_state "failed" "$run_id" "$commit" "$version" "$artifact_id"
    rm -rf "$tmp_dir"
    do_rollback
    return 1
  fi

  # Health check
  if health_check; then
    log "=== Deploy successful ==="
    save_last_deployed_run "$run_id"
    clear_last_failed_run
    notify_telegram "success" "$version" "$commit" "$run_id"
    write_deploy_state "success" "$run_id" "$commit" "$version" "$artifact_id"
    rm -rf "$tmp_dir"
  else
    log "=== Deploy FAILED — initiating rollback ==="
    save_last_failed_run "$run_id"
    notify_telegram "failure" "$version" "$commit" "$run_id"
    write_deploy_state "failed" "$run_id" "$commit" "$version" "$artifact_id"
    rm -rf "$tmp_dir"

    do_rollback
    return 1
  fi
}

# ── Main: Check mode ─────────────────────────────────────────────────────────

do_check() {
  log "=== Panoptikon Deploy Worker (check) ==="
  require_forgejo_access

  local run_json
  run_json="$(get_latest_successful_run)" || die "Failed to query workflow runs"
  [[ -n "$run_json" ]] || die "No successful $CI_WORKFLOW runs on $CI_BRANCH in $REPO"
  log "Latest successful run: $run_json"

  local run_id
  run_id=$(jq -r '.id' <<<"$run_json")

  local artifact_json
  artifact_json="$(find_run_artifact "$run_id")"
  if [[ -z "$artifact_json" ]]; then
    log "No usable artifact '$ARTIFACT_NAME' on run $run_id (available: $(list_run_artifact_names "$run_id"))"
    return 1
  fi
  log "Artifact: $artifact_json"
  log "Last deployed run: $(get_last_deployed_run)"
  local last_failed
  last_failed=$(get_last_failed_run)
  if [[ -n "$last_failed" && "$last_failed" == "$run_id" ]]; then
    log "Last failed run: $last_failed — a deploy would SKIP this run (RETRY_FAILED_RUN=1 to retry)"
  else
    log "Check OK — a deploy would ship run $run_id"
  fi
}

# ── Main: Watch mode ─────────────────────────────────────────────────────────

do_watch() {
  log "=== Panoptikon Deploy Worker (watch mode) ==="
  log "Polling every ${POLL_INTERVAL}s for new builds..."

  while true; do
    if do_deploy; then
      :  # success or nothing to do
    else
      log "Deploy cycle returned non-zero (may be expected)"
    fi
    sleep "$POLL_INTERVAL"
  done
}

# ── Entry point ───────────────────────────────────────────────────────────────

main() {
  ensure_dirs
  trap cleanup EXIT

  local mode="${1:---once}"

  # Set up logging first so that every warning below (token file mode,
  # non-https refusal, missing tools) lands in the per-run log as well.
  local log_file="$LOG_DIR/deploy-$(date -u +%Y%m%dT%H%M%SZ).log"
  exec > >(tee -a "$log_file") 2>&1
  log "Log file: $log_file"

  # The only value that ever reaches the remote shell's command line.
  [[ "$LXC_ID" =~ ^[0-9]+$ ]] || die "LXC_ID must be numeric (got '$LXC_ID')"

  resolve_verify_exec
  require_cmds
  load_forgejo_config

  case "$mode" in
    --watch)
      acquire_lock
      check_forgejo_access || true
      do_watch
      ;;
    --rollback)
      acquire_lock
      do_rollback
      ;;
    --check)
      # Read-only: must work while a --watch worker holds the lock.
      do_check
      ;;
    --once|"")
      acquire_lock
      require_forgejo_access
      do_deploy
      ;;
    *)
      echo "Usage: $0 [--watch | --rollback | --check | --once]"
      exit 1
      ;;
  esac
}

main "$@"
