import { expect, test } from "@playwright/test";

/*
 * /robot-animation-test (internal): Tashfeer's 3D model driven by his one controller and a simulated service.
 * Typing → attending; sending → thinking (a second send is ignored); a text reply → replying (no voice) → idle;
 * an error and a cancel end the thinking.
 */
test.describe("the test page", () => {
  test.beforeEach(({}, info) => {
    test.skip(info.project.name !== "desktop-1440", "one desktop size is enough for the internal test page");
  });

  test("states follow the real events and the simulated service", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/robot-animation-test");
    const panel = page.locator("[data-test-panel]");
    const robot = page.locator("[data-tashfeer]");
    await expect(robot).toHaveAttribute("data-tashfeer-3d", "ready", { timeout: 60_000 });
    await expect(panel).toHaveAttribute("data-machine-state", "idle");
    const field = page.locator("[data-chat-shell] textarea");
    await field.pressSequentially("أريد");
    await expect(robot).toHaveAttribute("data-tashfeer-state", "attending");
    await page.waitForTimeout(1500); // a short pause: he stays on the chat
    await expect(robot).toHaveAttribute("data-tashfeer-state", "attending");
    await field.pressSequentially(" منصة");
    await field.press("Enter");
    await expect(panel).toHaveAttribute("data-machine-state", "thinking");
    await expect(panel).toHaveAttribute("data-machine-state", "replying", { timeout: 10_000 });
    await expect(panel).toContainText("نص فقط، بلا صوت");
    await expect(page.locator("[data-chat-message=tashfeer]")).toContainText("رد تجريبي");
    await expect(panel).toHaveAttribute("data-machine-state", "idle", { timeout: 10_000 });

    // an error, then a cancel: both end the thinking
    await page.locator("[data-outcome=error]").check();
    await page.locator("[data-test-send]").click();
    await expect(panel).toHaveAttribute("data-machine-state", "thinking");
    await expect(panel).toHaveAttribute("data-machine-state", "idle", { timeout: 10_000 });
    await page.locator("[data-outcome=text]").check();
    // two sends in a row (from inside the page, in the same moment): the second, while thinking, is refused
    const before = await page.locator("[data-chat-message=visitor]").count();
    await page.evaluate(() => {
      const send = document.querySelector<HTMLButtonElement>("[data-test-send]")!;
      send.click();
      send.click();
    });
    await expect(panel).toHaveAttribute("data-machine-state", "thinking");
    await expect(page.locator("[data-chat-message=visitor]")).toHaveCount(before + 1);
    await page.locator("[data-test-cancel]").click();
    await expect(panel).toHaveAttribute("data-machine-state", "idle");
  });
});
