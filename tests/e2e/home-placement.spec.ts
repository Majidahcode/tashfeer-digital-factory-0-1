import { expect, test } from "@playwright/test";
import manifest from "@/generated/asset-manifest.json";
import { advance, hasMousePointer, openHome, openHomeFrozen, restingPhrases } from "./support";

/*
 * Owner's corrections of 2026-10-23: the seated customer on large screens (under the headline and «كيف نبدأ؟», larger,
 * his face uncovered), the ambient phrases spread over the whole page, and the Neon scrollbar.
 */

const RING_SRC = manifest.assets["portal-ring"].src;
const width = (w: number | undefined) => w ?? 0;

/** What a phrase must keep clear of — P1-16's list. */
const GUARDED = [
  "h1[data-hero-headline]",
  "[data-chat-shell]",
  "[data-feature-card]",
  "[data-site-header]",
  "button",
  "a[href]:not(.skip-link)",
  "textarea",
  "[data-scene-part='copy'] p",
  "[data-disclosure-toggle]",
  "[data-tashfeer]",
  "[data-scene-part='customer'] img",
];

test("the phrases appear in different places across the page, each clear of the content and of the ring's glow", async ({
  page,
}, info) => {
  test.setTimeout(90_000);
  await openHomeFrozen(page);
  await expect(page.locator("[data-ambient-phrases]")).toHaveAttribute("data-placement", "ready");
  const vw = width(info.project.use.viewport?.width);
  const seen: Array<{ i: number; slot: string; top: number; bottom: number }> = [];
  for (let k = 0; k < 9; k++) {
    if (k) await advance(page, 5_000);
    const shown = (await restingPhrases(page)).filter((p) => p.state === "revealed");
    expect(shown, `appearance ${k}: one phrase`).toHaveLength(1);
    const p = shown[0]!;
    expect(p.i).toBe(k % 3);
    const problems = await page.evaluate(
      async ({ p, guarded, ringSrc }) => {
        const out: string[] = [];
        // P1-16's air around it: 10 px across, 14 px above and below (at rest)
        for (const sel of guarded)
          for (const el of document.querySelectorAll(sel)) {
            if (getComputedStyle(el).visibility === "hidden") continue;
            const t = el.getBoundingClientRect();
            if (!t.width || !t.height) continue;
            if (p.left - 10 < t.right && p.right + 10 > t.left && p.top - 14 < t.bottom && p.bottom + 14 > t.top) out.push(sel);
          }
        // under the ring: never in its glow (> 30 % opaque), sampled across its box
        const ring = document.querySelector<HTMLImageElement>("img[data-portal-ring]")!;
        const box = ring.getBoundingClientRect();
        const img = new Image();
        img.src = ringSrc;
        await img.decode();
        const c = document.createElement("canvas");
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        const ctx = c.getContext("2d", { willReadFrequently: true })!;
        ctx.drawImage(img, 0, 0);
        const { data } = ctx.getImageData(0, 0, c.width, c.height);
        let worst = 0;
        for (let fx = 0; fx <= 1; fx += 0.125)
          for (let fy = 0; fy <= 1; fy += 0.25) {
            const x = p.left + 2 + fx * (p.right - p.left - 4);
            const y = p.top + 2 + fy * (p.bottom - p.top - 4);
            const u = Math.floor(((x - box.left) / box.width) * c.width);
            const v = Math.floor(((y - box.top) / box.height) * c.height);
            if (u >= 0 && v >= 0 && u < c.width && v < c.height) worst = Math.max(worst, data[(v * c.width + u) * 4 + 3]! / 255);
          }
        if (worst > 0.3) out.push(`ring alpha ${worst.toFixed(2)}`);
        if (p.left < 0 || p.right > innerWidth) out.push("outside the screen");
        return out;
      },
      { p, guarded: GUARDED, ringSrc: RING_SRC },
    );
    expect(problems, `appearance ${k} (phrase ${p.i} at ${p.slot})`).toEqual([]);
    seen.push({ i: p.i, slot: p.slot, top: p.top, bottom: p.bottom });
  }

  // somewhere new each time: never twice running in one place; every phrase in more than one place
  for (let k = 1; k < seen.length; k++) expect(seen[k]!.slot, `appearance ${k} moved`).not.toBe(seen[k - 1]!.slot);
  for (const i of [0, 1, 2]) {
    expect(new Set(seen.filter((s) => s.i === i).map((s) => s.slot)).size, `phrase ${i} moves`).toBeGreaterThan(1);
  }
  // over the page's height, not only near its end
  const sceneH = await page.locator("[data-scene]").evaluate((el) => el.getBoundingClientRect().height);
  const tops = seen.map((s) => s.top);
  expect(Math.max(...tops) - Math.min(...tops), "vertical spread").toBeGreaterThan(0.25 * sceneH);
  // on large screens, in the composition's own free space: never a footer strip under its lowest part (the portal's
  // band, the characters, the steps, the copy — AmbientPhrases' FLOOR)
  if (vw >= 1280) {
    const floor = await page.evaluate(() =>
      Math.max(
        ...[
          ...document.querySelectorAll(
            "[data-tashfeer], [data-seated-customer], [data-portal], [data-feature-card], [data-copy-text]",
          ),
        ].map((el) => el.getBoundingClientRect().bottom),
      ),
    );
    for (const s of seen) expect(s.bottom, `${s.slot} above the composition's floor`).toBeLessThanOrEqual(floor);
  }
});

