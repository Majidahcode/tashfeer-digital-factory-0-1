import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`;
const chromium = devices["Desktop Chrome"];

/** End-to-end tests against the production build (`npm run build` first). Viewports from docs/ACCEPTANCE_TESTS.md §2. */
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL,
    locale: "ar-SA",
    trace: "retain-on-failure",
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `npx next start -p ${PORT}`,
        url: baseURL,
        reuseExistingServer: true,
        timeout: 120_000,
      },
  projects: [
    { name: "desktop-1440", use: { ...chromium, viewport: { width: 1440, height: 900 } } },
    { name: "desktop-1280", use: { ...chromium, viewport: { width: 1280, height: 800 } } },
    {
      name: "mobile-390",
      use: { ...chromium, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
    },
    { name: "tablet-1024", use: { ...chromium, viewport: { width: 1024, height: 768 } } },
    { name: "tablet-768", use: { ...chromium, viewport: { width: 768, height: 1024 }, hasTouch: true } },
    { name: "wide-1920", use: { ...chromium, viewport: { width: 1920, height: 1080 } } },
    { name: "ultrawide-2560", use: { ...chromium, viewport: { width: 2560, height: 1080 } } },
  ],
});
