import { expect, test } from "@playwright/test";
import manifest from "@/generated/asset-manifest.json";
import { FEATURES, isWide, openHome } from "./support";

const RING_SRC = manifest.assets["portal-ring"].src;

test.beforeEach(async ({ page }) => {
  await openHome(page);
});

test("P1-03 the wordmark and the headline lines are clipped gradient text", async ({ page }) => {
  const styles = await page.locator("[data-brand] [data-gradient-text], h1 [data-gradient-text]").evaluateAll((els) =>
    els.map((el) => {
      const cs = getComputedStyle(el);
      return {
        text: el.textContent ?? "",
        clip: cs.getPropertyValue("background-clip") + cs.getPropertyValue("-webkit-background-clip"),
        fill: cs.getPropertyValue("-webkit-text-fill-color"),
        image: cs.backgroundImage,
      };
    }),
  );
  expect(styles.length).toBe(5); // wordmark + the four headline lines
  for (const s of styles) {
    expect(s.clip, s.text).toContain("text");
    expect(s.fill, s.text).toBe("rgba(0, 0, 0, 0)");
    expect(s.image, s.text).toContain("linear-gradient");
  }
  await expect(page.locator("[data-brand] [data-gradient-text]")).toHaveText("تشفير");
});

test("P1-04 rendered headline gradients keep every stop ≥ 3:1 against the page background", async ({ page }) => {
  const result = await page.evaluate(() => {
    const rgb = (s: string) =>
      [...s.matchAll(/rgba?\((\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?)/g)].map((m) => [
        Number(m[1]),
        Number(m[2]),
        Number(m[3]),
      ]);
    const channel = (v: number) => {
      const c = v / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    const lum = (c: number[]) => 0.2126 * channel(c[0]!) + 0.7152 * channel(c[1]!) + 0.0722 * channel(c[2]!);
    const ratio = (a: number[], b: number[]) => {
      const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
      return (hi + 0.05) / (lo + 0.05);
    };
    const layers = (s: string) => {
      const out: string[] = [];
      let depth = 0;
      let cur = "";
      for (const ch of s) {
        if (ch === "(") depth++;
        if (ch === ")") depth--;
        if (ch === "," && depth === 0) {
          out.push(cur.trim());
          cur = "";
        } else cur += ch;
      }
      out.push(cur.trim());
      return out;
    };
    const bg = rgb(getComputedStyle(document.body).backgroundColor)[0]!;
    return [...document.querySelectorAll("h1 [data-gradient-text], [data-brand] [data-gradient-text]")].map((el) => {
      const all = layers(getComputedStyle(el).backgroundImage);
      const stops = rgb(all[all.length - 1] ?? ""); // the base gradient; the sheen layer above only brightens
      return { text: el.textContent ?? "", stops: stops.length, min: Math.min(...stops.map((s) => ratio(s, bg))) };
    });
  });
  for (const r of result) {
    expect(r.stops, r.text).toBeGreaterThanOrEqual(3);
    expect(r.min, r.text).toBeGreaterThanOrEqual(3);
  }
});

test("P1-05 the header pairs the approved brand-mark image with the real-text wordmark, and no second logo", async ({
  page,
}) => {
  const header = page.locator("[data-site-header]");
  const brand = header.locator("[data-brand]");
  await expect(brand).toHaveAccessibleName(/تشفير/);
  const imgs = header.locator("img");
  await expect(imgs).toHaveCount(1);
  expect(decodeURIComponent((await imgs.first().getAttribute("src")) ?? "")).toContain("/assets/brand/tashfeer-mark.png");
  await expect(imgs.first()).toHaveAttribute("alt", "شعار تشفير");
  await expect(brand.locator("[data-gradient-text]")).toHaveText("تشفير"); // text, not an image of text
  // side by side: vertically overlapping and close horizontally
  const [img, word] = await Promise.all([imgs.first().boundingBox(), brand.locator("[data-gradient-text]").boundingBox()]);
  expect(img && word).toBeTruthy();
  const gap = Math.max(img!.x - (word!.x + word!.width), word!.x - (img!.x + img!.width));
  expect(gap).toBeLessThan(24);
  expect(Math.min(img!.y + img!.height, word!.y + word!.height) - Math.max(img!.y, word!.y)).toBeGreaterThan(0);
  await expect(header.locator("svg")).toHaveCount(0);
  await expect(page.getByText(/AI\s*DIGITAL\s*FACTORY/i)).toHaveCount(0);
});

test("P1-06 five numbered cards in order, emoji-free, visible and unclipped", async ({ page }) => {
  const cards = page.locator("[data-feature-card]");
  await expect(cards).toHaveCount(5);
  for (let i = 0; i < 5; i++) {
    const n = `0${i + 1}`;
    await expect(cards.nth(i)).toHaveAttribute("data-feature-card", n);
    await expect(cards.nth(i)).toContainText(n);
    await expect(cards.nth(i)).toContainText(FEATURES[i]!);
  }
  expect((await page.locator("[data-scene-part=features]").textContent()) ?? "").not.toMatch(/\p{Extended_Pictographic}/u);

  for (let i = 0; i < 5; i++) {
    await cards.nth(i).scrollIntoViewIfNeeded();
    await expect(cards.nth(i)).toBeVisible();
  }
  const clipped = await cards.evaluateAll((els) => {
    const problems: string[] = [];
    for (const card of els) {
      for (const el of [card, ...card.querySelectorAll("*")]) {
        const r = el.getBoundingClientRect();
        if (r.left < -0.5 || r.right > innerWidth + 0.5) problems.push(`${card.getAttribute("data-feature-card")} off-screen`);
        for (let a = el.parentElement; a; a = a.parentElement) {
          const cs = getComputedStyle(a);
          if (!/hidden|clip|auto|scroll/.test(cs.overflowX + cs.overflowY)) continue;
          const ar = a.getBoundingClientRect();
          if (r.left < ar.left - 0.5 || r.right > ar.right + 0.5 || r.top < ar.top - 0.5 || r.bottom > ar.bottom + 0.5)
            problems.push(`${card.getAttribute("data-feature-card")} clipped by ${a.tagName}.${a.className}`);
        }
      }
    }
    return [...new Set(problems)];
  });
  expect(clipped).toEqual([]);
});

test("P1-07 no horizontal overflow: document, sections, and every element inside the viewport", async ({ page }) => {
  // Sections = header/main/section/footer (the criterion's scope). Grid cells inside the scene may bleed on purpose
  // (the seated customer reaches the screen edge, the cards' arc leans toward the ring) — the per-element check
  // below proves that nothing, bleeding or not, leaves the viewport.
  const result = await page.evaluate(() => {
    const doc = document.documentElement;
    const overflow: string[] = [];
    if (doc.scrollWidth > doc.clientWidth) overflow.push(`document ${doc.scrollWidth}>${doc.clientWidth}`);
    for (const el of document.querySelectorAll<HTMLElement>("header, main, section, footer")) {
      if (el.scrollWidth > el.clientWidth + 0.5) overflow.push(`${el.tagName}.${el.className} ${el.scrollWidth}>${el.clientWidth}`);
    }
    // every element's *visible* part (its box clipped by any ancestor that clips horizontally) stays in the viewport
    const outside: string[] = [];
    for (const el of document.body.querySelectorAll("*")) {
      if (el.closest("[data-ambient-background], .sr-only, .skip-link")) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      let left = r.left;
      let right = r.right;
      for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
        if (getComputedStyle(a).overflowX === "visible") continue;
        const ar = a.getBoundingClientRect();
        left = Math.max(left, ar.left);
        right = Math.min(right, ar.right);
      }
      if (right <= left) continue; // fully clipped
      if (left < -1 || right > innerWidth + 1) outside.push(`${el.tagName}.${el.className} [${left.toFixed(0)}, ${right.toFixed(0)}]`);
    }
    window.scrollTo(10_000, window.scrollY);
    return { overflow, outside, scrolledX: window.scrollX };
  });
  expect(result).toEqual({ overflow: [], outside: [], scrolledX: 0 });
});

test("P1-08 on wide screens the scene spans ≥ 80% of the window, without empty side bands", async ({ page }, info) => {
  test.skip(!isWide(info), "wide screens only (1920, 2560)");
  const { left, right, vw } = await page.evaluate(() => {
    const rs = [...document.querySelectorAll("[data-scene-part]")]
      .map((el) => el.getBoundingClientRect())
      .filter((r) => r.width > 0);
    return { left: Math.min(...rs.map((r) => r.left)), right: Math.max(...rs.map((r) => r.right)), vw: innerWidth };
  });
  info.annotations.push({ type: "coverage", description: `${(((right - left) / vw) * 100).toFixed(1)}% (margins ${left.toFixed(0)} / ${(vw - right).toFixed(0)} px)` });
  expect((right - left) / vw).toBeGreaterThanOrEqual(0.8);
  expect(left / vw).toBeLessThanOrEqual(0.1);
  expect((vw - right) / vw).toBeLessThanOrEqual(0.1);
});

test("P1-09 visible text: controls ≥ 12 px, paragraphs ≥ 14 px, nothing smaller than 12 px", async ({ page }) => {
  const texts = await page.evaluate(() => {
    const out: Array<{ text: string; size: number; para: boolean }> = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const text = n.textContent?.trim();
      const el = n.parentElement;
      if (!text || !el || el.closest(".sr-only, script, style, noscript, [data-ambient-background]")) continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      const r = range.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (r.width < 1 || r.height < 1 || cs.visibility === "hidden") continue;
      out.push({ text: text.slice(0, 32), size: Number.parseFloat(cs.fontSize), para: Boolean(el.closest("p")) });
    }
    for (const field of document.querySelectorAll("textarea, input")) {
      out.push({ text: `<${field.tagName.toLowerCase()}>`, size: Number.parseFloat(getComputedStyle(field).fontSize), para: false });
    }
    return out;
  });
  expect(texts.length).toBeGreaterThan(20);
  expect(texts.filter((t) => t.size < 12 || (t.para && t.size < 14))).toEqual([]);
});

