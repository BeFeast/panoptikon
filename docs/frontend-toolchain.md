# Frontend toolchain

The frontend uses Next 16.3.5, React 19.3.0 and TypeScript 7.0.2 native checking. Use Bun and the committed `web/bun.lock` for local development, CI and packaging.

From `web/`:

```sh
bun install --frozen-lockfile
bun run typecheck
bun run lint
bun run test
bun run build
```

`typecheck` generates Next route types, then explicitly executes `@typescript/native`'s compiler over the complete project, including test/config files. `build` runs this same mandatory check before static export. A failed native check stops the command before Next compilation. Next's redundant built-in check is disabled deliberately; do not invoke `next build` directly in automation. CI, release, Docker and Makefile use `bun run build`. The exported `web/out` remains embedded by Rust.

`typescript@6.0.3` is retained only for ESLint's JavaScript compiler API. It does not run our typecheck gate. `@typescript/native` aliases the stable `typescript@7.0.2` package; its explicit executable path avoids ambiguity between two `tsc` binaries. The `@typescript/typescript6` compatibility wrapper produced a self-referential `@typescript/old` installation under the local Bun version, so the legacy API package is pinned directly instead.

Editor language service selection is separate: an editor that follows the root `typescript` package may still use TypeScript 6. This change standardizes repository commands and CI; it does not modify global editor settings or claim the native language server is enabled.

The Next 16 ESLint flat config keeps existing React Compiler migration diagnostics visible as warnings, scoped to application TS/TSX, while correctness errors and broken lint execution fail CI. Noncompiled `_design-source` JSX fragments are excluded. This migration does not enable React Compiler or rewrite existing effect/state patterns.

Playwright still transforms tests independently and runs Chromium normally: native TypeScript speeds the checking stage, not browser execution. Use the existing `bun run test:e2e` against a dedicated test server, never production. For local isolation the full regression suite was run with two workers against the newly built Rust server inside a temporary user/network namespace containing only loopback.
