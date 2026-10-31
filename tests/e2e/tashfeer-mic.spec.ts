import { expect, test } from "@playwright/test";
import { skipIntro } from "./support";

/* The microphone allowed (a fake device): Tashfeer listens only while it really records. */
test.use({ launchOptions: { args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] } });

test("listening only while it records", async ({ page, context }, info) => {
  test.skip(info.project.name !== "desktop-1280", "one size");
  test.setTimeout(120_000);
  await context.grantPermissions(["microphone"]);
  await skipIntro(page);
  await page.goto("/");
  const robot = page.locator("[data-tashfeer]").first();
  await expect(robot).toHaveAttribute("data-tashfeer-3d", "ready", { timeout: 60_000 });
  await page.locator("[data-mic]").click();
  await expect(page.locator("[data-mic]")).toHaveAttribute("data-mic", "on");
  await expect(robot).toHaveAttribute("data-tashfeer-state", "listening");
  await page.locator("[data-mic]").click();
  await expect(robot).toHaveAttribute("data-tashfeer-state", "idle");
});
