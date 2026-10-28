import { expect, test } from "@playwright/test";

/* /robot-animation-test: typing plays «listening» once, sending plays «thinking» once, then a demo answer. */
test("the video test runs its states once each and answers with a clearly marked demo", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop-1440", "one desktop size is enough for the internal test page");
  await page.goto("/robot-animation-test");
  const panel = page.locator("[data-test-panel]");
  const layer = page.locator("[data-video-layer]");
  await expect(panel).toHaveAttribute("data-machine-state", "idle");
  await expect(layer).toHaveAttribute("data-video-layer", "still-idle");
  const field = page.locator("[data-chat-shell] textarea");
  await field.pressSequentially("أريد");
  await expect(panel).toHaveAttribute("data-machine-state", "listening");
  await expect(layer).toHaveAttribute("data-video-layer", "listening");
  await field.pressSequentially(" منصة");
  await field.press("Enter");
  await expect(panel).toHaveAttribute("data-machine-state", "thinking");
  await expect(layer).toHaveAttribute("data-video-layer", /^thinking-/);
  await expect(panel).toHaveAttribute("data-machine-state", "replying", { timeout: 9000 });
  await expect(page.locator("[data-chat-message=tashfeer]")).toContainText("رد تجريبي");
  // one clip visible at a time, holding its last frame
  expect(await page.evaluate(() => [...document.querySelectorAll("video")].filter((v) => getComputedStyle(v).visibility === "visible").length)).toBe(1);
  expect(await page.evaluate(() => document.querySelector<HTMLVideoElement>("video[data-visible]")!.ended)).toBe(true);
});
