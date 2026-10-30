import { expect, test } from "@playwright/test";

/** The station 01 review page: the station alone, its tools above the scene; the factory untouched. */
test.describe("station 01 review page", () => {
  test.setTimeout(240_000);

  test("loads the station's model; the tools switch the view, the glass and the glow; nothing over the scene", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    await page.goto("/factory/station-01");
    const review = page.locator("[data-station-review]");
    await expect(review).toHaveAttribute("data-ready", "true", { timeout: 180_000 });
    await expect(review).toHaveAttribute("data-glass", "transmission");
    await page.locator("[data-view-btn=side]").click();
    await expect(review).toHaveAttribute("data-view", "side");
    await page.locator("[data-glass-btn=none]").click();
    await expect(review).toHaveAttribute("data-glass", "none");
    await page.locator("[data-glow-btn]").click();
    await expect(review).toHaveAttribute("data-glow", "off");
    // the tools sit above the scene, not over it
    const bar = await page.locator("[data-station-review] header").boundingBox();
    const canvas = await page.locator("[data-review-canvas]").boundingBox();
    expect(bar!.y + bar!.height).toBeLessThanOrEqual(canvas!.y + 1);
    expect(errors).toEqual([]);
  });
});
