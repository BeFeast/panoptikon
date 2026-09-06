#!/usr/bin/env bash
# release-publish.sh — create a Forgejo release for a tag and upload every
# file in an assets directory as a release attachment, using nothing but
# curl, jq and the Forgejo REST API.
#
# Usage:
#   scripts/release-publish.sh --tag vX.Y.Z --assets DIR [--notes FILE]
#                              [--title TEXT] [--prerelease auto|true|false]
#                              [--expect NAME]... [--draft] [--replace] [--dry-run]
#
# Environment:
#   FORGEJO_TOKEN  required (a Forgejo Actions run token or a PAT with
#                  repository write access) — not needed with --dry-run
#   FORGEJO_API    default https://git.oklabs.uk/api/v1
#   REPO           default BeFeast/panoptikon (owner/name)
#
# Published releases are immutable: if a non-draft release already exists for
# the tag the script refuses to touch it unless --replace is given (then title
# and notes are updated only if passed, and same-named attachments are deleted
# and re-uploaded — every replaced name is listed at the end). The release is
# created as a DRAFT, assets are uploaded, and only then is it published, so a
# failed or partial run can simply be re-run: a draft left behind by an
# earlier attempt is resumed, never refused. --draft leaves it a draft.
# --expect NAME (repeatable) makes the script refuse to publish unless every
# named file is present and non-empty in DIR — the guard against a partially
# failed build matrix. --dry-run performs the read-only lookups and prints
# every write it would do (a draft is invisible to an anonymous dry run).
#
# API (Forgejo 16, verified against https://git.oklabs.uk/swagger.v1.json):
#   GET    /repos/{owner}/{repo}/releases/tags/{tag}
#   POST   /repos/{owner}/{repo}/releases
#   PATCH  /repos/{owner}/{repo}/releases/{id}
#   POST   /repos/{owner}/{repo}/releases/{id}/assets?name=...  (multipart "attachment")
#   DELETE /repos/{owner}/{repo}/releases/{id}/assets/{attachment_id}

set -euo pipefail

FORGEJO_API="${FORGEJO_API:-https://git.oklabs.uk/api/v1}"
FORGEJO_API="${FORGEJO_API%/}"
REPO="${REPO:-BeFeast/panoptikon}"
TAG=""
ASSETS=""
NOTES=""
TITLE=""
PRERELEASE="auto"
DRAFT="false"
REPLACE="false"
DRY_RUN="false"
EXPECT=()

usage() { sed -n '2,34p' "$0" | sed 's/^# \{0,1\}//'; exit 2; }

while [ $# -gt 0 ]; do
  case "$1" in
    --tag)        TAG="${2:?}"; shift 2 ;;
    --assets)     ASSETS="${2:?}"; shift 2 ;;
    --notes)      NOTES="${2:?}"; shift 2 ;;
    --title)      TITLE="${2:?}"; shift 2 ;;
    --prerelease) PRERELEASE="${2:?}"; shift 2 ;;
    --expect)     EXPECT+=("${2:?}"); shift 2 ;;
    --draft)      DRAFT="true"; shift ;;
    --replace)    REPLACE="true"; shift ;;
    --dry-run)    DRY_RUN="true"; shift ;;
    -h|--help)    usage ;;
    *) echo "unknown argument: $1" >&2; usage ;;
  esac
done

[ -n "$TAG" ] || { echo "--tag is required" >&2; exit 2; }
[ -n "$ASSETS" ] && [ -d "$ASSETS" ] || { echo "--assets must be an existing directory" >&2; exit 2; }
[ -z "$NOTES" ] || [ -f "$NOTES" ] || { echo "--notes file not found: $NOTES" >&2; exit 2; }
command -v jq >/dev/null || { echo "jq is required" >&2; exit 2; }
if [ "$DRY_RUN" != "true" ]; then
  [ -n "${FORGEJO_TOKEN:-}" ] || { echo "FORGEJO_TOKEN is not set" >&2; exit 2; }
fi

printf '%s\n' "$TAG" \
  | grep -Eq '^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-[0-9A-Za-z.]+)?$' \
  || { echo "tag must look like v1.2.3 or v1.2.3-rc.1, got: $TAG" >&2; exit 2; }

