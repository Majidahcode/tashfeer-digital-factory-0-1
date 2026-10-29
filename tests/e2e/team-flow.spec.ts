import { expect, test, type Page } from "@playwright/test";
import { hasMousePointer, openHome, settled } from "./support";

/*
 * Screen 3 — «اعتماد الفريق»: only the agents the visitor chose, their details on the centre card, approving (and
 * withdrawing the approval when the team changes), and the way back.
 */

const IDEA = "أبي منصة حجز مواعيد لعيادتي، يحجز فيها العملاء ويدفعون مسبقًا";

/** Bring an agent to the centre of the agents strip with the arrows, as a visitor would, and press it. */
async function pick(page: Page, id: string) {
  const card = page.locator(`[data-agent-card=${id}]`);
  for (
    let k = 0;
    k < 14 && (await card.getAttribute("data-offset")) !== "0.00";
    k++
  ) {
    const off = Number(await card.getAttribute("data-offset"));
    await page
      .getByRole("button", {
        name: off > 0 ? "الوكيل التالي" : "الوكيل السابق",
      })
      .click();
    await page.waitForTimeout(420);
  }
  await card.click();
}

async function toTeam(page: Page, ids: string[]) {
  await openHome(page);
  await page.locator("[data-chat-shell]").getByLabel("وصف المشروع").fill(IDEA);
  await page.locator("[data-chat-enter]").click();
  await page.locator("[data-agents-screen]").waitFor();
  await settled(page);
  await page.locator("[data-select-none]").click();
  for (const id of ids) await pick(page, id);
  await page.locator("[data-confirm-team]").click();
  await expect(page).toHaveURL(/\/team\/?$/);
  await page
    .locator("[data-team-screen] [data-agent-card]")
    .first()
    .waitFor({ state: "attached" });
  await settled(page);
}

const cards = (page: Page) =>
  page.evaluate(() =>
    [
      ...document.querySelectorAll<HTMLElement>(
        "[data-team-screen] [data-agent-card]",
      ),
    ].map((e) => e.dataset.agentCard),
  );
const detail = (page: Page) =>
  page.locator("[data-agent-detail]").getAttribute("data-agent-detail");

test("only the chosen agents reach the team screen, in order, with their images and names", async ({
  page,
}) => {
  await toTeam(page, ["ux", "back", "front"]);
  expect(await cards(page)).toEqual(["ux", "back", "front"]);
  await expect(
    page.locator("[data-team-screen] [data-agent-card=ux]"),
  ).toContainText("مصمم UX/UI");
  await expect(
    page.locator("[data-team-screen] [data-agent-card=ux] img"),
  ).toHaveCount(1);
  await expect(page.locator("[data-tashfeer]")).toBeVisible();
  await expect(page.locator("[data-portal]")).toHaveCount(0);
});

test("the details follow the agent at the centre; the screen has no production journey", async ({
  page,
}) => {
  await toTeam(page, ["research", "ux", "back"]);
  // the middle agent is shown first
  await expect.poll(() => detail(page)).toBe("ux");
  await expect(page.locator("[data-agent-detail]")).toContainText(
    "دوره في مشروعك",
  );
  await expect(page.locator("[data-agent-detail]")).toContainText("Figma");
  await expect(page.locator("[data-agent-detail]")).toContainText("خطة مقترحة");
  // the journey was removed from this screen (owner's request of 2026-10-29)
  await expect(page.locator("[data-journey], [data-stage]")).toHaveCount(0);
  await expect(page.getByText("رحلة الإنتاج المقترحة")).toHaveCount(0);
  // pressing a card brings it to the centre and shows it
  await page.locator("[data-team-screen] [data-agent-card=back]").click();
  await expect.poll(() => detail(page)).toBe("back");
  await expect(page.locator("[data-agent-detail]")).toContainText("حجز");
});

