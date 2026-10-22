import { expect, test, type Page } from "@playwright/test";
import { openHome } from "./support";

/*
 * TEMPORARY — a CI diagnostic for PR #1, removed with the fix it informs. Defined only in the cross-engine job
 * (E2E_ENGINES=all) and run on WebKit only (webkit-1440 is the control).
 *
 * The question: on webkit-390 the «كيف نبدأ؟» paragraphs stay visible for 2 s after the panel closes (aria-expanded is
 * already "false"); on webkit-1440, Chromium and Firefox they hide. Each variant opens the panel, closes it, samples
 * the panel on timers (not animation frames, which would themselves drive rendering), then probes. The report is
 * this test's failure message: the only output of a CI run that the development session can read back.
 */

const PANEL_CLOSED = "[data-disclosure]:not([data-open]) > [data-disclosure-panel]";

type Close = (page: Page) => Promise<void>;

const toggle = (page: Page) => page.locator("[data-disclosure-toggle]");
const domClick = (page: Page) => toggle(page).evaluate((el: HTMLElement) => el.click());
const focusEnter: Close = async (page) => {
  await toggle(page).focus();
  await page.keyboard.press("Enter");
};

async function runVariant(page: Page, close: Close) {
  await domClick(page); // open the way the real test does: no scrolling
  await expect(page.locator("[data-disclosure-panel] p").first()).toBeVisible();
  await page.waitForTimeout(1_000); // opened and settled
  await page.evaluate(() => {
    const w = window as unknown as { diagSample: (label: string) => string; diagLog: string[] };
    const root = document.querySelector<HTMLElement>("[data-disclosure]")!;
    const panel = root.querySelector<HTMLElement>("[data-disclosure-panel]")!;
    const p = panel.querySelector("p")!;
    const sample = (label: string) => {
      const anims = panel.getAnimations().map((a) => {
        const ct = a.effect?.getComputedTiming();
        const prop = (a as CSSTransition).transitionProperty ?? "?";
        const progress = ct?.progress == null ? "-" : Number(ct.progress).toFixed(2);
        return `${prop}:${a.playState}${a.pending ? "(pending)" : ""} t=${Math.round(Number(a.currentTime ?? Number.NaN))} d=${String(ct?.delay)}+${String(ct?.duration)} p=${progress}`;
      });
      const cs = getComputedStyle(panel);
      return [
        label,
        `tl=${Math.round(Number(document.timeline.currentTime))}`,
        root.hasAttribute("data-open") ? "OPEN" : "closed",
        `aria=${root.querySelector("[data-disclosure-toggle]")!.getAttribute("aria-expanded")}`,
        `vis(panel)=${cs.visibility}`,
        `vis(p)=${getComputedStyle(p).visibility}`,
        `rows=${cs.gridTemplateRows}`,
        `h=${Math.round(panel.getBoundingClientRect().height)}`,
        `y=${Math.round(scrollY)}`,
        `[${anims.join(" | ")}]`,
      ].join(" ");
    };
    w.diagSample = sample;
    w.diagLog = [sample("open")];
    root.querySelector("[data-disclosure-toggle]")!.addEventListener(
      "click",
      () => {
        const t0 = performance.now();
        for (const ms of [0, 120, 300, 480, 700, 1000, 1500, 2100])
          setTimeout(() => w.diagLog.push(w.diagSample(`+${Math.round(performance.now() - t0)}ms`)), ms);
      },
      { once: true },
    );
  });
  await close(page);
  await page.waitForTimeout(2_400);
  return page.evaluate(async () => {
    const w = window as unknown as { diagSample: (label: string) => string; diagLog: string[] };
    const frames = await new Promise<number>((resolve) => {
      let n = 0;
      const t0 = performance.now();
      const frame = () => {
        n++;
        if (performance.now() - t0 < 500) requestAnimationFrame(frame);
        else resolve(n);
      };
      requestAnimationFrame(frame);
    });
    w.diagLog.push(`${w.diagSample("after 500 ms of rAF")} frames/500ms=${frames}`);
    // another animation resolution, from a no-op animation on another element
    document.body.animate([{ opacity: 1 }, { opacity: 1 }], 60);
    await new Promise((r) => setTimeout(r, 250));
    w.diagLog.push(w.diagSample("after a no-op animation elsewhere"));
    const running = document.getAnimations().filter((a) => a.playState === "running").length;
    const copy = getComputedStyle(document.querySelector("[data-scene-part=copy]")!).display;
    w.diagLog.push(`document animations running=${running}, copy display=${copy}`);
    return w.diagLog;
  });
}

if (process.env.E2E_ENGINES === "all") {
  test.describe("diagnostic: WebKit disclosure closing", () => {
    test.describe.configure({ retries: 0 });
    test.skip(({ browserName }) => browserName !== "webkit", "WebKit only");

    test("what the panel does after it closes", async ({ page }) => {
      test.setTimeout(150_000);
      const variants: Array<[string, string | null, Close]> = [
        ["A focus() + Enter (as the real test)", null, focusEnter],
        [
          "B toggle scrolled into view first, then focus() + Enter",
          null,
          async (p) => {
            await toggle(p).evaluate((el) => el.scrollIntoView({ block: "center" }));
            await p.waitForTimeout(400);
            await focusEnter(p);
          },
        ],
        ["C DOM click() (no focus, no scroll)", null, domClick],
        [
          "F focus(), then DOM click()",
          null,
          async (p) => {
            await toggle(p).focus();
            await domClick(p);
          },
        ],
        [
          "D candidate: visibility 420ms linear (no delay)",
          `${PANEL_CLOSED} { transition: grid-template-rows 420ms var(--ease-out), visibility 420ms linear !important; }`,
          focusEnter,
        ],
        [
          "E candidate: visibility 420ms step-end",
          `${PANEL_CLOSED} { transition: grid-template-rows 420ms var(--ease-out), visibility 420ms step-end !important; }`,
          focusEnter,
        ],
      ];
      const report: string[] = [];
      for (const [name, css, close] of variants) {
        await openHome(page);
        if (css) await page.addStyleTag({ content: css });
        report.push(`## ${name}`, ...(await runVariant(page, close)));
      }
      throw new Error(`diagnostic report\n${report.join("\n")}`);
    });
  });
}
