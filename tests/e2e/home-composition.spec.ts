import { expect, test } from "@playwright/test";
import { FEATURES, openHome } from "./support";

/*
 * Owner's visual-correction pass of 2026-10-22: the Neon palette as rendered, the characters' shared focus on the
 * portal, the «أنا» → Tashfeer pointer, one RTL alignment for the copy, and the 01–05 steps on every width.
 */

const narrow = (w: number) => w < 900;

test.beforeEach(async ({ page }) => {
  await openHome(page);
});

test("the Neon palette is what the page computes and paints", async ({ page }) => {
  const got = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    const token = (n: string) => root.getPropertyValue(`--${n}`).trim().toLowerCase();
    const cs = (sel: string) => getComputedStyle(document.querySelector(sel)!);
    return {
      tokens: Object.fromEntries(
        ["brand-bg", "brand-emerald", "brand-lime", "brand-highlight", "brand-text-silver", "brand-gold"].map((n) => [n, token(n)]),
      ),
      body: getComputedStyle(document.body).backgroundColor,
      html: root.backgroundColor,
      text: cs("[data-scene-part=copy] [class*=intro]").color,
      enter: cs("[data-chat-shell] footer button, [data-chat-shell] [class*=footer] button").backgroundImage,
      toolIcon: cs("[data-chat-shell] [class*=tools] button svg").color,
      digits: cs("[data-feature-card] [class*=num]").backgroundImage,
      headline: getComputedStyle(document.querySelector("h1 [data-gradient-text]")!).backgroundImage,
    };
  });
  expect(got.tokens).toEqual({
    "brand-bg": "#030504",
    "brand-emerald": "#087a3f",
    "brand-lime": "#baff24",
    "brand-highlight": "#e5ff45",
    "brand-text-silver": "#c9ceca",
    "brand-gold": "#d9b84a",
  });
  expect(got.body).toBe("rgb(3, 5, 4)"); // near-black background
  expect(got.html).toBe("rgb(3, 5, 4)");
  expect(got.text).toBe("rgb(201, 206, 202)"); // silver-grey typography
  expect(got.enter).toContain("rgb(8, 122, 63)"); // the primary button is emerald
  expect(got.toolIcon).toBe("rgb(217, 184, 74)"); // the gold accent, where the prototype puts it
  expect(got.digits).toContain("rgb(186, 255, 36)"); // the numbered tiles light up lime
  expect(got.headline).toContain("rgb(229, 255, 69)"); // the yellow-green highlight leads the headline
});

test("Tashfeer and the customer both face the portal", async ({ page }) => {
  // Both source images face right (inspected: Tashfeer stands in a three-quarter view turned to the right, the
  // customer looks to the right from his chair). Facing = right, flipped by a negative horizontal scale.
  const r = await page.evaluate(() => {
    const info = (sel: string) => {
      const el = document.querySelector<HTMLElement>(sel)!;
      const b = el.getBoundingClientRect();
      const m = new DOMMatrixReadOnly(getComputedStyle(el).transform === "none" ? undefined : getComputedStyle(el).transform);
      return { cx: b.left + b.width / 2, mirrored: m.a < 0 };
    };
    const p = document.querySelector("[data-portal]")!.getBoundingClientRect();
    return { portal: p.left + p.width / 2, robot: info("[data-tashfeer]"), customer: info("[data-seated-customer]") };
  });
  expect(r.robot.mirrored, "Tashfeer is never mirrored: his chest reads «تشفير»").toBe(false);
  for (const who of ["robot", "customer"] as const) {
    const facing = r[who].mirrored ? -1 : 1;
    expect(facing * (r.portal - r[who].cx), `${who} looks toward the portal`).toBeGreaterThan(0);
  }
});