test("large screens: the customer sits under the headline and «كيف نبدأ؟», centred in their column, large, face uncovered", async ({
  page,
}, info) => {
  test.skip(width(info.project.use.viewport?.width) < 1280, "the large-screen composition (≥1280); narrower ones are unchanged");
  await openHome(page);
  await page.locator("[data-seated-customer]").evaluate((img: HTMLImageElement) => img.decode());
  const m = await page.evaluate(() => {
    const plain = (r: DOMRect) => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height });
    const box = (sel: string) => plain(document.querySelector(sel)!.getBoundingClientRect());
    const img = document.querySelector<HTMLImageElement>("[data-seated-customer]")!;
    const r = plain(img.getBoundingClientRect());
    // the face: the head in the owner's image (x 28.5–44.8 %, y 1.8–27.9 %; the image is not mirrored here)
    const face = {
      left: r.left + 0.285 * r.width,
      right: r.left + 0.448 * r.width,
      top: r.top + 0.018 * r.height,
      bottom: r.top + 0.279 * r.height,
    };
    // whatever is drawn on top of it, sampled across the face
    const covered: string[] = [];
    for (let fx = 0.1; fx < 1; fx += 0.2)
      for (let fy = 0.1; fy < 1; fy += 0.2) {
        const top = document.elementFromPoint(face.left + fx * (face.right - face.left), face.top + fy * (face.bottom - face.top));
        if (top && top !== img) covered.push(`${top.tagName}.${String(top.className)}`.slice(0, 48));
      }
    return {
      r,
      face,
      natural: img.naturalWidth / img.naturalHeight,
      transform: getComputedStyle(img).transform,
      column: box("[data-scene-part=copy]"),
      toggle: box("[data-disclosure-toggle]"),
      mic: box("[data-scene-part=customer] button"),
      robot: box("[data-tashfeer]"),
      portal: box("[data-portal]"),
      covered: [...new Set(covered)],
      vh: innerHeight,
    };
  });
  expect(m.transform).toBe("none");
  // beneath the headline and «كيف نبدأ؟», in the same column, centred under them — not at the screen's edge
  expect(m.r.top).toBeGreaterThanOrEqual(m.toggle.bottom + 12);
  expect(Math.abs((m.r.left + m.r.right) / 2 - (m.column.left + m.column.right) / 2)).toBeLessThanOrEqual(4);
  expect(m.r.left).toBeGreaterThanOrEqual(16);
  // large, in the image's own proportions: as wide as the copy column allows, ≥ 28 % of the screen's height (30 % before
  // the owner's wider reference portal, which leaves the copy column at its minimum width at 1280 and 1440)
  expect(m.r.height).toBeGreaterThanOrEqual(0.28 * m.vh);
  expect(m.r.width).toBeGreaterThanOrEqual(Math.min(m.column.width, 0.6 * m.portal.height) - 1);
  expect(Math.abs(m.r.width / m.r.height - m.natural)).toBeLessThan(0.01);
  // the whole face shows: nothing over it, the voice pill below it, clear of Tashfeer and the portal
  expect(m.covered).toEqual([]);
  const meets = (a: typeof m.face, b: typeof m.mic) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  expect(meets(m.face, m.mic), "the voice pill is clear of the face").toBe(false);
  expect(m.mic.top).toBeGreaterThan(m.face.bottom);
  expect(meets(m.r, m.robot)).toBe(false);
  expect(meets(m.r, m.portal)).toBe(false);
  expect(m.r.bottom).toBeLessThanOrEqual(m.vh); // whole, on the first screen
});

