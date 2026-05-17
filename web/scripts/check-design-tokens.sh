#!/usr/bin/env bash
set -euo pipefail

# Guards against raw Tailwind color literals in production frontend code.
# Source of truth: design tokens in tokens.css and mesh-* aliases in
# tailwind.config.ts. New colors must use either a mesh-* alias or a
# literal hex from the design palette.

PATTERN='(cyan|sky|teal|slate|indigo|emerald|rose|amber|fuchsia|violet|blue|green|yellow|red|orange|pink|purple|stone|zinc|neutral|gray)-[0-9]+'
EXCLUDES=(--exclude-dir=node_modules --exclude-dir=.next --exclude-dir=out --exclude-dir=ui)
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SCAN_DIRS=("$ROOT/src/app" "$ROOT/src/components")

violations=$(grep -rEn "$PATTERN" "${SCAN_DIRS[@]}" "${EXCLUDES[@]}" \
  --include="*.tsx" --include="*.ts" --include="*.jsx" --include="*.js" \
  2>/dev/null || true)

# Filter out files that legitimately define / map tokens.
violations=$(echo "$violations" | grep -vE "(components/ui/|globals\.css|tailwind\.config|lib/utils\.ts)" || true)

if [ -n "$violations" ]; then
  echo "ERROR: raw Tailwind color literals found in production code:"
  echo "$violations"
  echo
  echo "Use mesh-* tokens (see web/tailwind.config.ts) or a literal hex from"
  echo "the design source tokens.css. No approximations."
  exit 1
fi

echo "OK: no raw Tailwind color literals in production code"
