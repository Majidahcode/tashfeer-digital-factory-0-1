import { expect, test, type Page } from "@playwright/test";
import { advance, autoIndex, isFullDesktop, openHome, openHomeFrozen, phraseStates } from "./support";

const STEP = 100;

/** Step the frozen clock and return the times (ms since mount) at which the automatic phrase changed. */
async function recordChanges(page: Page, untilMs: number, from = 0) {
  const changes: Array<{ at: number; index: number }> = [];
  let prev = await autoIndex(page);
  for (let t = from + STEP; t <= untilMs; t += STEP) {
    await advance(page, STEP);
    const cur = await autoIndex(page);
    if (cur !== prev) changes.push({ at: t, index: cur });
    prev = cur;
  }
  return changes;
}

test("P1-10 five phrases; with no pointer input the phrase changes every 5 s ± 0.5 s for ≥ 3 cycles", async ({ page }) => {
  await openHomeFrozen(page);
  await expect(page.locator("[data-phrase-index]")).toHaveCount(5);
  expect(await autoIndex(page)).toBe(0);
  expect((await phraseStates(page))[0]).toBe("revealed:auto");

  const changes = await recordChanges(page, 20_400);
  expect(changes.map((c) => c.index)).toEqual([1, 2, 3, 4]);
  const intervals = changes.map((c, i) => c.at - (i === 0 ? 0 : changes[i - 1]!.at));
  for (const ms of intervals) expect(Math.abs(ms - 5000)).toBeLessThanOrEqual(500);

  // the newly active phrase is the only revealed one; it fades back to a ghost before the next change
  const states = await phraseStates(page);
  expect(states.filter((s) => s.startsWith("revealed"))).toEqual(["revealed:auto"]);
  expect(states[4]).toBe("revealed:auto");
  await advance(page, 4000);
  expect((await phraseStates(page)).every((s) => s === "ghost:-")).toBe(true);
});

test("P1-11 pointer over a phrase reveals it within 400 ms without shifting the automatic schedule", async ({ page }, info) => {
  test.skip(!isFullDesktop(info), "pointer + distinct phrase slots exist on ≥1280 only");
  await openHomeFrozen(page);
  const first = await recordChanges(page, 5_200);
  expect(first).toEqual([{ at: 5000, index: 1 }]);

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
  const next = await recordChanges(page, 10_300, 5_200 + revealedAfter);
  expect(next.length).toBe(1);
  expect(next[0]!.index).toBe(2);
  expect(Math.abs(next[0]!.at - 10_000)).toBeLessThanOrEqual(STEP);
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
        return r.width || r.height ? { key: `${el.tagName}.${el.className}`, x: r.left, y: r.top } : null;
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
