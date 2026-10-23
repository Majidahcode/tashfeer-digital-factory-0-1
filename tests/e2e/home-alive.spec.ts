import { expect, test, type Page } from "@playwright/test";
import { framesRendered, hasMousePointer, openHome } from "./support";

/*
 * Owner's corrections of 2026-10-22 (afternoon): one continuous animated background for the whole page (§8), the
 * steps' tiles powering on (§7 and the 18:29 note), the removed tagline (§3), the simpler header (§6) and the chat's
 * glass (§5). What these assert is measured on the rendered page; the canvases are read back pixel by pixel.
 */

test.beforeEach(async ({ page }) => {
  await openHome(page);
});

/** Mean brightness (0–255) of horizontal thirds of the light canvas: top, middle, bottom of the page. */
async function lightThirds(page: Page) {
  return page.locator("[data-atmosphere-light]").evaluate((c: HTMLCanvasElement) => {
    const BASE = 0.2126 * 3 + 0.7152 * 5 + 0.0722 * 4; // --brand-bg #030504
    const ctx = c.getContext("2d")!;
    const pageH = c.parentElement!.clientHeight;
    const rows = Math.max(3, Math.floor((pageH / c.clientHeight) * c.height));
    const third = Math.floor(rows / 3);
    const out: number[] = [];
    for (let i = 0; i < 3; i++) {
      const { data } = ctx.getImageData(0, i * third, c.width, third);
      let sum = 0;
      // getImageData is un-premultiplied: weigh each pixel's colour by its opacity, over the page's near-black base
      for (let p = 0; p < data.length; p += 4) {
        const a = data[p + 3]! / 255;
        sum += a * (0.2126 * data[p]! + 0.7152 * data[p + 1]! + 0.0722 * data[p + 2]!) + (1 - a) * BASE;
      }
      out.push(sum / (data.length / 4));
    }
    return out;
  });
}

test("§8 one background behind the whole page: page-long, behind every control, never in the way", async ({ page }) => {
  const r = await page.evaluate(() => {
    const root = document.querySelector<HTMLElement>("[data-ambient-background]")!;
    const box = root.getBoundingClientRect();
    const cs = getComputedStyle(root);
    const canvases = [...root.querySelectorAll("canvas")].map((c) => c.getBoundingClientRect().height);
    // what a pointer finds at the centre of each control is the control, never the background
    const probes = ["[data-disclosure-toggle]", "[data-chat-shell] textarea", "[data-feature-card]", "[data-site-header] a"].map((sel) => {
      const el = document.querySelector(sel)!;
      el.scrollIntoView({ block: "center" });
      const b = el.getBoundingClientRect();
      const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
      return { sel, inBackground: Boolean(hit?.closest("[data-ambient-background]")), onControl: Boolean(hit && (hit === el || el.contains(hit) || hit.contains(el))) };
    });
    window.scrollTo(0, 0);
    return {
      count: document.querySelectorAll("[data-ambient-background]").length,
      pageH: document.documentElement.scrollHeight,
      top: box.top + scrollY,
      height: box.height,
      width: box.width,
      vw: document.documentElement.clientWidth,
      position: cs.position,
      pointerEvents: cs.pointerEvents,
      canvases,
      probes,
    };
  });
  expect(r.count, "one shared layer, not one per section").toBe(1);
  expect(r.position).toBe("absolute");
  expect(r.top).toBe(0);
  expect(Math.abs(r.height - r.pageH), "as long as the page").toBeLessThanOrEqual(1);
  expect(Math.abs(r.width - r.vw)).toBeLessThanOrEqual(1);
  expect(r.pointerEvents).toBe("none");
  for (const h of r.canvases) expect(h).toBeGreaterThanOrEqual(r.pageH - 1);
  for (const p of r.probes) {
    expect(p.inBackground, `${p.sel} is reachable`).toBe(false);
    expect(p.onControl, `${p.sel} is what the pointer hits`).toBe(true);
  }
});

test("§8 no black section: the light reaches the top, the middle and the end of the page alike", async ({ page }) => {
  const thirds = await lightThirds(page);
  const max = Math.max(...thirds);
  const min = Math.min(...thirds);
  expect(min, `thirds ${thirds.map((v) => v.toFixed(1)).join(" / ")}`).toBeGreaterThan(0.45 * max);
  expect(min, "never a black band").toBeGreaterThan(4);
  expect(max, "predominantly dark").toBeLessThan(70);
});

