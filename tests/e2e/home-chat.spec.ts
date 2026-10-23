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
    return {
      log: { bottom: log.bottom, height: log.height },
      bubble: { bottom: bubble.bottom, height: bubble.height },
      field: { width: field.width, height: field.height },
      tools: tools.map((t) => ({ width: t.width, height: t.height })),
      enter: { width: enter.width, height: enter.height },
    };
  });
  // the welcome message fits whole (it was cut off when the conversation had 15 % of the ring's height)…
  expect(r.bubble.bottom).toBeLessThanOrEqual(r.log.bottom + 0.5);
  // …and the conversation keeps room for the replies
  expect(r.log.height).toBeGreaterThanOrEqual(1.4 * r.bubble.height);
  // the text field is the largest control; the attachment types are small round icons, «ادخل» a compact button
  expect(r.tools).toHaveLength(5);
  for (const t of r.tools) {
    expect(t.width).toBeLessThanOrEqual(40);
    expect(Math.abs(t.width - t.height)).toBeLessThanOrEqual(1);
  }
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
  // the conversation and the field: one comfortable size, 14–15 px whatever the portal's size (it scaled to 18.9 px)
  expect(r.message).toBeGreaterThanOrEqual(14);
  expect(r.message).toBeLessThanOrEqual(15);
  expect(r.field).toBe(r.message);
  expect(r.lineHeight).toBeGreaterThanOrEqual(1.5);
  // secondary copy is smaller than the message, and never below the 12 px minimum
  for (const secondary of [r.enter, r.note]) {
    expect(secondary).toBeLessThan(r.message);
    expect(secondary).toBeGreaterThanOrEqual(12);
  }
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

test("wide desktops: the portal takes the screen's height (≥ 87.5 %), whole under the header, on one screen", async ({ page }, info) => {
  test.skip((info.project.use.viewport?.width ?? 0) < 1440, "wide desktops (≥ 1440 px)");
  const r = await page.evaluate(() => {
    const p = document.querySelector("[data-portal]")!.getBoundingClientRect();
    const header = document.querySelector("[data-site-header]")!.getBoundingClientRect();
    return { height: p.height, top: p.top, bottom: p.bottom, headerBottom: header.bottom, vh: innerHeight, docH: document.documentElement.scrollHeight };
  });
  expect(r.height / r.vh).toBeGreaterThanOrEqual(0.875);
  expect(r.top).toBeGreaterThanOrEqual(r.headerBottom - 1);
  expect(r.bottom).toBeLessThanOrEqual(r.vh);
  expect(r.docH, "nothing scrolls").toBe(r.vh);
});
