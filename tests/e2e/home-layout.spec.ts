import { expect, test } from "@playwright/test";
import { FEATURES, openHome } from "./support";

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
    const outside: string[] = [];
    for (const el of document.body.querySelectorAll("*")) {
      if (el.closest("[data-ambient-background], .sr-only, .skip-link")) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      if (r.left < -1 || r.right > innerWidth + 1) outside.push(`${el.tagName}.${el.className} [${r.left.toFixed(0)}, ${r.right.toFixed(0)}]`);
    }
    window.scrollTo(10_000, window.scrollY);
    return { overflow, outside, scrolledX: window.scrollX };
  });
  expect(result).toEqual({ overflow: [], outside: [], scrolledX: 0 });
});

test("P1-08 on wide screens the scene spans ≥ 80% of the window, without empty side bands", async ({ page }, info) => {
  test.skip(!["wide-1920", "ultrawide-2560"].includes(info.project.name), "wide screens only (1920, 2560)");
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

test("the portal ring never covers the chat's content, the numbered cards or the phrases", async ({ page }) => {
  // The ring art is drawn above the chat (and below the cards). Sample the real ring alpha under points on every
  // element's outline; > 30% opacity there means the element is hidden by — or drawn over — the visible ring.
  const covered = await page.evaluate(async () => {
    const ringEl = document.querySelector<HTMLImageElement>("img[data-portal-ring]")!;
    const box = ringEl.getBoundingClientRect();
    const src = new Image();
    src.src = "/assets/portal/ring.webp";
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
    const targets: Array<[string, Element]> = [];
    for (const sel of [`${chat} h2`, `${chat} [role=log] > *`, `${chat} p`, `${chat} button`, "[data-feature-card] > *", "[data-phrase-index]"]) {
      for (const el of document.querySelectorAll(sel)) targets.push([sel, el]);
    }
    const field = document.querySelector(`${chat} textarea`)?.parentElement;
    if (field) targets.push([`${chat} input row`, field]);
    const out: string[] = [];
    for (const [sel, el] of targets) {
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      const i = Math.min(4, r.width / 2, r.height / 2); // stay inside rounded corners
      const xs = [r.left + i, r.left + r.width / 4, r.left + r.width / 2, r.right - r.width / 4, r.right - i];
      const ys = [r.top + i, r.top + r.height / 2, r.bottom - i];
      const worst = Math.max(...xs.flatMap((x) => ys.map((y) => alphaAt(x, y))));
      if (worst > 0.3) out.push(`${sel} "${(el.textContent ?? "").trim().slice(0, 18)}" ring alpha ${worst.toFixed(2)}`);
    }
    return out;
  });
  expect(covered).toEqual([]);
});