test("the «أنا» pointer ends at Tashfeer, points into him and crosses no text", async ({ page }) => {
  // drawn after hydration, from the live layout
  await page.locator("[data-speaker-arrow] [data-arrow-line]").waitFor({ state: "attached" });
  const r = await page.evaluate(() => {
    const line = document.querySelector<SVGPathElement>("[data-speaker-arrow] [data-arrow-line]");
    if (!line) return null;
    const svg = line.ownerSVGElement!.getBoundingClientRect();
    const len = line.getTotalLength();
    const at = (t: number) => {
      const p = line.getPointAtLength(t * len);
      return { x: p.x + svg.left, y: p.y + svg.top };
    };
    const robot = document.querySelector("[data-tashfeer]")!.getBoundingClientRect();
    const label = document.querySelector("[data-speaker-label]")!.getBoundingClientRect();
    const end = at(1);
    const before = at(0.97);
    // walk on along the end direction: the pointer must run into the robot within 40 px
    const ux = end.x - before.x;
    const uy = end.y - before.y;
    const n = Math.hypot(ux, uy) || 1;
    let hits = false;
    for (let d = 0; d <= 40; d += 2) {
      const x = end.x + (ux / n) * d;
      const y = end.y + (uy / n) * d;
      if (x >= robot.left && x <= robot.right && y >= robot.top && y <= robot.bottom) hits = true;
    }
    // nothing it must not cross: every text block, the chat, the cards, the customer and her voice pill
    const guarded = [
      ...document.querySelectorAll("h1 [data-gradient-text]:not([data-speaker-label]), [data-scene-part=copy] p"),
      ...document.querySelectorAll("[data-chat-shell], [data-feature-card], [data-seated-customer], [data-scene-part=customer] button"),
    ].map((el) => ({ name: `${el.tagName}.${(el as HTMLElement).className}`.slice(0, 40), r: el.getBoundingClientRect() }));
    const crossings: string[] = [];
    for (let i = 0; i <= 60; i++) {
      const p = at(i / 60);
      for (const g of guarded) {
        if (p.x > g.r.left + 1 && p.x < g.r.right - 1 && p.y > g.r.top + 1 && p.y < g.r.bottom - 1) crossings.push(g.name);
      }
    }
    const start = at(0);
    return {
      startNearLabel: Math.hypot(Math.max(label.left - start.x, 0, start.x - label.right), Math.max(label.top - start.y, 0, start.y - label.bottom)),
      endToRobot: Math.hypot(Math.max(robot.left - end.x, 0, end.x - robot.right), Math.max(robot.top - end.y, 0, end.y - robot.bottom)),
      hits,
      crossings: [...new Set(crossings)],
      tip: Boolean(document.querySelector("[data-speaker-arrow] [data-arrow-tip]")),
    };
  });
  expect(r, "the pointer is drawn").not.toBeNull();
  expect(r!.tip).toBe(true);
  expect(r!.startNearLabel, "it starts at «أنا»").toBeLessThan(16);
  expect(r!.endToRobot, "it ends at Tashfeer").toBeLessThan(24);
  expect(r!.hits, "its arrowhead points into Tashfeer").toBe(true);
  expect(r!.crossings).toEqual([]);
});

