#!/usr/bin/env python3
"""Delete surfaceClass + naked-Card patches on /qos and /nat.

Per design: Card primitive already resolves to .mesh-card recipe (PR #785).
Adding `border-mesh-border-strong bg-gradient-to-b from-mesh-surface-1/80
to-mesh-surface-1/55 shadow-[...]` on top is a double border + drift.
"""
import pathlib
import sys

OLD_DECL = (
    'const surfaceClass =\n'
    '  "border-mesh-border-strong bg-gradient-to-b from-mesh-surface-1/80 to-mesh-surface-1/55 shadow-[0_12px_30px_rgba(2,6,23,0.35)]";\n\n'
)

for path in [
    "web/src/app/(app)/qos/page.tsx",
    "web/src/app/(app)/nat/page.tsx",
]:
    p = pathlib.Path(path)
    src = p.read_text()
    if OLD_DECL not in src:
        print(f"WARN: surfaceClass decl not found in {path}")
        sys.exit(1)
    src = src.replace(OLD_DECL, "")
    n = src.count("<Card className={surfaceClass}>")
    src = src.replace("<Card className={surfaceClass}>", "<Card>")
    p.write_text(src)
    print(f"{path}: removed decl + {n} Card consumers")