test("dragging the team strip changes the agent shown, without leaving the screen", async ({
  page,
}, info) => {
  await toTeam(page, ["research", "ux", "back"]);
  await expect.poll(() => detail(page)).toBe("ux");
  const b = (await page
    .locator("[data-team-screen] [data-agent-card=ux]")
    .boundingBox())!;
  const y = b.y + b.height / 2;
  const x = b.x + b.width / 2;
  if (hasMousePointer(info)) {
    await page.mouse.move(x, y);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) await page.mouse.move(x + i * 30, y);
    await page.mouse.up();
  } else {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x, y }],
    });
    for (let i = 1; i <= 8; i++)
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: x + i * 30, y }],
      });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
  }
  // right-to-left: pulling rightwards brings the next agent (back) to the centre
  await expect.poll(() => detail(page)).toBe("back");
  await expect(page).toHaveURL(/\/team\/?$/);
});

test("approving saves the team and opens the prototypes review; changing the team withdraws it until approved again", async ({
  page,
}) => {
  await toTeam(page, ["ux", "back"]);
  await page.locator("[data-approve-team]").click();
  await expect(page).toHaveURL(/\/prototypes\/?$/);
  await page.locator("[data-prototypes-screen]").waitFor();
  await expect(page.locator("[data-prototypes-gate]")).toHaveCount(0);
  await settled(page);
  await page.locator("[data-back-to-team]").click();
  await expect(page).toHaveURL(/\/team\/?$/);
  await page.reload();
  await expect(page.locator("[data-team-approved]")).toBeVisible();

  await page.locator("[data-edit-team]").click();
  await expect(page).toHaveURL(/\/agents\/?$/);
  await page.locator("[data-agents-screen]").waitFor();
  await settled(page);
  // the selection came back as it was
  expect(
    await page.evaluate(() =>
      [
        ...document.querySelectorAll<HTMLElement>(
          "[data-agent-card][data-selected]",
        ),
      ].map((e) => e.dataset.agentCard),
    ),
  ).toEqual(["ux", "back"]);
  await pick(page, "front");
  await expect(page.locator("[data-team-changed]")).toBeVisible();
  await page.locator("[data-confirm-team]").click();
  await expect(page).toHaveURL(/\/team\/?$/);
  await expect(page.locator("[data-approval-changed]")).toBeVisible();
  await expect(page.locator("[data-team-approved]")).toHaveCount(0);
  expect(await cards(page)).toEqual(["ux", "back", "front"]);
  await page.locator("[data-approve-team]").click();
  await expect(page).toHaveURL(/\/prototypes\/?$/);
  await expect(page.locator("[data-prototypes-gate]")).toHaveCount(0);
});

test("back from the team keeps the idea and the attachments' states", async ({
  page,
}) => {
  await openHome(page);
  const chat = page.locator("[data-chat-shell]");
  await chat.getByLabel("وصف المشروع").fill(IDEA);
  const chooser = page.waitForEvent("filechooser");
  await chat.getByRole("button", { name: "ملفات" }).click();
  await (
    await chooser
  ).setFiles({
    name: "المتطلبات.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4"),
  });
  await page.locator("[data-chat-enter]").click();
  await page.locator("[data-agents-screen]").waitFor();
  await settled(page);
  await page.locator("[data-confirm-team]").click();
  await page
    .locator("[data-team-screen] [data-agent-card]")
    .first()
    .waitFor({ state: "attached" });
  await settled(page);
  await page.locator("[data-back-to-agents]").click();
  await page.locator("[data-agents-screen]").waitFor();
  await page.locator("[data-back-to-idea]").click();
  await expect(chat.getByLabel("وصف المشروع")).toHaveValue(IDEA);
  await expect(chat.locator("[data-chat-attachments] li")).toHaveCount(1);
  await expect(chat.locator("[data-chat-attachments] li")).not.toHaveAttribute(
    "data-stale",
    "",
  );
});

test("opened without a team, the screen points back to the agents", async ({
  page,
}) => {
  await page.goto("/team");
  await expect(page.locator("[data-team-empty]")).toBeVisible();
  await page.locator("[data-go-agents]").click();
  await expect(page).toHaveURL(/\/agents\/?$/);
});

test("the team screen fits: no sideways scroll; the details panel is shown", async ({
  page,
}) => {
  await toTeam(page, ["research", "ux", "back"]);
  const r = await page.evaluate(() => ({
    sideways:
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
    panel: document
      .querySelector("[data-agent-detail]")!
      .getBoundingClientRect().height,
  }));
  expect(r.sideways).toBeLessThanOrEqual(0);
  expect(r.panel).toBeGreaterThan(200);
});
