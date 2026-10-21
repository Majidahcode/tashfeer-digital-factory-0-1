import { expect, test, type Page } from "@playwright/test";
import { advance, autoIndex, isFullDesktop, openHome, openHomeFrozen, phraseStates } from "./support";

const STEP = 50;
const TOLERANCE = 500;

/**
 * With the clock frozen since before load, the cycle's timers start at t = 0. From `now`, jump to
 * `expected − 0.5 s` and assert no change yet, then step 50 ms until the automatic phrase changes; it must by
 * `expected + 0.5 s`. Returns the time (ms since mount) the change was observed — exact to one step.
 * (Crawling the whole timeline in fine steps cost ~50 ms per step and timed out under parallel workers.)
 */
async function nextChange(page: Page, now: number, expected: number) {
  const before = await autoIndex(page);
  let t = expected - TOLERANCE;
  await advance(page, t - now);
  expect(await autoIndex(page), `no change before ${t} ms`).toBe(before);
  while (t < expected + TOLERANCE && (await autoIndex(page)) === before) {
    await advance(page, STEP);
    t += STEP;
  }
  expect(await autoIndex(page), `changed by ${expected + TOLERANCE} ms`).not.toBe(before);
  return t;
}

test("P1-10 five phrases; with no pointer input the phrase changes every 5 s ± 0.5 s for ≥ 3 cycles", async ({ page }) => {
  test.setTimeout(60_000);
  await openHomeFrozen(page);
  await expect(page.locator("[data-phrase-index]")).toHaveCount(5);
  expect(await autoIndex(page)).toBe(0);
  expect((await phraseStates(page))[0]).toBe("revealed:auto");

  let now = 0;
  const changes: number[] = [];
  for (let k = 1; k <= 4; k++) {
    now = await nextChange(page, now, k * 5000);
    changes.push(now);
    expect(await autoIndex(page)).toBe(k);
  }
  const intervals = changes.map((at, i) => at - (i === 0 ? 0 : changes[i - 1]!));
  for (const ms of intervals) expect(Math.abs(ms - 5000)).toBeLessThanOrEqual(TOLERANCE);

  // the newly active phrase is the only revealed one; it fades back to a ghost before the next change
  const states = await phraseStates(page);
  expect(states.filter((s) => s.startsWith("revealed"))).toEqual(["revealed:auto"]);
  expect(states[4]).toBe("revealed:auto");
  await advance(page, 4000);
  expect((await phraseStates(page)).every((s) => s === "ghost:-")).toBe(true);
});

