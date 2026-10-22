import type { Page, TestInfo } from "@playwright/test";

export const FEATURES = ["فهم احتياجاتك", "تحليل المشروع", "بحث وتدقيق", "بناء النماذج الأولية", "الإنتاج الفعلي"];

const width = (info: TestInfo) => info.project.use.viewport?.width ?? 0;

/** The full ≥1280 scene (five distinct phrase slots) driven by a mouse — decided by capability, not project name. */
export const isFullDesktop = (info: TestInfo) => width(info) >= 1280 && !info.project.use.hasTouch;

/**
 * A mouse whose movement reaches the page as pointer events — what the parallax tests drive. Phones have none. The
 * Chromium and WebKit phone profiles say so with isMobile; Firefox cannot emulate isMobile, and its touch emulation
 * (hasTouch) is Gecko's responsive-design touch simulation, in which a mouse dispatches no pointer events at all
 * (PointerEventHandler::DispatchPointerFromMouseOrTouch returns early when TouchEventsOverride is Enabled and the
 * page is in the RDM pane; Playwright sets both). So firefox-390 is a touch-only phone like the other two.
 */
export const hasMousePointer = (info: TestInfo) => {
  const { isMobile, hasTouch, browserName, defaultBrowserType } = info.project.use;
  return !isMobile && !(hasTouch && (browserName ?? defaultBrowserType) === "firefox");
};

/** Wide screens for the empty-margin criterion P1-08 (1920 and 2560). */
export const isWide = (info: TestInfo) => width(info) >= 1920;

/**
 * Mutation checks only: a stylesheet injected right after load (E2E_MUTATION_CSS), to confirm that a test fails when
 * the defect it guards against is put back. Never set in normal runs or CI.
 */
const MUTATION_CSS = process.env.E2E_MUTATION_CSS;

/** Load the homepage and wait until client effects have run (the background stamps data-ambient-motion). */
export async function openHome(page: Page) {
  await page.goto("/");
  if (MUTATION_CSS) await page.addStyleTag({ content: MUTATION_CSS });
  await page.locator("[data-ambient-background][data-ambient-motion]").waitFor({ state: "attached" });
  // the «أنا» pointer is drawn from the live layout after hydration
  await page.locator("[data-speaker-arrow] [data-arrow-line]").waitFor({ state: "attached" });
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
}

/**
 * Resolves once the page has rendered `count` more animation frames. A measurement of what the page draws — the
 * background's canvases and the offset it draws with — waits for this after a pause, because a pause alone does not
 * guarantee that anything was drawn: WebKit in CI rendered no frame in 1.6 s (run 39852571650). Two frames, because
 * the background draws at most every other 60 Hz frame. Not for tests on a frozen clock, whose animation frames run
 * only as page.clock advances.
 */
export async function framesRendered(page: Page, count = 2) {
  await page.evaluate(
    (n) =>
      new Promise<void>((resolve) => {
        let left = n;
        const frame = () => {
          left -= 1;
          if (left <= 0) resolve();
          else requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      }),
    count,
  );
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