test("P1-16 ambient phrases never overlap the headline, chat, cards, header, controls or characters", async ({ page }) => {
  // Margins = full travel of a phrase plus 4 px of air: ±6 px horizontal parallax; vertically ±3.6 px parallax
  // and the 6 px fade-in offset (a phrase measured now may sit 6 px higher or lower in its other state).
  const hits = await page.evaluate(() => {
    const MX = 10;
    const MY = 14;
    const phrases = [...document.querySelectorAll<HTMLElement>("[data-phrase-index]")]
      .map((el) => ({ i: el.dataset.phraseIndex, r: el.getBoundingClientRect() }))
      .filter((p) => p.r.width > 0);
    const guarded = [
      "h1[data-hero-headline]",
      "[data-chat-shell]",
      "[data-feature-card]",
      "[data-site-header]",
      "button",
      "a[href]:not(.skip-link)",
      "textarea",
      "[data-scene-part='copy'] p",
      "[data-tashfeer]",
      "[data-scene-part='customer'] img",
    ];
    const out: string[] = [];
    for (const sel of guarded) {
      for (const el of document.querySelectorAll(sel)) {
        const t = el.getBoundingClientRect();
        if (t.width === 0 || t.height === 0) continue;
        for (const p of phrases) {
          if (p.r.left - MX < t.right && p.r.right + MX > t.left && p.r.top - MY < t.bottom && p.r.bottom + MY > t.top)
            out.push(`phrase ${p.i} × ${sel}`);
        }
      }
    }
    return [...new Set(out)];
  });
  expect(hits).toEqual([]);
});

