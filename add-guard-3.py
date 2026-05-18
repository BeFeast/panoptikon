#!/usr/bin/env python3
"""Add Guard 3 to check-design-tokens.sh — catch gradient-on-mesh-surface drift."""
import pathlib

p = pathlib.Path("web/scripts/check-design-tokens.sh")
src = p.read_text()

OLD = 'echo "OK: no ad-hoc card recipe combos in production code"'
NEW = '''echo "OK: no ad-hoc card recipe combos in production code"

# Guard 3: gradient-on-mesh-surface combos. The .card recipe in base.css uses
# solid var(--surface-1) — gradients on top of mesh-surface tokens are the
# same drift class as ad-hoc card combos, just escaping pattern 2.
GRADIENT_PATTERN='bg-gradient-to-[btlr]+[^"]*from-mesh-surface'

gradient_violations=$(grep -rEn "$GRADIENT_PATTERN" "${SCAN_DIRS[@]}" "${EXCLUDES[@]}" \\
  --include="*.tsx" --include="*.ts" \\
  2>/dev/null || true)

gradient_violations=$(echo "$gradient_violations" | grep -vE "(components/ui/|globals\\.css|tailwind\\.config|lib/utils\\.ts)" || true)

if [ -n "$gradient_violations" ]; then
  echo "ERROR: gradient-on-mesh-surface combos found:"
  echo "$gradient_violations"
  echo
  echo "The .card recipe in base.css uses solid var(--surface-1). Drop the"
  echo "gradient (use <Card> primitive which already has .mesh-card baked in)"
  echo "or, if a gradient is truly the design, port it as a utility class in"
  echo "globals.css and whitelist that class."
  exit 1
fi
echo "OK: no gradient-on-mesh-surface combos in production code"'''

assert OLD in src, "anchor not found"
src = src.replace(OLD, NEW)
p.write_text(src)
print("guard #3 added")
