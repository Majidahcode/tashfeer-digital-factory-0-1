import { defineConfig } from "@playwright/test";

/**
 * Unit tests run on Playwright Test in Node (no browser is launched).
 * Vitest was planned, but npm 10.9 crashes resolving vitest 5's optional peers next to @playwright/test
 * (see docs/PHASE_1_REPORT.md) — one runner keeps the toolchain smaller.
 */
export default defineConfig({
  testDir: "tests/unit",
  testMatch: "**/*.spec.ts",
  fullyParallel: true,
  reporter: [["list"]],
});
