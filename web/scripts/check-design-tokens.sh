#!/usr/bin/env bash
set -euo pipefail

# Guards against raw Tailwind color literals AND ad-hoc card recipe combos
# in production frontend code.
# Source of truth: design tokens in tokens.css + mesh-* aliases in
# tailwind.config.ts + .mesh-card / .mesh-card-2 utility recipes in globals.css.

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

# Guard 2: ad-hoc card recipe combos.
# Anything matching "border  border-mesh-border[*]  bg-mesh-surface-[12]"
# must instead use .mesh-card / .mesh-card-2 utility class. We require the
# bare "border " token (not border-b/t/l/r/dashed) since those denote
# single-side hairlines / dividers, not card chrome.

# Build a strict regex: a string token "border" surrounded by whitespace or quote,
# then anything up to border-mesh-border(-strong)?, then anything up to
# bg-mesh-surface-1 or 2 (optional opacity suffix). Excludes hover: prefix.

CARD_PATTERN='(^|[" ])border (-strong)?[^"]*border-mesh-border(-strong)?(/[0-9]+)?[^"]*bg-mesh-surface-[12](/[0-9]+)?'

card_violations=$(grep -rEn "$CARD_PATTERN" "${SCAN_DIRS[@]}" "${EXCLUDES[@]}" \
  --include="*.tsx" --include="*.ts" \
  2>/dev/null || true)

# Strip lines that are clearly NOT card combos (hover:, data-[state]):
card_violations=$(echo "$card_violations" | grep -vE "hover:bg-mesh-surface|data-\[state[^]]+\]:bg-mesh-surface" || true)
# Strip whitelisted infra files
card_violations=$(echo "$card_violations" | grep -vE "(components/ui/|globals\.css|tailwind\.config|lib/utils\.ts)" || true)

if [ -n "$card_violations" ]; then
  echo "ERROR: ad-hoc card recipe combos found in production code:"
  echo "$card_violations"
  echo
  echo "Use the .mesh-card / .mesh-card-2 utility classes (web/src/app/globals.css)"
  echo "instead of ad-hoc 'border border-mesh-border[*] bg-mesh-surface-[12]' combos."
  echo "These utilities mirror the design-source .card / .card-2 recipes byte-exact."
  exit 1
fi

echo "OK: no ad-hoc card recipe combos in production code"