/** A colour as the page computes it: r, g, b 0–255 and alpha 0–1 (rgb()/rgba() or color(srgb …)). */
function parse(s: string) {
  const m = /color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)(?: \/ ([\d.]+))?\)/.exec(s);
  if (m) return { r: Number(m[1]) * 255, g: Number(m[2]) * 255, b: Number(m[3]) * 255, a: m[4] ? Number(m[4]) : 1 };
  const n = /rgba?\(([\d.]+),? ([\d.]+),? ([\d.]+)(?:[,/] ?([\d.]+))?\)/.exec(s);
  return n ? { r: Number(n[1]), g: Number(n[2]), b: Number(n[3]), a: n[4] ? Number(n[4]) : 1 } : null;
}

test("the scrollbar: a slim translucent emerald thumb on a near-black track, lime when used; scrolling works, never sideways", async ({
  page,
}, info) => {
  await openHome(page);
  // the large-screen scene fits the screen: «كيف نبدأ؟» open makes the page scroll there. Opened from the keyboard: the
  // pointer stays out of the page, which would count as hovering the root (and so the thumb) in the styles read below
  if (await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1)) {
    await page.locator("[data-disclosure-toggle]").focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("[data-disclosure-panel] p").first()).toBeVisible();
    await page.waitForTimeout(800);
  }
  expect(await page.evaluate(() => document.documentElement.scrollHeight > innerHeight)).toBe(true);

  const css = await page.evaluate(() => {
    const color = (v: string) => {
      const el = document.createElement("i");
      el.style.color = v;
      document.body.append(el);
      const c = getComputedStyle(el).color;
      el.remove();
      return c;
    };
    const rules: string[] = [];
    const walk = (list: CSSRuleList) => {
      for (const r of list) {
        if (r instanceof CSSStyleRule) rules.push(r.cssText);
        else if ("cssRules" in r) walk((r as CSSGroupingRule).cssRules);
      }
    };
    for (const sheet of document.styleSheets) {
      try {
        walk(sheet.cssRules);
      } catch {
        // a cross-origin sheet: not ours
      }
    }
    const find = (selector: string) => rules.filter((t) => t.split("{")[0]!.includes(selector)).join(" ");
    const html = document.documentElement;
    const cs = getComputedStyle(html);
    // the styled parts as the engine resolves them (Blink does; where an engine does not, the rules are read instead)
    const part = (pseudo: string) => {
      const p = getComputedStyle(html, pseudo);
      return { bg: p.backgroundColor, width: p.width, radius: p.borderTopLeftRadius };
    };
    const parts = { bar: part("::-webkit-scrollbar"), track: part("::-webkit-scrollbar-track"), thumb: part("::-webkit-scrollbar-thumb") };
    // does this engine resolve scrollbar parts at all? Asked of a probe with a style of its own, not of ours
    const probe = document.createElement("div");
    probe.id = "scrollbar-probe";
    const sheet = document.createElement("style");
    sheet.textContent = "#scrollbar-probe::-webkit-scrollbar-thumb { border-radius: 7px; }";
    document.head.append(sheet);
    document.body.append(probe);
    const resolves = getComputedStyle(probe, "::-webkit-scrollbar-thumb").borderTopLeftRadius === "7px";
    probe.remove();
    sheet.remove();
    html.setAttribute("data-scrolling", "");
    const thumbScrolling = part("::-webkit-scrollbar-thumb").bg;
    html.removeAttribute("data-scrolling");
    return {
      parts,
      resolves,
      thumbScrolling,
      webkit: CSS.supports("selector(::-webkit-scrollbar)"),
      bar: find("html::-webkit-scrollbar "),
      thumbRule: find("html::-webkit-scrollbar-thumb "),
      hoverRule: find("::-webkit-scrollbar-thumb:hover"),
      activeRule: find("html[data-scrolling]::-webkit-scrollbar-thumb"),
      standardWidth: cs.getPropertyValue("scrollbar-width"),
      standardColor: cs.getPropertyValue("scrollbar-color"),
      thumb: color("var(--scrollbar-thumb)"),
      hover: color("var(--scrollbar-thumb-hover)"),
      active: color("var(--scrollbar-thumb-active)"),
      track: color("var(--scrollbar-track)"),
    };
  });
  // the tokens: a translucent dark emerald, a brighter emerald, a restrained lime; the track is the page's near-black
  const thumb = parse(css.thumb)!;
  const hover = parse(css.hover)!;
  const active = parse(css.active)!;
  const track = parse(css.track)!;
  expect(thumb.g).toBeGreaterThan(thumb.r + 60); // emerald: green leads clearly (#087a3f)
  expect(thumb.g).toBeGreaterThan(thumb.b + 30);
  expect(thumb.a).toBeLessThan(1);
  expect(thumb.a).toBeGreaterThan(0.4); // visible enough to say the page scrolls
  expect(hover.g).toBeGreaterThan(thumb.g);
  expect(active.r).toBeGreaterThan(150);
  expect(active.g).toBeGreaterThan(200);
  expect(active.b).toBeLessThan(120);
  expect(active.a).toBeLessThan(1);
  expect(Math.max(track.r, track.g, track.b)).toBeLessThan(12);
  if (css.webkit) {
    // Blink and WebKit: the styled parts (only they have hover and drag states)
    expect(css.hoverRule).toContain("var(--scrollbar-thumb-hover)");
    if (css.resolves) {
      // resolved by the engine: slim, soft, the tokens' colours — and lime while the page scrolls
      test.info().annotations.push({ type: "scrollbar", description: "checked on the parts the engine resolved" });
      expect(Number.parseFloat(css.parts.thumb.radius)).toBeGreaterThanOrEqual(4);
      const w = Number.parseFloat(css.parts.bar.width);
      expect(w).toBeGreaterThanOrEqual(8);
      expect(w).toBeLessThanOrEqual(12);
      expect(parse(css.parts.thumb.bg)).toEqual(thumb);
      expect(parse(css.parts.track.bg)).toEqual(track);
      expect(parse(css.thumbScrolling)).toEqual(active);
    } else {
      test.info().annotations.push({ type: "scrollbar", description: "this engine does not resolve the parts: checked on the rules" });
      expect(css.bar).toContain("10px");
      expect(css.thumbRule).toContain("var(--scrollbar-thumb)");
      expect(css.thumbRule).toMatch(/border-radius/);
      expect(css.activeRule).toContain("var(--scrollbar-thumb-active)");
    }
  } else {
    // the standard properties (Firefox): thin, the thumb's and the track's colours
    expect(css.standardWidth).toBe("thin");
    expect(css.standardColor).not.toBe("auto");
    const [c1] = css.standardColor.match(/(rgba?|color)\([^)]*\)/g) ?? [];
    expect(parse(c1 ?? "")?.g ?? 0).toBeGreaterThan(80);
  }

  // scrolling still works — and marks the page while it does, so the thumb lights up. Blink keeps a scrollbar's parts
  // as first drawn when only an attribute changes, so there (fine pointers) the root's overflow switches to its own
  // equivalent, scroll, meanwhile: that redraws them (globals.css). Nothing moves: the scroll position stays.
  const state = () =>
    page.evaluate(() => ({
      marked: document.documentElement.hasAttribute("data-scrolling"),
      overflow: getComputedStyle(document.documentElement).overflowY,
      y: Math.round(scrollY),
    }));
  const redraws = css.webkit && (await page.evaluate(() => matchMedia("(hover: hover) and (pointer: fine)").matches));
  await page.evaluate(() => window.scrollTo(0, 120));
  await expect.poll(async () => (await state()).marked).toBe(true);
  const during = await state();
  expect(during.overflow).toBe(redraws ? "scroll" : "visible");
  await expect.poll(async () => (await state()).marked, { timeout: 3_000 }).toBe(false);
  const after = await state();
  expect(after.overflow).toBe("visible");
  expect(after.y).toBe(during.y);
  await page.evaluate(() => window.scrollTo(0, 0));
  if (hasMousePointer(info)) {
    const vp = page.viewportSize()!;
    await page.mouse.move(vp.width / 2, vp.height / 2);
    await page.mouse.wheel(0, 300);
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0);
    await page.mouse.wheel(400, 0); // sideways: nothing to scroll
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => scrollX)).toBe(0);
    await page.evaluate(() => window.scrollTo(0, 0));
  }
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press("PageDown");
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
