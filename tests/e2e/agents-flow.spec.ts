import { expect, test, type Page } from "@playwright/test";
import { hasMousePointer, openHome } from "./support";

/*
 * Screen 1 → screen 2: «ادخل» opens «تحليل وبناء فكرة العميل» with the idea and the attachments; the team is chosen
 * on a curved strip (drag, arrows, keyboard) and kept with the project; back to the idea keeps everything.
 */

const IDEA = "أبي تطبيق حجز مواعيد لعيادتي، يدفع فيه العملاء مسبقًا";

async function toAgents(page: Page) {
  await openHome(page);
  const chat = page.locator("[data-chat-shell]");
  await chat.getByLabel("وصف المشروع").fill(IDEA);
  await chat.getByRole("button", { name: "ادخل" }).click();
  await expect(page).toHaveURL(/\/agents$/);
  await page.locator("[data-agents-screen]").waitFor();
}

const team = (page: Page) =>
  page.evaluate(() => [...document.querySelectorAll<HTMLElement>("[data-agent-card][data-selected]")].map((e) => e.dataset.agentCard));

test("«ادخل» carries the idea to the agents screen: summary, suggested team and a correct count", async ({ page }) => {
  await toAgents(page);
  const summary = page.locator("[data-project-summary]");
  await expect(summary).toContainText(IDEA);
  await expect(summary.locator("[data-summary-source]")).toHaveAttribute("data-summary-source", "idea");
  await expect(summary).toContainText("لا يوجد ذكاء اصطناعي متصل");
  await expect(summary).toContainText("تطبيق");
  // an app with customers' payments: the core team + security + performance — all twelve
  const suggested = await page.locator("[data-agent-card][data-suggested]").count();
  expect(suggested).toBe(12);
  expect(await team(page)).toHaveLength(12);
  await expect(page.locator("[data-team-count]")).toHaveText("12 وكيلًا مختارًا");
  // Tashfeer whole, no portal on this screen
  await expect(page.locator("[data-tashfeer]")).toBeVisible();
  await expect(page.locator("[data-portal]")).toHaveCount(0);
});

test("select and deselect: the counter follows; «تأكيد الفريق» is disabled at zero; confirming does not claim production", async ({ page }) => {
  await toAgents(page);
  await page.locator("[data-select-none]").click();
  await expect(page.locator("[data-team-count]")).toHaveText("لم يُختر أي وكيل");
  await expect(page.locator("[data-confirm-team]")).toBeDisabled();
  const center = page.locator("[data-agent-card]").nth(Number(await page.locator("[data-agent-carousel]").getAttribute("data-center")));
  await center.click();
  await expect(page.locator("[data-team-count]")).toHaveText("وكيل واحد مختار");
  await page.getByRole("button", { name: "الوكيل التالي" }).click();
  await page.waitForTimeout(450);
  const c2 = Number(await page.locator("[data-agent-carousel]").getAttribute("data-center"));
  await page.locator("[data-agent-card]").nth(c2).click();
  await expect(page.locator("[data-team-count]")).toHaveText("وكيلان مختاران");
  await page.locator("[data-agent-card]").nth(c2).click();
  await expect(page.locator("[data-team-count]")).toHaveText("وكيل واحد مختار");
  await page.locator("[data-select-suggested]").click();
  await expect(page.locator("[data-team-count]")).toHaveText("12 وكيلًا مختارًا");
  await page.locator("[data-confirm-team]").click();
  await expect(page.locator("[data-team-confirmed]")).toContainText("لم يبدأ أي إنتاج");
});

test("dragging moves the strip and never toggles an agent; arrows and keys move it too", async ({ page }, info) => {
  await toAgents(page);
  const strip = page.locator("[data-agent-carousel]");
  const before = await team(page);
  const c0 = Number(await strip.getAttribute("data-center"));
  const card = page.locator("[data-agent-card]").nth(c0);
  const b = (await card.boundingBox())!;
  const y = b.y + b.height / 2;
  if (hasMousePointer(info)) {
    // right-to-left: pulling rightwards brings the next agents in
    await page.mouse.move(b.x + b.width / 2, y);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) await page.mouse.move(b.x + b.width / 2 + i * 40, y);
    await page.mouse.up();
  } else {
    const cdp = await page.context().newCDPSession(page);
    const pt = (x: number) => [{ x, y }];
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pt(b.x + b.width / 2) });
    for (let i = 1; i <= 10; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: pt(b.x + b.width / 2 + i * 30) });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  }
  await page.waitForTimeout(500);
  const c1 = Number(await strip.getAttribute("data-center"));
  expect(c1, "the drag moved the strip").toBeGreaterThan(c0);
  expect(await team(page), "a drag is not a click").toEqual(before);
  // keyboard (right-to-left: ← is the next agent)
  await page.locator("[data-agent-card]").nth(c1).focus();
  await page.keyboard.press("ArrowLeft");
  await expect(strip).toHaveAttribute("data-center", String(c1 + 1));
  await page.keyboard.press("Home");
  await expect(strip).toHaveAttribute("data-center", "0");
  await page.getByRole("button", { name: "الوكيل التالي" }).click();
  await expect(strip).toHaveAttribute("data-center", "1");
});

test("the project survives navigation and a reload: back to the idea keeps the text; the team stays chosen", async ({ page }) => {
  await toAgents(page);
  await page.locator("[data-select-none]").click();
  const c = Number(await page.locator("[data-agent-carousel]").getAttribute("data-center"));
  await page.locator("[data-agent-card]").nth(c).click();
  const chosen = await team(page);
  expect(chosen).toHaveLength(1);
  await page.reload();
  await page.locator("[data-agents-screen]").waitFor();
  await expect.poll(() => team(page)).toEqual(chosen);
  await page.locator("[data-back-to-idea]").click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator("[data-chat-shell]").getByLabel("وصف المشروع")).toHaveValue(IDEA);
  await page.locator("[data-chat-shell]").getByRole("button", { name: "ادخل" }).click();
  await expect(page).toHaveURL(/\/agents$/);
  await expect.poll(() => team(page)).toEqual(chosen);
});

test("the strip's cards stay clear of the summary and of Tashfeer; nothing scrolls sideways", async ({ page }) => {
  await toAgents(page);
  const r = await page.evaluate(() => {
    const track = document.querySelector("[data-agent-carousel] [role=group]")!.getBoundingClientRect();
    const box = (s: string) => document.querySelector(s)!.getBoundingClientRect();
    const overlap = (a: DOMRect, b: DOMRect) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    return {
      summary: overlap(track, box("[data-project-summary]")),
      tashfeer: overlap(track, box("[data-tashfeer]")),
      sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  expect(r.summary).toBe(false);
  expect(r.tashfeer).toBe(false);
  expect(r.sideways).toBeLessThanOrEqual(0);
});