case "$PRERELEASE" in
  auto)  case "$TAG" in *-*) PRERELEASE=true ;; *) PRERELEASE=false ;; esac ;;
  true|false) ;;
  *) echo "--prerelease must be auto, true or false" >&2; exit 2 ;;
esac

# --- 0. Expected asset set (checked before any write) -------------------------

missing=0
for name in ${EXPECT[@]+"${EXPECT[@]}"}; do
  if [ ! -s "$ASSETS/$name" ]; then
    echo "missing or empty release asset: $ASSETS/$name" >&2
    missing=$((missing + 1))
  fi
done
[ "$missing" -eq 0 ] || { echo "$missing expected asset(s) missing; refusing to publish" >&2; exit 1; }

BASE="$FORGEJO_API/repos/$REPO"

# The token never goes on a command line (/proc/<pid>/cmdline is readable by
# every process on the runner host, and `heavy` jobs of other repositories
# share that host): curl reads the Authorization header from a private file.
WORK="$(mktemp -d)"
chmod 0700 "$WORK"
trap 'rm -rf "$WORK"' EXIT
BODY_FILE="$WORK/body"
AUTH_FILE="$WORK/authorization"
: > "$AUTH_FILE"
chmod 0600 "$AUTH_FILE"
if [ -n "${FORGEJO_TOKEN:-}" ]; then
  printf 'Authorization: token %s\n' "$FORGEJO_TOKEN" > "$AUTH_FILE"
fi
unset FORGEJO_TOKEN

# api METHOD PATH [curl args...] -> prints HTTP status, response body in $BODY_FILE
api() {
  local method="$1" path="$2"; shift 2
  curl -sS -o "$BODY_FILE" -w '%{http_code}' -X "$method" \
    -H @"$AUTH_FILE" -H "Accept: application/json" "$@" "$BASE$path"
}

fail() { echo "$1" >&2; echo "response: $(cat "$BODY_FILE")" >&2; exit 1; }

# --- 1. Find, resume or create the release ------------------------------------

release_id=""
was_draft="true"
status="$(api GET "/releases/tags/$TAG")"
case "$status" in
  200)
    release_id="$(jq -r '.id' "$BODY_FILE")"
    was_draft="$(jq -r '.draft' "$BODY_FILE")"
    asset_count="$(jq -r '.assets | length' "$BODY_FILE")"
    if [ "$was_draft" = "true" ]; then
      echo "Resuming unpublished draft release for $TAG (id $release_id, $asset_count attachment(s) so far)"
    elif [ "$REPLACE" = "true" ]; then
      echo "Release $TAG is already published (id $release_id, $asset_count attachment(s)); --replace given, overwriting"
    else
      echo "Release $TAG is already published (id $release_id, $asset_count attachment(s))." >&2
      echo "Published releases are immutable; pass --replace to overwrite its notes and attachments." >&2
      exit 1
    fi
    # Only fields that were explicitly given are sent, so a re-run without
    # --notes/--title keeps the existing text instead of blanking it.
    patch="$(jq -n --arg title "$TITLE" --rawfile notes "${NOTES:-/dev/null}" --arg has_notes "${NOTES:+y}" \
      '{} + (if $title != "" then {name: $title} else {} end)
          + (if $has_notes == "y" then {body: $notes} else {} end)')"
    if [ "$patch" != "{}" ]; then
      if [ "$DRY_RUN" = "true" ]; then
        echo "[dry-run] PATCH $BASE/releases/$release_id $(printf '%s' "$patch" | jq -c 'keys')"
      else
        status="$(api PATCH "/releases/$release_id" -H "Content-Type: application/json" --data "$patch")"
        [ "$status" = "200" ] || fail "updating release failed (HTTP $status)"
      fi
    fi
    ;;
  404)
    create_json="$(jq -n \
      --arg tag "$TAG" --arg title "${TITLE:-$TAG}" --arg pre "$PRERELEASE" \
      --rawfile notes "${NOTES:-/dev/null}" \
      '{tag_name: $tag, name: $title, body: $notes, draft: true, prerelease: ($pre == "true")}')"
    echo "Creating draft release $TAG (prerelease=$PRERELEASE)"
    if [ "$DRY_RUN" = "true" ]; then
      echo "[dry-run] POST $BASE/releases"
      printf '%s' "$create_json" | jq '.body |= (.[0:200] + (if length > 200 then "…" else "" end))'
      release_id="DRY"
    else
      status="$(api POST "/releases" -H "Content-Type: application/json" --data "$create_json")"
      [ "$status" = "201" ] || fail "creating release failed (HTTP $status)"
      release_id="$(jq -r '.id' "$BODY_FILE")"
    fi
    ;;
  *)
    fail "looking up release $TAG failed (HTTP $status)"
    ;;
