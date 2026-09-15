import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  // Design reference JSX fragments are not compiled application modules.
  globalIgnores([".next/**", "out/**", "next-env.d.ts", "src/**/_design-source/**"]),
  {
    files: ["src/**/*.ts", "src/**/*.tsx"],
    // Next 16 adds React Compiler diagnostics to the recommended preset.
    // Surface existing patterns as warnings during this dependency migration;
    // keep correctness rules and ESLint execution failures blocking.
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/static-components": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
    },
  },
]);
