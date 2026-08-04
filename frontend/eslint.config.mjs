import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // This app is a client-rendered SPA-like shell over an external Go API
      // (no React Query/SWR, no server components fetching this data) — the
      // idiomatic pattern here is "kick off an async load() in useEffect on
      // mount/dependency change", which synchronously sets a `loading` flag
      // before the first await. That's exactly what this rule flags. Adopting
      // the rule's preferred alternative (the `use()` hook + Suspense) would
      // be a much larger architectural change than this pass calls for, so
      // it's downgraded to a warning rather than reworked file-by-file.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