esac

# --- 2. Upload assets (replacing same-named attachments) ----------------------

existing_assets="[]"
if [ "$release_id" != "DRY" ]; then
  status="$(api GET "/releases/$release_id")"
  [ "$status" = "200" ] || fail "reading release $release_id failed (HTTP $status)"
  existing_assets="$(jq -c '[.assets[]? | {id, name}]' "$BODY_FILE")"
fi

uploaded=0
replaced=()
for file in "$ASSETS"/*; do
  [ -f "$file" ] || continue
  name="$(basename "$file")"
  size="$(wc -c < "$file" | tr -d ' ')"

  old_id="$(printf '%s' "$existing_assets" | jq -r --arg n "$name" '.[] | select(.name == $n) | .id' | head -n1)"
  if [ -n "$old_id" ]; then
    if [ "$DRY_RUN" = "true" ]; then
      echo "[dry-run] DELETE $BASE/releases/$release_id/assets/$old_id ($name)"
    else
      status="$(api DELETE "/releases/$release_id/assets/$old_id")"
      [ "$status" = "204" ] || fail "deleting stale attachment $name ($old_id) failed (HTTP $status)"
    fi
    replaced+=("$name")
  fi

  if [ "$DRY_RUN" = "true" ]; then
    echo "[dry-run] POST $BASE/releases/$release_id/assets?name=$name  ($size bytes)"
    continue
  fi

  status="$(api POST "/releases/$release_id/assets?name=$(jq -rn --arg n "$name" '$n|@uri')" \
    -F "attachment=@$file;filename=$name")"
  [ "$status" = "201" ] || fail "uploading $name failed (HTTP $status)"
  got="$(jq -r '.size' "$BODY_FILE")"
  [ "$got" = "$size" ] || fail "uploaded $name but server reports $got bytes, expected $size"
  echo "Uploaded $name ($size bytes)"
  uploaded=$((uploaded + 1))
done

# --- 3. Publish (flip the draft) ----------------------------------------------

if [ "$DRY_RUN" = "true" ]; then
  if [ "$DRAFT" != "true" ] && [ "$was_draft" = "true" ]; then
    echo "[dry-run] PATCH $BASE/releases/$release_id {\"draft\": false}"
  fi
  [ "${#replaced[@]}" -eq 0 ] || echo "[dry-run] would replace: ${replaced[*]}"
  echo "[dry-run] done"
  exit 0
fi

[ "$uploaded" -gt 0 ] || { echo "no assets were uploaded from $ASSETS" >&2; exit 1; }

if [ "$DRAFT" = "true" ]; then
  echo "Leaving $TAG as a draft (--draft)"
elif [ "$was_draft" = "true" ]; then
  status="$(api PATCH "/releases/$release_id" -H "Content-Type: application/json" --data '{"draft": false}')"
  [ "$status" = "200" ] || fail "publishing release failed (HTTP $status)"
  echo "Published $TAG"
fi

status="$(api GET "/releases/$release_id")"
[ "$status" = "200" ] || fail "re-reading release failed (HTTP $status)"
echo "Release: $(jq -r '.html_url' "$BODY_FILE") (draft=$(jq -r '.draft' "$BODY_FILE"), prerelease=$(jq -r '.prerelease' "$BODY_FILE"))"
jq -r '.assets[] | "  \(.name)\t\(.size) bytes"' "$BODY_FILE"
if [ "${#replaced[@]}" -gt 0 ]; then
  echo "Replaced ${#replaced[@]} existing attachment(s): ${replaced[*]}"
fi