test("P1-11 pointer over a phrase reveals it within 400 ms without shifting the automatic schedule", async ({ page }, info) => {
  test.skip(!isFullDesktop(info), "pointer + distinct phrase slots exist on ≥1280 only");
  test.setTimeout(60_000);
  await openHomeFrozen(page);
  let now = await nextChange(page, 0, 5_000);
  expect(Math.abs(now - 5_000)).toBeLessThanOrEqual(STEP);
  expect(await autoIndex(page)).toBe(1);

  // hover phrase 3 (neither the active one nor the next one)
  const target = page.locator('[data-phrase-index="3"]');
  const box = (await target.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  let revealedAfter = -1;
  for (let t = 20; t <= 400; t += 20) {
    await advance(page, 20);
    if ((await target.getAttribute("data-reveal-source")) === "pointer") {
      revealedAfter = t;
      break;
    }
  }
  expect(revealedAfter).toBeGreaterThan(0);
  expect(revealedAfter).toBeLessThanOrEqual(400);
  now += revealedAfter;
  await expect(target).toHaveAttribute("data-state", "revealed");
  // the visible fade starts at that moment (CSS transitions run on the compositor clock, not the fake one)
  const fades = await target.evaluate((el) =>
    el
      .getAnimations()
      .map((a) => (a instanceof CSSTransition ? `${a.transitionProperty} ${String(a.effect?.getTiming().duration)}` : ""))
      .filter(Boolean),
  );
  expect(fades).toContain("opacity 900");

  // the next automatic change still lands on the original 5 s grid (10 s), while the pointer stays put
  now = await nextChange(page, now, 10_000);
  expect(Math.abs(now - 10_000)).toBeLessThanOrEqual(STEP);
  expect(await autoIndex(page)).toBe(2);
  await expect(target).toHaveAttribute("data-reveal-source", "pointer");

  // leaving: the phrase is held briefly, then fades back to a ghost
  await page.mouse.move(2, Math.round((await page.viewportSize())!.height / 2));
  await advance(page, 400);
  await expect(target).toHaveAttribute("data-reveal-source", "pointer");
  await advance(page, 1_200);
  await expect(target).toHaveAttribute("data-state", "ghost");
});

test("P1-12 pointer movement shifts only the parallax layers, by at most 12 px from rest", async ({ page }, info) => {
  test.skip(Boolean(info.project.use.isMobile), "no mouse pointer on the touch profile");
  await openHome(page);
  const snapshot = () =>
    page.evaluate(() =>
      [...document.querySelectorAll("body *")].map((el) => {
        if (el.closest("[data-phrase-index]")) return null; // phrases fade on their own clock; their layer is measured
        const r = el.getBoundingClientRect();
        const layer = Boolean(el.closest("[data-parallax-layer]"));
        return r.width || r.height ? { key: `${el.tagName}.${el.className}`, x: r.left, y: r.top, layer } : null;
      }),
    );
  const vp = page.viewportSize()!;
  const rest = await snapshot();
  const corners = [
    [2, 2],
    [vp.width - 3, vp.height - 3],
  ] as const;
  let glowMoved = 0;
  for (const [x, y] of corners) {
    await page.mouse.move(x, y, { steps: 8 });
    await page.waitForTimeout(1_500); // the smoothed pointer settles (lerp 0.08 per frame)
    const now = await snapshot();
    expect(now.length).toBe(rest.length);
    const worst = now.reduce(
      (acc, s, i) => {
        const r = rest[i];
        if (!s || !r) return acc;
        const d = Math.max(Math.abs(s.x - r.x), Math.abs(s.y - r.y));
        return d > acc.d ? { d, key: s.key } : acc;
      },
      { d: 0, key: "" },
    );
    expect(worst.d, worst.key).toBeLessThanOrEqual(12);
    // everything outside the two parallax layers (glow, phrases) stays exactly where it was
    const contentMoved = now.filter((s, i) => {
      const r = rest[i];
      return s && r && !s.layer && Math.max(Math.abs(s.x - r.x), Math.abs(s.y - r.y)) > 0.5;
    });
    expect(contentMoved.map((s) => s!.key)).toEqual([]);
    const glowIdx = await page.evaluate(() =>
      [...document.querySelectorAll("body *")].indexOf(document.querySelector('[data-parallax-layer="glow"]')!),
    );
    const g = now[glowIdx];
    const g0 = rest[glowIdx];
    if (g && g0) glowMoved = Math.max(glowMoved, Math.abs(g.x - g0.x), Math.abs(g.y - g0.y));
  }
  expect(glowMoved, "the pointer reached the page (parallax is live)").toBeGreaterThan(1);
});

test("P1-13 on touch, tapping the phrase reveals one (no hover dependency)", async ({ page }, info) => {
  test.skip(!info.project.use.hasTouch, "touch profiles only");
  await openHomeFrozen(page);
  await advance(page, 4_000); // the automatic phrase has faded: nothing is revealed
  expect((await phraseStates(page)).every((s) => s === "ghost:-")).toBe(true);

  const layer = (await page.locator("[data-ambient-phrases]").boundingBox())!;
  await page.touchscreen.tap(layer.x + layer.width / 2, layer.y + layer.height / 2);
  await advance(page, 50);
  const states = await phraseStates(page);
  expect(states.filter((s) => s === "revealed:touch")).toHaveLength(1);
  expect(states.indexOf("revealed:touch")).toBe(1); // the phrase after the current one (0)

  await advance(page, 2_700);
  expect((await phraseStates(page)).filter((s) => s.endsWith(":touch"))).toHaveLength(0);
});

test.describe("P1-14 prefers-reduced-motion", () => {
  test.use({ contextOptions: { reducedMotion: "reduce" } });

  test("no parallax, fade-only phrases, no sheen, complete content", async ({ page }, info) => {
    await openHome(page);
    await expect(page.locator("[data-ambient-background]")).toHaveAttribute("data-ambient-motion", "reduced");

    const layers = () =>
      page.locator("[data-parallax-layer]").evaluateAll((els) =>
        els.map((el) => {
          const r = el.getBoundingClientRect();
          return [Math.round(r.left * 10) / 10, Math.round(r.top * 10) / 10];
        }),
      );
    const before = await layers();
    if (!info.project.use.isMobile) {
      const vp = page.viewportSize()!;
      await page.mouse.move(3, 3, { steps: 6 });
      await page.waitForTimeout(500);
      await page.mouse.move(vp.width - 3, vp.height - 3, { steps: 6 });
      await page.waitForTimeout(800);
    }
    expect(await layers()).toEqual(before);

    const phrase = await page.locator("[data-phrase-index]").evaluateAll((els) =>
      els.map((el) => {
        const cs = getComputedStyle(el);
        return `${cs.transform}|${cs.transitionProperty}|${cs.filter}`;
      }),
    );
    expect(new Set(phrase)).toEqual(new Set(["none|opacity|none"]));
    const anim = await page.locator("[data-gradient-text]").evaluateAll((els) => els.map((el) => getComputedStyle(el).animationName));
    expect(new Set(anim)).toEqual(new Set(["none"]));

    await expect(page.locator("h1")).toContainText("أبني منتجك قدام عينك");
    await expect(page.locator("[data-feature-card]")).toHaveCount(5);
    await expect(page.locator("[data-phrase-index]")).toHaveCount(5);
    await expect(page.locator("[data-chat-shell]")).toBeVisible();
    await expect(page.locator("[data-tashfeer]")).toBeVisible();
  });

  test("the phrase cycle still runs (opacity only)", async ({ page }) => {
    await openHomeFrozen(page);
    await advance(page, 5_100);
    expect(await autoIndex(page)).toBe(1);
    expect((await phraseStates(page))[1]).toBe("revealed:auto");
  });
});
