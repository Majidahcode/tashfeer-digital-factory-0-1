import { expect, test, type Page } from "@playwright/test";
import { HERO } from "@/domain/home-content";
import { FEATURES, openHome } from "./support";

/*
 * Owner's visual-correction passes of 2026-10-22: the Neon palette as rendered, the characters' shared focus on the
 * portal, the «أنا» → Tashfeer pointer (diagonal at every width), the centred headline block, and the 01–05 steps
 * on every width (a 2-2-1 pyramid on phones).
 */

/** Below this width the phone layout applies (HomeScene.module.css). */
const PHONE = 720;

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

for (const state of ["closed", "open"] as const)
test(`the «أنا» pointer ends at Tashfeer, arrives diagonally, and crosses nothing («كيف نبدأ؟» ${state})`, async ({ page }) => {
  if (state === "open") {
    await page.locator("[data-disclosure-toggle]").click();
    await page.waitForTimeout(700); // the panel's opening transition; the pointer is redrawn as the scene grows
  }
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
    // nothing it must not cross: every text block, the «كيف نبدأ؟» button, the portal and its chat, the cards, the
    // customer and his voice pill, the ambient phrases
    const guarded = [
      ...document.querySelectorAll("h1 [data-gradient-text]:not([data-speaker-label]), [data-scene-part=copy] p, [data-disclosure-toggle]"),
      ...document.querySelectorAll(
        "[data-portal], [data-chat-shell], [data-feature-card], [data-seated-customer], [data-scene-part=customer] button, [data-phrase-index]",
      ),
    ]
      .filter((el) => getComputedStyle(el).visibility !== "hidden")
      .map((el) => ({ name: `${el.tagName}.${(el as HTMLElement).className}`.slice(0, 40), r: el.getBoundingClientRect() }))
      .filter((g) => g.r.width > 0 && g.r.height > 0);
    const crossings: string[] = [];
    for (let i = 0; i <= 60; i++) {
      const p = at(i / 60);
      for (const g of guarded) {
        if (p.x > g.r.left + 1 && p.x < g.r.right - 1 && p.y > g.r.top + 1 && p.y < g.r.bottom - 1) crossings.push(g.name);
      }
    }
    const start = at(0);
    // how it arrives (degrees below the horizontal) and how much it bends (largest distance from its chord ÷ chord)
    const arrival = (Math.atan2(end.y - before.y, Math.abs(end.x - before.x)) * 180) / Math.PI;
    const chord = Math.hypot(end.x - start.x, end.y - start.y);
    let bend = 0;
    for (let i = 1; i < 30; i++) {
      const p = at(i / 30);
      bend = Math.max(bend, Math.abs((p.x - start.x) * (end.y - start.y) - (p.y - start.y) * (end.x - start.x)) / chord);
    }
    return {
      startNearLabel: Math.hypot(Math.max(label.left - start.x, 0, start.x - label.right), Math.max(label.top - start.y, 0, start.y - label.bottom)),
      endToRobot: Math.hypot(Math.max(robot.left - end.x, 0, end.x - robot.right), Math.max(robot.top - end.y, 0, end.y - robot.bottom)),
      hits,
      crossings: [...new Set(crossings)],
      tip: Boolean(document.querySelector("[data-speaker-arrow] [data-arrow-tip]")),
      arrival,
      bend: bend / chord,
    };
  });
  expect(r, "the pointer is drawn").not.toBeNull();
  expect(r!.tip).toBe(true);
  expect(r!.startNearLabel, "it starts at «أنا»").toBeLessThan(16);
  expect(r!.endToRobot, "it ends at Tashfeer").toBeLessThan(24);
  expect(r!.hits, "its arrowhead points into Tashfeer").toBe(true);
  expect(r!.crossings).toEqual([]);
  // owner's correction §4: angled at every width — neither a flat sideways line nor a straight vertical drop
  expect(r!.arrival, "it arrives diagonally").toBeGreaterThanOrEqual(30);
  expect(r!.arrival, "it arrives diagonally").toBeLessThanOrEqual(80);
  expect(r!.bend, "it is a curve, not a straight stroke").toBeGreaterThanOrEqual(0.05);
});

