import { expect, test } from "@playwright/test";
import { hasMousePointer, openHome } from "./support";

/*
 * Owner's corrections of 2026-10-23: the chat inside the portal as a modern messaging interface — the conversation
 * takes most of the height, compact controls, a compact type hierarchy that does not grow with the portal, the avatar
 * alone in the header, the preview status explained where it is needed instead of as a label — and a larger portal on
 * wide desktops.
 */

const NOTE = "معاينة تصميم: الإرسال والمرفقات والصوت غير مفعّلة بعد.";

test.beforeEach(async ({ page }) => {
  await openHome(page);
});

test("the conversation has room: the welcome message is whole, with space left for replies; the controls are compact", async ({
  page,
}) => {
  const r = await page.evaluate(() => {
    const chat = document.querySelector("[data-chat-shell]")!;
    const box = (el: Element) => el.getBoundingClientRect();
    const log = box(chat.querySelector("[role=log]")!);
    const bubble = box(chat.querySelector("[role=log] p")!);
    const field = box(chat.querySelector("textarea")!.parentElement!);
    const tools = [...chat.querySelectorAll("[role=group] button")].map(box);
    const enter = box([...chat.querySelectorAll("button")].find((b) => b.textContent!.trim() === "ادخل")!);
    const mic = box(chat.querySelector("textarea")!.parentElement!.querySelector("button")!);
    return {
      log: { bottom: log.bottom, height: log.height },
      bubble: { bottom: bubble.bottom, height: bubble.height },
      field: { width: field.width, height: field.height },
      tools: tools.map((t) => ({ width: t.width, height: t.height })),
      enter: { width: enter.width, height: enter.height },
      mic: { width: mic.width, height: mic.height },
    };
  });
  // the welcome message fits whole (it was cut off when the conversation had 15 % of the ring's height)…
  expect(r.bubble.bottom).toBeLessThanOrEqual(r.log.bottom + 0.5);
  // …and the conversation keeps room for the replies
  expect(r.log.height).toBeGreaterThanOrEqual(1.4 * r.bubble.height);
  // the text field is the largest control; the attachment types are small round icons (≤ 30 px, as in a messaging
  // app, however large the portal), the microphone a proportionate round button, «ادخل» a compact button
  expect(r.tools).toHaveLength(5);
  for (const t of r.tools) {
    expect(t.width).toBeLessThanOrEqual(30);
    expect(Math.abs(t.width - t.height)).toBeLessThanOrEqual(1);
  }
  expect(r.mic.width).toBeLessThanOrEqual(32);
  expect(Math.abs(r.mic.width - r.mic.height)).toBeLessThanOrEqual(1);
  expect(r.field.height).toBeGreaterThan(r.mic.height);
  expect(r.field.width).toBeGreaterThan(3 * r.tools[0]!.width);
  expect(r.enter.height).toBeLessThanOrEqual(36);
  expect(r.enter.width).toBeLessThan(r.field.width / 2);
});

