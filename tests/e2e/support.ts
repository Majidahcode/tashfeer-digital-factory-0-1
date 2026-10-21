import type { Page, TestInfo } from "@playwright/test";

export const FEATURES = ["فهم احتياجاتك", "تحليل المشروع", "بحث وتدقيق", "بناء النماذج الأولية", "الإنتاج الفعلي"];

const width = (info: TestInfo) => info.project.use.viewport?.width ?? 0;

/** The full ≥1280 scene (five distinct phrase slots) driven by a mouse — decided by capability, not project name. */
export const isFullDesktop = (info: TestInfo) => width(info) >= 1280 && !info.project.use.hasTouch;

/** Wide screens for the empty-margin criterion P1-08 (1920 and 2560). */
export const isWide = (info: TestInfo) => width(info) >= 1920;

/** Load the homepage and wait until client effects have run (the background stamps data-ambient-motion). */
export async function openHome(page: Page) {
  await page.goto("/");
  await page.locator("[data-ambient-background][data-ambient-motion]").waitFor({ state: "attached" });
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
}

/**
 * Freeze time before the page loads: every timer (phrase cycle, rAF) then advances only through
 * page.clock.runFor, so the phrase-cycle assertions are deterministic. Timers registered on mount start at t = 0.
 */
export async function openHomeFrozen(page: Page) {
  await page.clock.install({ time: new Date("2026-01-01T00:00:00Z") });
  await page.clock.pauseAt(new Date("2026-01-01T00:00:01Z"));
  await openHome(page);
}

/** Let React commit updates queued by timers that runFor just fired (MessageChannel is not faked by the clock). */
export async function flush(page: Page) {
  for (let i = 0; i < 3; i++) {
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          const channel = new MessageChannel();
          channel.port1.onmessage = () => resolve();
          channel.port2.postMessage(null);
        }),
    );
  }
}

/** Advance the frozen clock and let React commit. */
export async function advance(page: Page, ms: number) {
  await page.clock.runFor(ms);
  await flush(page);
}

export async function autoIndex(page: Page) {
  return Number(await page.locator("[data-ambient-phrases]").getAttribute("data-auto-index"));
}

export async function phraseStates(page: Page) {
  return page
    .locator("[data-phrase-index]")
    .evaluateAll((els) => els.map((el) => `${el.getAttribute("data-state")}:${el.getAttribute("data-reveal-source") ?? "-"}`));
}