test("the copy reads right-to-left in one alignment, at a controlled measure", async ({ page }, info) => {
  const w = info.project.use.viewport?.width ?? 0;
  const r = await page.evaluate(() => {
    const blocks = [
      ...document.querySelectorAll<HTMLElement>("h1 [data-gradient-text]:not([data-speaker-label]), [data-scene-part=copy] p"),
    ];
    const container = document.querySelector("[data-scene-part=copy] [class*=copyText]")!.getBoundingClientRect();
    const right = (el: Element) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      return Math.max(...[...range.getClientRects()].map((q) => q.right));
    };
    const rightEdges = blocks.map(right);
    const isLede = (el: Element) => Boolean(el.closest("[class*=lede]"));
    const spread = (xs: number[]) => Math.max(...xs) - Math.min(...xs);
    const headEdges = blocks.filter((el) => !isLede(el)).map(right);
    const ledeEdges = blocks.filter(isLede).map(right);
    const lede = [...document.querySelectorAll<HTMLElement>("[data-scene-part=copy] [class*=lede] p")];
    const gaps = lede.slice(1).map((p, i) => p.getBoundingClientRect().top - lede[i]!.getBoundingClientRect().bottom);
    const fontSize = Number.parseFloat(getComputedStyle(lede[0]!).fontSize);
    const widest = Math.max(...lede.map((p) => p.getBoundingClientRect().width));
    return {
      directions: [...new Set(blocks.map((el) => getComputedStyle(el).direction))],
      alignments: [...new Set(blocks.map((el) => getComputedStyle(el).textAlign))],
      rightSpread: spread(rightEdges),
      headSpread: spread(headEdges),
      ledeSpread: spread(ledeEdges),
      flushRight: container.right - Math.max(...rightEdges),
      gaps,
      measureEm: widest / fontSize,
    };
  });
  expect(r.directions).toEqual(["rtl"]);
  expect(r.alignments.every((a) => a === "start" || a === "right")).toBe(true);
  // one right edge for the headline and the introduction, one for the paragraphs — the same edge, except at
  // 600–899 where the paragraphs form a second column on the left
  expect(r.headSpread, "headline and introduction start on one right edge").toBeLessThan(14);
  expect(r.ledeSpread, "paragraphs start on one right edge").toBeLessThan(14);
  if (w < 600 || w >= 900) expect(r.rightSpread, "every line starts on the same right edge").toBeLessThan(14);
  expect(r.flushRight).toBeLessThan(14);
  expect(Math.max(...r.gaps) - Math.min(...r.gaps), "the same space between paragraphs").toBeLessThan(1);
  expect(r.measureEm, "lines are not stretched (about 60 Arabic letters at most)").toBeLessThanOrEqual(28);
});

test("the 01–05 steps are one coherent, ordered set at every width", async ({ page }, info) => {
  const w = info.project.use.viewport?.width ?? 0;
  const r = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("[data-feature-card]")].map((card) => {
      const tile = card.querySelector<HTMLElement>("[class*=tile]")!.getBoundingClientRect();
      const label = card.querySelector<HTMLElement>("[class*=label]")!.getBoundingClientRect();
      const c = card.getBoundingClientRect();
      return {
        n: card.dataset.featureCard,
        text: card.textContent ?? "",
        tile: { w: tile.width, h: tile.height, cx: tile.left + tile.width / 2, cy: tile.top + tile.height / 2 },
        overlap: tile.left < label.right && tile.right > label.left && tile.top < label.bottom && tile.bottom > label.top,
        gapTileLabel: Math.max(label.left - tile.right, tile.left - label.right, label.top - tile.bottom, tile.top - label.bottom),
        card: { left: c.left, right: c.right, top: c.top, bottom: c.bottom },
      };
    }),
  );
  expect(r.map((c) => c.n)).toEqual(["01", "02", "03", "04", "05"]);
  r.forEach((c, i) => expect(c.text).toContain(FEATURES[i]!));
  // one tile size, labels beside or under their own tile, never on it
  expect(new Set(r.map((c) => `${c.tile.w.toFixed(1)}×${c.tile.h.toFixed(1)}`)).size).toBe(1);
  for (const c of r) {
    expect(c.overlap, `${c.n} label on its tile`).toBe(false);
    expect(c.gapTileLabel, `${c.n} label next to its tile`).toBeLessThan(24);
  }
  if (w >= 1280) return; // desktop keeps the approved arc beside the ring
  const ys = r.map((c) => c.tile.cy);
  const xs = r.map((c) => c.tile.cx);
  if (w < 600) {
    // stacked: one per row, top to bottom, equal steps, aligned on one vertical line
    for (let i = 1; i < 5; i++) expect(ys[i]! - ys[i - 1]!).toBeGreaterThan(20);
    const steps = ys.slice(1).map((y, i) => y - ys[i]!);
    expect(Math.max(...steps) - Math.min(...steps)).toBeLessThan(2);
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(1);
  } else {
    // one row: same line, right to left (RTL), equal spacing
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(1);
    for (let i = 1; i < 5; i++) expect(xs[i - 1]! - xs[i]!).toBeGreaterThan(20);
    const steps = xs.slice(1).map((x, i) => xs[i]! - x);
    expect(Math.max(...steps) - Math.min(...steps)).toBeLessThan(2);
  }
  expect(narrow(w) || w < 1280).toBe(true);
});
