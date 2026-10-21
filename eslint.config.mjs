import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Generated UI must never inject raw HTML (see docs/REPO_AUDIT.md DEF-01).
      "react/no-danger": "error",
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "node_modules/**",
    "public/assets/**",
    "next-env.d.ts",
    "test-results/**",
    "playwright-report/**",
    "Tashfeer_Claude_Pro_MVP_Package/**",
  ]),
]);