test("§8 it keeps moving on its own, with no pointer input", async ({ page }, info) => {
  const read = () =>
    page.locator("[data-atmosphere-sparks]").evaluate((c: HTMLCanvasElement) => {
      const { data } = c.getContext("2d")!.getImageData(0, 0, c.width, Math.min(c.height, 1200));
      let h = 0;
      for (let i = 3; i < data.length; i += 16) h = (h * 31 + data[i]!) >>> 0;
      return h;
    });
  await expect(page.locator("[data-ambient-background]")).toHaveAttribute("data-ambient-motion", "full");
  const a = await read();
  await page.waitForTimeout(700);
  await framesRendered(page); // compare with what has been drawn since the pause (support.ts)
  const b = await read();
  expect(b, `${info.project.name}: the sparks moved`).not.toBe(a);
});

test("§8 the pointer shifts the depth of the field, and never lights up where it is (no cursor halo)", async ({ page }, info) => {
  test.skip(!hasMousePointer(info), "no mouse on the phone profiles (touch keeps the autonomous motion)");
  const vp = page.viewportSize()!;
  // brightness of the light field around a point, relative to the whole visible field
  const local = (x: number, y: number) =>
    page.locator("[data-atmosphere-light]").evaluate(
      (c: HTMLCanvasElement, [px, py]) => {
        const k = c.width / c.clientWidth;
        const ctx = c.getContext("2d")!;
        // un-premultiplied pixels: the light each one adds is its colour × its opacity
        const lum = (d: Uint8ClampedArray) => {
          let s = 0;
          for (let i = 0; i < d.length; i += 4) s += (d[i + 3]! / 255) * (0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!);
          return s / (d.length / 4);
        };
        const r = Math.round(90 * k);
        const near = lum(ctx.getImageData(Math.max(0, Math.round(px! * k) - r), Math.max(0, Math.round((py! + scrollY) * k) - r), 2 * r, 2 * r).data);
        const all = lum(ctx.getImageData(0, Math.round(scrollY * k), c.width, Math.round(innerHeight * k)).data);
        return near / Math.max(1e-6, all);
      },
      [x, y] as const,
    );
  const A = { x: Math.round(vp.width * 0.2), y: Math.round(vp.height * 0.55) };
  const B = { x: Math.round(vp.width * 0.8), y: Math.round(vp.height * 0.55) };
  await page.mouse.move(B.x, B.y, { steps: 6 });
  await page.waitForTimeout(1_600);
  await framesRendered(page); // measure what has been drawn since the pause (support.ts)
  const atAWhenAway = await local(A.x, A.y);
  const offsetAway = await page.locator("[data-ambient-background]").getAttribute("data-parallax");
  await page.mouse.move(A.x, A.y, { steps: 6 });
  await page.waitForTimeout(1_600);
  await framesRendered(page);
  const atAWhenThere = await local(A.x, A.y);
  const offsetThere = await page.locator("[data-ambient-background]").getAttribute("data-parallax");
  expect(offsetThere, "the field shifted with the pointer").not.toBe(offsetAway);
  // a halo would make the spot under the cursor markedly brighter than the field around it
  expect(atAWhenThere - atAWhenAway, `relative brightness under the cursor: ${atAWhenAway.toFixed(3)} → ${atAWhenThere.toFixed(3)}`).toBeLessThan(0.12);
});