test("the headline, its introduction and «كيف نبدأ؟» are one centred block, with the wording unchanged", async ({ page }) => {
  // owner's correction §1: the headline's words exactly as approved (its lines are separate blocks: compare words)
  const words = (await page.locator("h1").innerText()).split(/\s+/).filter(Boolean).join(" ");
  expect(words).toBe("أنا مو بس أسوي لك منتجك الرقمي اللي بخيالك لا أبني منتجك قدام عينك");
  const r = await page.evaluate(() => {
    const block = document.querySelector("[data-scene-part=copy] [class*=copyText]")!.getBoundingClientRect();
    const mid = block.left + block.width / 2;
    // every visible line, centre against the block's centre: the fragments of one line (the introduction's dot and
    // its words) are merged into the line they form, and a wrapped element counts each of its lines
    const centres = (el: Element) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      const lines: Array<{ top: number; bottom: number; left: number; right: number }> = [];
      for (const q of [...range.getClientRects()].filter((r) => r.width > 0.5)) {
        const line = lines.find((l) => q.top < l.bottom - 2 && q.bottom > l.top + 2);
        if (line) {
          line.left = Math.min(line.left, q.left);
          line.right = Math.max(line.right, q.right);
        } else lines.push({ top: q.top, bottom: q.bottom, left: q.left, right: q.right });
      }
      return lines.map((l) => (l.left + l.right) / 2 - mid);
    };
    // «أنا» counts where it is part of the block (≥ 900 px); on narrower screens it stands by Tashfeer instead
    const lines = [...document.querySelectorAll("h1 [data-gradient-text]")].filter(
      (el) => !el.matches("[data-speaker-label]") || getComputedStyle(el.closest("[class*=l1Row]")!).position !== "absolute",
    );
    const intro = document.querySelector("[data-scene-part=copy] [class*=intro]")!;
    const toggle = document.querySelector("[data-disclosure-toggle]")!.getBoundingClientRect();
    return {
      offsets: [...lines, intro].flatMap(centres),
      toggle: toggle.left + toggle.width / 2 - mid,
      directions: [...new Set([...lines, intro].map((el) => getComputedStyle(el).direction))],
      align: [...new Set([...lines, intro].map((el) => getComputedStyle(el).textAlign))],
    };
  });
  expect(r.directions).toEqual(["rtl"]);
  expect(r.align).toEqual(["center"]);
  for (const o of r.offsets) expect(Math.abs(o), "each line is centred on the block").toBeLessThan(3);
  expect(Math.abs(r.toggle), "«كيف نبدأ؟» is centred under them").toBeLessThan(3);
});

/**
 * Opens or closes the disclosure with `act` and returns the CSS transitions this starts on the panel, once they have
 * run to their end. They are read from the browser's own animation objects the moment the state flips (a
 * MutationObserver on data-open, before any frame is drawn), and their end is awaited, not timed: WebKit in CI renders
 * this page at a few frames a second, and a transition starts only on the next rendered frame (CI run 39827051351:
 * after a close the transitions stayed pending for up to 1.4 s, so a 2 s budget for "hidden" failed on webkit-390).
 */
async function panelTransitions(page: Page, act: () => Promise<unknown>) {
  await page.evaluate(() => {
    const root = document.querySelector<HTMLElement>("[data-disclosure]")!;
    const panel = root.querySelector<HTMLElement>("[data-disclosure-panel]")!;
    (window as unknown as { panelRun: Promise<Array<{ property: string; duration: number }>> }).panelRun = new Promise(
      (resolve) => {
        const observer = new MutationObserver(() => {
          observer.disconnect();
          const transitions = panel.getAnimations().filter((a): a is CSSTransition => "transitionProperty" in a);
          const timing = transitions.map((t) => ({
            property: t.transitionProperty,
            duration: Number(t.effect?.getComputedTiming().duration),
          }));
          void Promise.all(transitions.map((t) => t.finished.catch(() => null))).then(() => resolve(timing));
        });
        observer.observe(root, { attributes: true, attributeFilter: ["data-open"] });
      },
    );
  });
  await act();
  return page.evaluate(
    () => (window as unknown as { panelRun: Promise<Array<{ property: string; duration: number }>> }).panelRun,
  );
}