test("the chat header is the avatar alone (32–40 px): no name or status label shown, both still announced", async ({ page }) => {
  const r = await page.evaluate(() => {
    const chat = document.querySelector("[data-chat-shell]")!;
    const avatar = chat.querySelector("[data-chat-avatar]")!.getBoundingClientRect();
    // what is rendered for the eye: a real box, not hidden, not clipped away (visually hidden text is a 1 px box
    // clipped to nothing) — judged on the element and its ancestors, not on class names
    const shown = (el: Element) => {
      for (let a: Element | null = el; a && a !== chat; a = a.parentElement) {
        const cs = getComputedStyle(a);
        const b = a.getBoundingClientRect();
        if (cs.display === "none" || cs.visibility === "hidden" || b.width <= 1 || b.height <= 1) return false;
        if (/inset\(50%/.test(cs.clipPath) || /rect\(0(px)?,? 0(px)?,? 0(px)?,? 0(px)?\)/.test(cs.clip)) return false;
      }
      return true;
    };
    const visibleTexts = [...chat.querySelectorAll("*")]
      .filter((el) => el.childElementCount === 0 && el.textContent!.trim() && shown(el))
      .map((el) => el.textContent!.trim());
    return {
      avatar: { width: avatar.width, height: avatar.height },
      visibleTexts,
      status: chat.querySelector("[data-chat-status]")?.textContent,
      statusShown: shown(chat.querySelector("[data-chat-status]")!),
    };
  });
  expect(r.avatar.width).toBeGreaterThanOrEqual(32);
  expect(r.avatar.width).toBeLessThanOrEqual(40);
  expect(r.avatar.height).toBe(r.avatar.width);
  // the chat no longer prints «تشفير» beside the avatar (the site header keeps the brand name)…
  expect(r.visibleTexts).not.toContain("تشفير");
  await expect(page.locator("[data-site-header] [data-brand]")).toHaveText("تشفير");
  // …nor a "disabled" label before the chat is used
  expect(r.visibleTexts.filter((t) => t.includes("غير مفعّل"))).toEqual([]);
  expect(r.statusShown).toBe(false);
  // both remain for assistive technology: the region is named by its (visually hidden) heading, the status is read out
  await expect(page.getByRole("region", { name: "تشفير" })).toHaveAttribute("data-chat-shell", "");
  expect(r.status).toBe("معاينة تصميم — غير مفعّل");
});

test("chat typography: a compact messaging hierarchy that does not grow with the portal", async ({ page }) => {
  // show the explanation line too: it is the secondary copy that appears when the chat is used
  await page.locator("[data-chat-shell] textarea").focus();
  await expect(page.locator("[data-chat-shell]").getByRole("status")).toHaveText(NOTE);
  const r = await page.evaluate(() => {
    const chat = document.querySelector("[data-chat-shell]")!;
    const size = (el: Element) => Number.parseFloat(getComputedStyle(el).fontSize);
    const bubble = chat.querySelector("[role=log] p")!;
    return {
      message: size(bubble),
      lineHeight: Number.parseFloat(getComputedStyle(bubble).lineHeight) / size(bubble),
      field: size(chat.querySelector("textarea")!),
      enter: size([...chat.querySelectorAll("button")].find((b) => b.textContent!.trim() === "ادخل")!),
      note: size(chat.querySelector("[role=status]")!),
    };
  });
  // the conversation and the field: one size, 14 px whatever the portal's size (it scaled to 18.9 px; 14 px is the
  // paragraph minimum of P1-09), with a balanced line height
  expect(r.message).toBe(14);
  expect(r.field).toBe(r.message);
  expect(r.lineHeight).toBeGreaterThanOrEqual(1.5);
  expect(r.lineHeight).toBeLessThanOrEqual(1.6);
  // secondary copy is smaller than the message: 12 px, the minimum for controls
  for (const secondary of [r.enter, r.note]) expect(secondary).toBe(12);
});

test("the whole chat sits inside the portal's opening: every part keeps ≥ 12 px of air from the ring's band", async ({ page }) => {
  // the owner's reference portal (2026-10-24): the band is where the ring image is at least 50 % opaque, read on the
  // image itself at its rendered size; the avatar, the message, the field, each attachment icon and «ادخل» — with the
  // explanation line shown too — keep 12 px of air from it all round
  await page.locator("[data-chat-shell] textarea").focus();
  await expect(page.locator("[data-chat-shell]").getByRole("status")).toHaveText(NOTE);
  const worst = await page.evaluate(async () => {
    const img = document.querySelector<HTMLImageElement>("img[data-portal-ring]")!;
    const ib = img.getBoundingClientRect();
    const W = Math.round(ib.width);
    const H = Math.round(ib.height);
    const im = new Image();
    im.src = img.currentSrc || img.src;
    await im.decode();
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const g = c.getContext("2d", { willReadFrequently: true })!;
    g.drawImage(im, 0, 0, W, H);
    const A = g.getImageData(0, 0, W, H).data;
    const alpha = (x: number, y: number) => {
      const ix = Math.round(x - ib.left);
      const iy = Math.round(y - ib.top);
      return ix < 0 || iy < 0 || ix >= W || iy >= H ? 0 : A[(iy * W + ix) * 4 + 3]! / 255;
    };
    const chat = document.querySelector("[data-chat-shell]")!;
    const parts: Record<string, Element[]> = {
      avatar: [chat.querySelector("[data-chat-avatar]")!],
      message: [chat.querySelector("[role=log] p")!],
      note: [chat.querySelector("[role=status]")!],
      field: [chat.querySelector("textarea")!.parentElement!],
      tools: [...chat.querySelectorAll("[role=group] button")],
      enter: [[...chat.querySelectorAll("button")].find((b) => b.textContent!.trim() === "ادخل")!],
    };
    const out: Record<string, number> = {};
    for (const [name, els] of Object.entries(parts)) {
      let max = 0;
      for (const el of els) {
        const b = el.getBoundingClientRect();
        for (let y = b.top - 12; y <= b.bottom + 12; y += 2)
          for (let x = b.left - 12; x <= b.right + 12; x += 2) max = Math.max(max, alpha(x, y));
      }
      out[name] = Math.round(max * 100) / 100;
    }
    return out;
  });
  for (const [name, a] of Object.entries(worst)) expect(a, `${name}: the ring's opacity within 12 px`).toBeLessThan(0.5);
});

test("pressing a control that is not enabled yet explains it in the conversation; nothing is sent", async ({ page }, info) => {
  const chat = page.locator("[data-chat-shell]");
  const note = chat.getByRole("status");
  await expect(note).toHaveCount(0);
  // a real press on «ادخل»: the mouse, or a tap on touch-only phones
  const enter = chat.getByRole("button", { name: "ادخل" });
  const b = (await enter.boundingBox())!;
  if (hasMousePointer(info)) await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  else await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
  await expect(note).toHaveText(NOTE);
  await expect(enter).toBeDisabled();
  // the conversation holds the welcome and the explanation, nothing else
  await expect(chat.locator("[role=log] > *")).toHaveCount(2);
});

test("keyboard: an attachment type is reachable and, pressed, explains instead of opening anything", async ({ page }) => {
  const chat = page.locator("[data-chat-shell]");
  const images = chat.getByRole("button", { name: "صور" });
  await images.focus();
  await expect(images).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(chat.getByRole("status")).toHaveText(NOTE);
  await expect(images).toBeDisabled();
  await expect(chat.locator("[role=log] > *")).toHaveCount(2);
});

test("wide desktops: the portal is as large as the screen allows, whole under the header, on one screen", async ({ page }, info) => {
  const vw = info.project.use.viewport?.width ?? 0;
  test.skip(vw < 1440, "wide desktops (≥ 1440 px)");
  const r = await page.evaluate(() => {
    const p = document.querySelector("[data-portal]")!.getBoundingClientRect();
    const header = document.querySelector("[data-site-header]")!.getBoundingClientRect();
    const copy = document.querySelector("[data-scene-part=copy]")!.getBoundingClientRect();
    const steps = document.querySelector("[data-scene-part=features]")!.getBoundingClientRect();
    return {
      height: p.height,
      top: p.top,
      bottom: p.bottom,
      headerBottom: header.bottom,
      vh: innerHeight,
      docH: document.documentElement.scrollHeight,
      copyW: copy.width,
      stepsW: steps.width,
    };
  });
  // limited by the screen's height (≥ 87.5 % of it, 1920 and 2560) — or, where the owner's wide reference portal meets
  // the copy and the steps first (1440), by the width: the copy column and the steps are then at their minimum widths
  // (HomeScene.module.css: --copy-min, --cards-min), so nothing is left to give the portal
  const copyMin = Math.min(470, Math.max(330, 0.26 * vw));
  const heightBound = r.height / r.vh >= 0.875;
  const widthBound = Math.abs(r.copyW - copyMin) <= 1 && Math.abs(r.stepsW - 216) <= 1;
  expect(heightBound || widthBound, JSON.stringify(r)).toBe(true);
  if (vw >= 1920) expect(r.height / r.vh).toBeGreaterThanOrEqual(0.875);
  expect(r.top).toBeGreaterThanOrEqual(r.headerBottom - 1);
  expect(r.bottom).toBeLessThanOrEqual(r.vh);
  expect(r.docH, "nothing scrolls").toBe(r.vh);
});