test("§7 the tiles power on from the bottom, staggered, then repeat every 10 s — the number readable throughout", async ({
  page,
}) => {
  // owner's correction of 2026-10-23: the power-on repeats every 10 s (it used to play once)
  const cards = page.locator("[data-feature-card]");
  const steps = page.locator("[data-scene-part=features]");
  // not yet seen (below the fold, or before the observer has run): dark, the number dimmed but legible — read in one
  // go, so the state cannot change halfway through
  const before = await cards.first().evaluate((el) =>
    el.getAttribute("data-power")
      ? null
      : {
          edge: getComputedStyle(el.querySelector("[class*=tile]")!, "::after").opacity,
          glow: getComputedStyle(el.querySelector("[class*=lit]")!, "::before").opacity,
          num: getComputedStyle(el.querySelector("[class*=num]")!).opacity,
        },
  );
  if (before) {
    expect(before.edge).toBe("0");
    expect(before.glow).toBe("0");
    expect(Number(before.num)).toBeGreaterThanOrEqual(0.6);
  }
  await steps.evaluate((el) => el.scrollIntoView({ block: "center" }));
  await expect(cards.last()).toHaveAttribute("data-power", "on");
  const r = await page.evaluate(() => {
    const items = [...document.querySelectorAll<HTMLElement>("[data-feature-card]")];
    const ty = (t: unknown) => (typeof t === "string" && t !== "none" ? Number(/translateY\((-?[\d.]+)%\)/.exec(t)?.[1] ?? 0) : 0);
    return items.map((el) => {
      const anims = el.getAnimations({ subtree: true }) as CSSAnimation[];
      const desc = (name: string) => {
        const a = anims.find((x) => x.animationName.endsWith(name));
        if (!a) return null;
        const effect = a.effect as KeyframeEffect;
        const frames = effect.getKeyframes();
        const timing = effect.getTiming();
        const values = (prop: string) => frames.filter((f) => prop in f).map((f) => f[prop]);
        const ys = values("transform").map(ty);
        return {
          fromY: ys[0] ?? 0,
          toY: ys.at(-1) ?? 0,
          lowestY: Math.max(0, ...ys), // how far below its rest the light starts
          opacity: values("opacity").map(Number),
          iterations: timing.iterations,
          duration: timing.duration,
          delay: timing.delay,
        };
      };
      return {
        delay: el.style.getPropertyValue("--power-delay"),
        rise: desc("_rise"),
        sweep: desc("_sweep"),
        accent: desc("_accent"),
        cycle: { edge: desc("_cycle-edge"), glow: desc("_cycle-glow"), band: desc("_cycle-band"), num: desc("_cycle-num") },
      };
    });
  });
  for (const c of r) {
    // the first power-on: the inner light rises from below the tile's bottom edge to rest; the band sweeps from the
    // bottom to the top; played once
    expect(c.rise!.fromY).toBeGreaterThan(0);
    expect(c.rise!.toY).toBe(0);
    expect(c.sweep!.fromY).toBeGreaterThan(0);
    expect(c.sweep!.toY).toBeLessThan(0);
    expect(c.rise!.iterations).toBe(1);
    expect(c.sweep!.iterations).toBe(1);
    // then the tile itself repeats it every 10 s, from one cycle after its first power-on (so the stagger is kept):
    // it dims near its dark state, the light rises from below again and the band sweeps up, and it rests again
    const startsAt = Number.parseFloat(c.delay) + 10_000;
    for (const layer of Object.values(c.cycle)) {
      expect(layer, "every layer of the tile repeats").not.toBeNull();
      expect(layer!.duration).toBe(10_000);
      expect(layer!.iterations).toBe(Infinity);
      expect(layer!.delay).toBe(startsAt);
    }
    type Layer = NonNullable<typeof c.rise>;
    const { edge, glow, band, num } = c.cycle as { edge: Layer; glow: Layer; band: Layer; num: Layer };
    expect(edge.opacity[0]).toBe(1);
    expect(edge.opacity.at(-1)).toBe(1);
    expect(Math.min(...edge.opacity), "the lit rim dims").toBeLessThanOrEqual(0.2);
    expect(glow.opacity[0]).toBe(1);
    expect(glow.opacity.at(-1)).toBe(1);
    expect(Math.min(...glow.opacity), "the inner light goes dark").toBeLessThanOrEqual(0.1);
    expect(band.opacity[0]).toBe(0);
    expect(band.opacity.at(-1)).toBe(0);
    expect(Math.max(...band.opacity), "the band of light passes once per cycle").toBe(1);
    // a rise from below the bottom edge back to rest, and a sweep from the bottom to the top, as in the first power-on
    expect(glow.lowestY).toBeGreaterThan(0);
    expect(glow.toY).toBe(0);
    expect(band.fromY).toBeGreaterThan(0);
    expect(band.toY).toBeLessThan(0);
    // the number stays clearly readable throughout
    expect(Math.min(...num.opacity)).toBeGreaterThanOrEqual(0.6);
    // the label's accent line is lit once and stays
    expect(c.accent!.iterations).toBe(1);
  }
  // staggered: steps that light together do not all start at the same moment
  expect(new Set(r.map((c) => c.delay)).size).toBeGreaterThan(1);

  // settled after the first power-on: lit, steady, number at full strength (wait for the power-on itself, not a fixed
  // time — the repeats never finish, so only the one-shot animations are awaited)
  const settled = await cards.evaluateAll((els) =>
    Promise.all(
      els.flatMap((el) =>
        el
          .getAnimations({ subtree: true })
          .filter((a) => a.effect?.getTiming().iterations !== Infinity)
          .map((a) => a.finished.catch(() => null)),
      ),
    ).then(() =>
      els.map((el) => ({
        edge: getComputedStyle(el.querySelector("[class*=tile]")!, "::after").opacity,
        glow: getComputedStyle(el.querySelector("[class*=lit]")!, "::before").opacity,
        sweep: getComputedStyle(el.querySelector("[class*=lit]")!, "::after").opacity,
        num: getComputedStyle(el.querySelector("[class*=num]")!).opacity,
        // the repeats are scheduled, not yet playing: nothing moves between two cycles
        waiting: el
          .getAnimations({ subtree: true })
          .filter((a) => a.effect?.getTiming().iterations === Infinity)
          .every((a) => Number(a.currentTime) < Number(a.effect!.getTiming().delay)),
      })),
    ),
  );
  for (const a of settled) expect(a).toEqual({ edge: "1", glow: "1", sweep: "0", num: "1", waiting: true });

  // the repeat as the browser renders it: the first tile's state 0.8 s into its first and its second repeat (dark,
  // number still readable) and 3 s in (rest again) — read from the running animations, frozen at those times
  const states = await cards.first().evaluate((el) => {
    const anims = el.getAnimations({ subtree: true }).filter((a) => a.effect?.getTiming().iterations === Infinity);
    const start = Number(anims[0]!.effect!.getTiming().delay);
    const at = (ms: number) => {
      for (const a of anims) {
        a.pause();
        a.currentTime = start + ms;
      }
      return {
        edge: Number(getComputedStyle(el.querySelector("[class*=tile]")!, "::after").opacity),
        glow: Number(getComputedStyle(el.querySelector("[class*=lit]")!, "::before").opacity),
        num: Number(getComputedStyle(el.querySelector("[class*=num]")!).opacity),
      };
    };
    const out = { first: at(800), firstLit: at(3000), second: at(10_800), secondLit: at(13_000) };
    for (const a of anims) a.play();
    return out;
  });
  for (const dark of [states.first, states.second]) {
    expect(dark.edge).toBeLessThanOrEqual(0.2);
    expect(dark.glow).toBeLessThanOrEqual(0.1);
    expect(dark.num).toBeGreaterThanOrEqual(0.6);
  }
  for (const lit of [states.firstLit, states.secondLit]) expect(lit).toEqual({ edge: 1, glow: 1, num: 1 });
});