test("«كيف نبدأ؟» is a real disclosure: hidden by default, opens and closes the original paragraphs", async ({ page }) => {
  const toggle = page.getByRole("button", { name: "كيف نبدأ؟" });
  const panel = page.locator("[data-disclosure-panel]");
  const paragraphs = panel.locator("p");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(toggle).toHaveAttribute("aria-controls", (await panel.getAttribute("id"))!);
  // closed: not shown, not read, not focusable
  await expect(paragraphs.first()).toBeHidden();
  await expect(panel).toHaveAttribute("inert", "");
  expect((await panel.boundingBox())!.height).toBeLessThan(1);

  // it opens smoothly: the click starts a real transition of the panel's height (its grid row 0fr → 1fr), several
  // hundred milliseconds long (read from the browser's own transitions and awaited to their end, see panelTransitions)
  const opening = await panelTransitions(page, () => toggle.evaluate((el: HTMLElement) => el.click()));
  const height = opening.find((t) => t.property === "grid-template-rows");
  expect(height, JSON.stringify(opening)).toBeTruthy();
  expect(height!.duration).toBeGreaterThanOrEqual(300);
  expect(height!.duration).toBeLessThanOrEqual(800);
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(paragraphs).toHaveText([...HERO.lede]); // the original wording, unchanged
  await expect(paragraphs.first()).toBeVisible();
  await expect(panel).not.toHaveAttribute("inert", "");
  expect((await panel.boundingBox())!.height).toBeGreaterThan(100);

  // keyboard: Enter closes — smoothly too (the row 1fr → 0fr), and once it has closed the paragraphs are hidden,
  // inert and take no space again — then Space opens it again
  await toggle.focus();
  const closing = await panelTransitions(page, () => page.keyboard.press("Enter"));
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  const collapse = closing.find((t) => t.property === "grid-template-rows");
  expect(collapse, JSON.stringify(closing)).toBeTruthy();
  expect(collapse!.duration).toBeGreaterThanOrEqual(300);
  expect(collapse!.duration).toBeLessThanOrEqual(800);
  await expect(paragraphs.first()).toBeHidden();
  await expect(panel).toHaveAttribute("inert", "");
  expect((await panel.boundingBox())!.height).toBeLessThan(1);
  await page.keyboard.press(" ");
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(paragraphs.first()).toBeVisible();
});