test("the owner's ring is what renders, and nothing important sits on it or on the chat", async ({ page }) => {
  // Sample the real ring alpha under points on each element's outline. The chat content and the cards are drawn above
  // the ring: they must stay off its band (> 50 % opaque). Phrases are drawn below it: they must stay out of its glow
  // (> 30 %). Tashfeer, the customer and the voice pill must not cover any chat control.
  const result = await page.evaluate(async (ringSrc) => {
    const ringEl = document.querySelector<HTMLImageElement>("img[data-portal-ring]")!;
    const box = ringEl.getBoundingClientRect();
    const src = new Image();
    src.src = ringSrc;
    await src.decode();
    const canvas = document.createElement("canvas");
    canvas.width = src.naturalWidth;
    canvas.height = src.naturalHeight;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(src, 0, 0);
    const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const alphaAt = (x: number, y: number) => {
      const u = Math.floor(((x - box.left) / box.width) * width);
      const v = Math.floor(((y - box.top) / box.height) * height);
      if (box.width === 0 || u < 0 || v < 0 || u >= width || v >= height) return 0;
      return data[(v * width + u) * 4 + 3]! / 255;
    };
    const chat = "[data-chat-shell]";
    const field = document.querySelector(`${chat} textarea`)?.parentElement ?? null;
    const controls = [
      ...document.querySelectorAll(`${chat} h2, ${chat} [role=log], ${chat} [role=log] > *, ${chat} p, ${chat} button`),
      ...(field ? [field] : []),
    ].filter((el) => getComputedStyle(el).display !== "none");
    const rules: Array<[string, Element[], number]> = [
      ["chat control", controls, 0.5],
      ["card", [...document.querySelectorAll("[data-feature-card] > *")], 0.5],
      ["phrase", [...document.querySelectorAll("[data-phrase-index]")], 0.3],
    ];
    const out: string[] = [];
    for (const [what, els, max] of rules) {
      for (const el of els) {
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) continue;
        const i = Math.min(4, r.width / 2, r.height / 2); // stay inside rounded corners
        const xs = [r.left + i, r.left + r.width / 4, r.left + r.width / 2, r.right - r.width / 4, r.right - i];
        const ys = [r.top + i, r.top + r.height / 2, r.bottom - i];
        const worst = Math.max(...xs.flatMap((x) => ys.map((y) => alphaAt(x, y))));
        if (worst > max) out.push(`${what} "${(el.textContent ?? "").trim().slice(0, 18)}" on ring alpha ${worst.toFixed(2)}`);
      }
    }
    const people = ["[data-tashfeer]", "[data-seated-customer]", "[data-scene-part=customer] button"];
    for (const sel of people) {
      const p = document.querySelector(sel)?.getBoundingClientRect();
      if (!p) continue;
      for (const c of controls) {
        const q = c.getBoundingClientRect();
        if (p.left < q.right && p.right > q.left && p.top < q.bottom && p.bottom > q.top)
          out.push(`${sel} covers chat control "${(c.textContent ?? "").trim().slice(0, 18)}"`);
      }
    }
    return { out, loaded: ringEl.complete && ringEl.naturalWidth > 0, current: decodeURIComponent(ringEl.currentSrc) };
  }, RING_SRC);
  expect(result.loaded).toBe(true);
  expect(result.current).toContain(RING_SRC);
  expect(result.out).toEqual([]);
});