test("§7 a tap on a touch screen briefly brightens the tapped tile", async ({ page }, info) => {
  test.skip(!info.project.use.hasTouch, "touch profiles only");
  const card = page.locator("[data-feature-card]").nth(2);
  await card.scrollIntoViewIfNeeded();
  // record the card's data-pulse changes as they happen (the pulse lasts under a second)
  await card.evaluate((el) => {
    const log: string[] = [];
    (window as unknown as { pulseLog: string[] }).pulseLog = log;
    new MutationObserver(() => log.push(el.hasAttribute("data-pulse") ? "on" : "off")).observe(el, {
      attributes: true,
      attributeFilter: ["data-pulse"],
    });
  });
  const b = (await card.locator("[class*=tile]").boundingBox())!;
  await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
  await expect(card).not.toHaveAttribute("data-pulse", /.*/, { timeout: 3_000 });
  const log = await page.evaluate(() => (window as unknown as { pulseLog: string[] }).pulseLog);
  expect(log, "brightened, then back to rest").toContain("on");
  expect(log.at(-1)).toBe("off");
});

test("§3 / §6 the redundant tagline is gone, and the header is the mark and «تشفير» only", async ({ page }) => {
  await expect(page.locator("body")).not.toContainText("منتجك ينبني قدامك في مصنع تشفير");
  const header = page.locator("[data-site-header]");
  await expect(header.locator("[data-brand]")).toHaveText("تشفير");
  await expect(header).not.toContainText("مصنع التحول الرقمي");
});

test("§5 the chat's surfaces are translucent green glass, not grey fills", async ({ page }) => {
  const r = await page.evaluate(() => {
    const parse = (s: string) => {
      // computed colours are rgb()/rgba() or color(srgb r g b / a)
      const m = /color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)(?: \/ ([\d.]+))?\)/.exec(s);
      if (m) return { r: Number(m[1]) * 255, g: Number(m[2]) * 255, b: Number(m[3]) * 255, a: m[4] ? Number(m[4]) : 1 };
      const n = /rgba?\(([\d.]+), ([\d.]+), ([\d.]+)(?:, ([\d.]+))?\)/.exec(s);
      return n ? { r: Number(n[1]), g: Number(n[2]), b: Number(n[3]), a: n[4] ? Number(n[4]) : 1 } : null;
    };
    const chat = "[data-chat-shell]";
    const surfaces = {
      welcome: document.querySelector(`${chat} [role=log] p`)!,
      upload: document.querySelector(`${chat} [class*=tools] button`)!,
      input: document.querySelector(`${chat} textarea`)!.parentElement!,
    };
    return Object.fromEntries(Object.entries(surfaces).map(([k, el]) => [k, parse(getComputedStyle(el).backgroundColor)]));
  });
  for (const [name, c] of Object.entries(r)) {
    expect(c, name).not.toBeNull();
    expect(c!.a, `${name} is translucent`).toBeLessThan(0.7);
    // green, not grey: green is the strongest channel, and the colour is clearly saturated (the silver-grey fills
    // these replaced, rgb(201 206 202), have a saturation of 0.02)
    const max = Math.max(c!.r, c!.g, c!.b);
    const min = Math.min(c!.r, c!.g, c!.b);
    expect(c!.g, `${name} is green-tinted`).toBe(max);
    expect((max - min) / max, `${name} is not grey`).toBeGreaterThan(0.3);
  }
});