test("open, the paragraphs read in a glass panel that covers nothing, at a readable measure", async ({ page }) => {
  await page.locator("[data-disclosure-toggle]").click();
  await page.waitForTimeout(800);
  const r = await page.evaluate(() => {
    const panel = document.querySelector("[data-disclosure-panel] [class*=glass]")!;
    const p = panel.getBoundingClientRect();
    const others = [
      "[data-portal]",
      "[data-chat-shell]",
      "[data-tashfeer]",
      "[data-seated-customer]",
      "[data-scene-part=customer] button",
      "[data-feature-card]",
      "[data-hero-headline]",
      "[data-scene-part=copy] [class*=intro]",
      "[data-disclosure-toggle]",
      "[data-site-header]",
    ];
    const overlaps: string[] = [];
    for (const sel of others)
      for (const el of document.querySelectorAll(sel)) {
        const o = el.getBoundingClientRect();
        if (o.width && o.height && p.left < o.right - 1 && p.right > o.left + 1 && p.top < o.bottom - 1 && p.bottom > o.top + 1)
          overlaps.push(sel);
      }
    const paras = [...panel.querySelectorAll("p")];
    const fontSize = Number.parseFloat(getComputedStyle(paras[0]!).fontSize);
    const widest = Math.max(...paras.map((q) => q.getBoundingClientRect().width));
    return {
      overlaps,
      measureEm: widest / fontSize,
      align: [...new Set(paras.map((q) => getComputedStyle(q).textAlign))],
      direction: getComputedStyle(paras[0]!).direction,
      background: getComputedStyle(panel).backgroundImage,
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  expect(r.overlaps).toEqual([]);
  expect(r.measureEm, "lines are not stretched").toBeLessThanOrEqual(28);
  expect(r.direction).toBe("rtl");
  expect(r.align.every((a) => a === "start" || a === "right")).toBe(true);
  expect(r.background).toContain("gradient"); // the neon glass fill
  expect(r.overflowX).toBe(0);
});

test("the 01–05 steps: standalone glowing tiles, labels outside them, in order at every width (2-2-1 on phones)", async ({
  page,
}, info) => {
  const w = info.project.use.viewport?.width ?? 0;
  const r = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("[data-feature-card]")].map((card) => {
      const tileEl = card.querySelector<HTMLElement>("[class*=tile]")!;
      const labelEl = card.querySelector<HTMLElement>("[class*=label]")!;
      const tile = tileEl.getBoundingClientRect();
      const label = labelEl.getBoundingClientRect();
      const cs = getComputedStyle(card);
      const accent = getComputedStyle(labelEl, "::after");
      const shadows = cs.boxShadow === "none" ? [] : cs.boxShadow.split(/,(?![^(]*\))/);
      return {
        n: card.dataset.featureCard,
        text: card.textContent ?? "",
        tile: { w: tile.width, h: tile.height, cx: tile.left + tile.width / 2, cy: tile.top + tile.height / 2, bottom: tile.bottom },
        label: { left: label.left, right: label.right, top: label.top, bottom: label.bottom, cx: label.left + label.width / 2 },
        labelOutsideTile: !(tile.left < label.right && tile.right > label.left && tile.top < label.bottom && tile.bottom > label.top),
        gapTileLabel: Math.max(label.left - tile.right, tile.left - label.right, label.top - tile.bottom, tile.top - label.bottom),
        // the step itself draws nothing: no fill, no border, no shadow — no outer card
        card: {
          background: `${cs.backgroundImage} ${cs.backgroundColor}`,
          border: Number.parseFloat(cs.borderTopWidth) + Number.parseFloat(cs.borderBottomWidth),
          visibleShadow: shadows.some((x) => !/rgba\(0, 0, 0, 0\)|transparent/.test(x)),
        },
        accent: {
          content: accent.content,
          w: Number.parseFloat(accent.width),
          h: Number.parseFloat(accent.height),
          image: accent.backgroundImage,
        },
        vw: innerWidth,
      };
    }),
  );
  expect(r.map((c) => c.n)).toEqual(["01", "02", "03", "04", "05"]);
  r.forEach((c, i) => expect(c.text).toContain(FEATURES[i]!));
  expect(new Set(r.map((c) => `${c.tile.w.toFixed(1)}×${c.tile.h.toFixed(1)}`)).size, "one tile size").toBe(1);
  for (const c of r) {
    expect(c.card.background, `${c.n}: no card behind the step`).toBe("none rgba(0, 0, 0, 0)");
    expect(c.card.border, `${c.n}: no card border`).toBe(0);
    expect(c.card.visibleShadow, `${c.n}: no card shadow`).toBe(false);
    expect(c.labelOutsideTile, `${c.n}: the label is outside its tile`).toBe(true);
    expect(c.gapTileLabel, `${c.n}: the label is next to its own tile`).toBeLessThan(24);
    // a short, thin accent line in the identity colours under every label
    expect(c.accent.content, `${c.n}: accent line`).toBe('""');
    expect(c.accent.h).toBeGreaterThan(0);
    expect(c.accent.h).toBeLessThanOrEqual(3);
    expect(c.accent.w).toBeGreaterThan(10);
    expect(c.accent.w).toBeLessThanOrEqual(40);
    expect(c.accent.image).toContain("rgb(186, 255, 36)");
    expect(c.label.left, `${c.n} label on screen`).toBeGreaterThanOrEqual(0);
    expect(c.label.right).toBeLessThanOrEqual(c.vw);
  }
  // labels never overlap one another or another step's tile
  for (let i = 0; i < 5; i++)
    for (let j = 0; j < 5; j++) {
      if (i === j) continue;
      const a = r[i]!.label;
      const b = r[j]!.label;
      if (i < j) expect(a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top, `labels ${r[i]!.n} × ${r[j]!.n}`).toBe(false);
      const t = r[j]!.tile;
      expect(a.left < t.cx + t.w / 2 && a.right > t.cx - t.w / 2 && a.top < t.cy + t.h / 2 && a.bottom > t.cy - t.h / 2, `label ${r[i]!.n} × tile ${r[j]!.n}`).toBe(false);
    }
  if (w >= 1280) return; // desktop keeps the approved arc beside the ring
  const ys = r.map((c) => c.tile.cy);
  const xs = r.map((c) => c.tile.cx);
  if (w < PHONE) {
    // the pyramid: 01 02 / 03 04 / 05 — each row read right to left, 05 centred under the pairs, even rows
    expect(Math.abs(ys[0]! - ys[1]!)).toBeLessThan(1);
    expect(Math.abs(ys[2]! - ys[3]!)).toBeLessThan(1);
    expect(ys[2]!).toBeGreaterThan(ys[0]! + 40);
    expect(ys[4]!).toBeGreaterThan(ys[2]! + 40);
    expect(xs[0]!, "01 right of 02 (RTL)").toBeGreaterThan(xs[1]! + 40);
    expect(xs[2]!, "03 right of 04 (RTL)").toBeGreaterThan(xs[3]! + 40);
    expect(Math.abs(xs[0]! - xs[2]!), "the pairs stack in columns").toBeLessThan(1);
    expect(Math.abs(xs[1]! - xs[3]!)).toBeLessThan(1);
    expect(Math.abs(xs[4]! - (xs[0]! + xs[1]!) / 2), "05 centred under them").toBeLessThan(1.5);
    expect(Math.abs(ys[2]! - ys[0]! - (ys[4]! - ys[2]!)), "even rows").toBeLessThan(1.5);
    for (const c of r) expect(Math.abs(c.label.cx - c.tile.cx), `${c.n}: label centred under its tile`).toBeLessThan(2);
  } else {
    // one row: same line, right to left (RTL), equal spacing
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(1);
    for (let i = 1; i < 5; i++) expect(xs[i - 1]! - xs[i]!).toBeGreaterThan(20);
    const steps = xs.slice(1).map((x, i) => xs[i]! - x);
    expect(Math.max(...steps) - Math.min(...steps)).toBeLessThan(2);
  }
});