test("the portal's glow is never cut inside the screen", async ({ page }) => {
  // The ring's glow may fade off the screen's edge, but a box that clips it must clip at that edge: a clip inside the
  // screen draws a hard straight line through the glow (it once sat 12 px inside a phone's edges).
  const cuts = await page.evaluate(() => {
    const ring = document.querySelector("img[data-portal-ring]")!;
    const r = ring.getBoundingClientRect();
    const out: string[] = [];
    for (let a = ring.parentElement; a && a !== document.documentElement; a = a.parentElement) {
      if (getComputedStyle(a).overflowX === "visible") continue;
      const b = a.getBoundingClientRect();
      const name = `${a.tagName}.${a.className}`;
      if (r.left < b.left - 0.5 && b.left > 0.5) out.push(`${name} cuts the glow at x=${b.left.toFixed(1)}`);
      if (r.right > b.right + 0.5 && b.right < innerWidth - 0.5) out.push(`${name} cuts the glow at x=${b.right.toFixed(1)}`);
    }
    return out;
  });
  expect(cuts).toEqual([]);
});

test("clip-to-text lettering paints every glyph whole, Arabic dots and hamza included", async ({ page }) => {
  // A clip-to-text fill is painted only inside the element's box, and Arabic ink reaches past a tight line box (the
  // dots under ي fall 0.47 em under the baseline): they vanished once («تشفىر», «أبنى»). Measure each element's real
  // ink with its own font and require its box to contain it.
  const result = await page.evaluate(async () => {
    await document.fonts.ready;
    const ctx = document.createElement("canvas").getContext("2d")!;
    const K = 10; // canvas metrics are whole pixels: measure at 10× and scale down
    // an empty inline-block sits on its line's baseline (its bottom edge); first and last line
    const baseline = (el: HTMLElement, atStart: boolean) => {
      const probe = document.createElement("span");
      probe.style.cssText = "display:inline-block;inline-size:0;block-size:0";
      if (atStart) el.prepend(probe);
      else el.append(probe);
      const y = probe.getBoundingClientRect().bottom;
      probe.remove();
      return y;
    };
    const out: string[] = [];
    let checked = 0;
    for (const el of document.body.querySelectorAll<HTMLElement>("*")) {
      const cs = getComputedStyle(el);
      if (!`${cs.getPropertyValue("background-clip")} ${cs.getPropertyValue("-webkit-background-clip")}`.includes("text")) continue;
      const text = (el.textContent ?? "").trim();
      if (!text || el.getBoundingClientRect().width === 0) continue;
      if (/flex|grid/.test(cs.display)) {
        out.push(`"${text.slice(0, 24)}": ${cs.display} lettering cannot be measured`);
        continue;
      }
      ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${Number.parseFloat(cs.fontSize) * K}px ${cs.fontFamily}`;
      ctx.direction = cs.direction === "rtl" ? "rtl" : "ltr";
      const m = ctx.measureText(text);
      const inkTop = baseline(el, true) - m.actualBoundingBoxAscent / K;
      const inkBottom = baseline(el, false) + m.actualBoundingBoxDescent / K;
      const box = el.getBoundingClientRect();
      checked++;
      if (inkTop < box.top - 0.25 || inkBottom > box.bottom + 0.25)
        out.push(`"${text.slice(0, 24)}": ink ${inkTop.toFixed(1)}–${inkBottom.toFixed(1)}, painted ${box.top.toFixed(1)}–${box.bottom.toFixed(1)}`);
    }
    return { out, checked };
  });
  expect(result.checked).toBeGreaterThanOrEqual(10); // wordmark, 4 headline lines, 5 phrases (+ the cards' digits)
  expect(result.out).toEqual([]);
});

test("the portal with its chat is the dominant element of the first screen", async ({ page }) => {
  const areas = await page.evaluate(() => {
    const area = (sel: string) => {
      const r = document.querySelector(sel)?.getBoundingClientRect();
      return r ? r.width * r.height : 0;
    };
    const chat = document.querySelector("[data-chat-shell]")!.getBoundingClientRect();
    const portal = document.querySelector("[data-portal]")!.getBoundingClientRect();
    const header = document.querySelector("[data-site-header]")!.getBoundingClientRect();
    return {
      portal: area("[data-portal]"),
      robot: area("[data-tashfeer]"),
      customer: area("[data-seated-customer]"),
      headline: area("[data-hero-headline]"),
      chatInsidePortal:
        chat.left >= portal.left && chat.right <= portal.right && chat.top >= portal.top && chat.bottom <= portal.bottom,
      // the ring's band (the portal box) is whole on the first screen: not cropped by the screen or the header
      portalWhole:
        portal.left >= 0 && portal.right <= innerWidth && portal.top >= header.bottom - 1 && portal.bottom <= innerHeight,
    };
  });
  expect(areas.chatInsidePortal).toBe(true);
  expect(areas.portalWhole).toBe(true);
  for (const other of ["robot", "customer", "headline"] as const) {
    expect(areas.portal, `portal vs ${other}`).toBeGreaterThan(1.5 * areas[other]);
  }
});

test("narrow screens lead with the portal: portal → Tashfeer & customer → headline → text → cards", async ({ page }, info) => {
  test.skip((info.project.use.viewport?.width ?? 0) >= 900, "stacked layout is below 900 px");
  const tops = await page.evaluate(() => {
    const top = (sel: string) => document.querySelector(sel)!.getBoundingClientRect().top + scrollY;
    const bottom = (sel: string) => document.querySelector(sel)!.getBoundingClientRect().bottom + scrollY;
    const right = (sel: string) => document.querySelector(sel)!.getBoundingClientRect().right;
    return {
      header: bottom("[data-site-header]"),
      portal: top("[data-portal]"),
      portalBottom: bottom("[data-portal]"),
      robot: top("[data-tashfeer]"),
      customer: top("[data-scene-part=customer]"),
      headline: top("[data-hero-headline]"),
      headlineRight: right("[data-hero-headline]"),
      lede: top("[data-scene-part=copy] [class*=lede]"),
      ledeRight: right("[data-scene-part=copy] [class*=lede]"),
      features: top("[data-scene-part=features]"),
    };
  });
  expect(tops.portal - tops.header, "the portal comes right after the header").toBeLessThan(40);
  // the characters are arranged around the portal's lower half, before the copy
  expect(Math.min(tops.robot, tops.customer)).toBeGreaterThanOrEqual(tops.portal + (tops.portalBottom - tops.portal) / 2 - 1);
  expect(Math.max(tops.robot, tops.customer)).toBeLessThan(tops.headline);
  // the headline is read before the paragraphs: above them, or (600–899, two columns) level with them on the right
  if (tops.ledeRight < tops.headlineRight - 40) expect(Math.abs(tops.headline - tops.lede)).toBeLessThan(2);
  else expect(tops.headline).toBeLessThan(tops.lede);
  expect(tops.lede).toBeLessThan(tops.features);
});
