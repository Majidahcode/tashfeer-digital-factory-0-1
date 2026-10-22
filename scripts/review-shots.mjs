/**
 * Review screenshots for the owner's visual sign-off (acceptance test P1-17).
 *
 *   npm run build && npx next start -p 3100     # in another terminal
 *   npm run review:shots [-- <outDir>]          # default: docs/review/phase-1
 *
 * Viewports from docs/ACCEPTANCE_TESTS.md §2 (+768×1024). Phones and tablets are captured full-page because
 * they scroll by design (after scrolling through once, so the steps have powered on); desktops are captured at the
 * viewport, which is what the scene must fill.
 * Prints one line per size: page height, whether it fits the viewport, horizontal overflow.
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";

const BASE = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3100";
const OUT = process.argv[2] ?? "docs/review/phase-1";
const SIZES = [
  { name: "1440x900", width: 1440, height: 900 },
  { name: "1280x800", width: 1280, height: 800 },
  { name: "390x844", width: 390, height: 844, mobile: true },
  { name: "1920x1080", width: 1920, height: 1080 },
  { name: "2560x1080", width: 2560, height: 1080 },
  { name: "1024x768", width: 1024, height: 768, fullPage: true },
  { name: "768x1024", width: 768, height: 1024, fullPage: true },
];

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
try {
  for (const s of SIZES) {
    const context = await browser.newContext({
      viewport: { width: s.width, height: s.height },
      locale: "ar-SA",
      isMobile: Boolean(s.mobile),
      hasTouch: Boolean(s.mobile),
      deviceScaleFactor: s.mobile ? 2 : 1,
    });
    const page = await context.newPage();
    const errors = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.locator("[data-ambient-motion]").waitFor({ state: "attached" });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(1400); // the first phrase has faded in; well before it fades out (3.6 s)
    const fullPage = Boolean(s.mobile || s.fullPage);
    if (fullPage) {
      // scroll through the page like a visitor first: the 01–05 tiles power on as they enter the viewport, and a
      // full-page capture never scrolls (they would all show their dark, not-yet-seen state)
      const height = await page.evaluate(() => document.documentElement.scrollHeight);
      for (let y = 0; y <= height; y += Math.round(s.height * 0.6)) {
        await page.evaluate((top) => window.scrollTo(0, top), y);
        await page.waitForTimeout(250);
      }
      await page.waitForTimeout(2600);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(400);
    }
    const file = path.join(OUT, `home-${s.name}.jpg`);
    await page.screenshot({ path: file, type: "jpeg", quality: 85, fullPage });
    const m = await page.evaluate(() => ({
      docH: document.documentElement.scrollHeight,
      vh: innerHeight,
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }));
    console.log(
      `${s.name.padEnd(10)} ${file}  height ${m.docH}px (${m.docH <= m.vh ? "fits" : `scrolls ${m.docH - m.vh}px`}), ` +
        `x-overflow ${m.overflowX}px, console errors ${errors.length}`,
    );
    await context.close();
  }
} finally {
  await browser.close();
}
