import { expect, test, type Page } from "@playwright/test";
import { settled, skipIntro } from "./support";

/*
 * The site's opening (SiteIntro) and the transitions between screens (src/lib/page-transition.ts):
 *   - the opening plays once per tab, can be skipped, ends by itself and then lets clicks through; never with reduced
 *     motion; missing pictures never hold the site;
 *   - home → agents: Tashfeer crosses the portal (its named steps, in order), a second press is ignored, the idea is
 *     kept, Tashfeer arrives in his place, and nothing is left over the page;
 *   - forward screens: a soft light, short; back: a short dim, never the crossing in reverse.
 */

const IDEA = "أبي منصة حجز مواعيد لعيادتي، يحجز فيها العملاء ويدفعون مسبقًا";
const intro = (page: Page) => page.locator("[data-site-intro]");

/** Every step the transition goes through, in order (from <html data-scene-transition>), recorded in the page. */
async function recordSteps(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __steps: string[] };
    w.__steps = [];
    new MutationObserver(() => {
      const s = document.documentElement.dataset.sceneTransition ?? "idle";
      if (w.__steps.at(-1) !== s) w.__steps.push(s);
    }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-scene-transition"] });
  });
}
const steps = (page: Page) => page.evaluate(() => (window as unknown as { __steps: string[] }).__steps);

async function noLayerLeft(page: Page) {
  await expect(page.locator("[data-page-veil]")).toHaveCount(0);
  await expect(page.locator("html")).not.toHaveAttribute("data-scene-transition", /.+/);
}

test.describe("the opening", () => {
  test("plays once in a tab, ends by itself, and then lets the page be used", async ({ page }) => {
    await page.goto("/");
    await expect(intro(page)).toBeVisible();
    await expect(page.locator("[data-site-intro] img")).toHaveCount(2);
    // over in about 2.6 s: gone, and the page under it takes clicks
    await expect(intro(page)).toHaveCount(0, { timeout: 8000 });
    await page.locator("[data-chat-shell]").getByLabel("وصف المشروع").fill("تجربة");
    // the same tab: not again (a reload, and coming back to the home page)
    await page.reload();
    await expect(intro(page)).toBeHidden();
    await expect(page.locator("[data-chat-shell]")).toBeVisible();
  });

  test("«تخطَّ» ends it at once", async ({ page }) => {
    await page.goto("/");
    await page.locator("[data-intro-skip]").click();
    await expect(intro(page)).toHaveCount(0, { timeout: 2000 });
  });

  test("never with reduced motion", async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: "reduce" });
    const page = await ctx.newPage();
    await page.goto("/");
    await expect(intro(page)).toBeHidden();
    await expect(page.locator("[data-chat-shell]")).toBeVisible();
    await ctx.close();
  });

  test("pictures that fail to load never hold the site", async ({ page }) => {
    await page.route("**/intro/*.webp", (r) => r.abort());
    await page.goto("/");
    await expect(intro(page)).toHaveCount(0, { timeout: 8000 });
    await expect(page.locator("[data-chat-shell]")).toBeVisible();
  });
});

test.describe("between screens", () => {
  test.beforeEach(async ({ page }) => {
    await skipIntro(page);
  });

  test("home → agents: Tashfeer crosses the portal; a second press changes nothing; the idea is kept; he arrives in his place", async ({
    page,
  }) => {
    // the crossing draws Tashfeer's model on a software renderer here (no GPU): slow, so generous time
    test.setTimeout(240_000);
    const pageErrors: string[] = [];
    page.on("pageerror", (e) => pageErrors.push(e.message));
    await page.goto("/");
    // the crossing is made with his 3D model: it is ready first
    await expect(page.locator("[data-tashfeer]")).toHaveAttribute("data-tashfeer-3d", "ready", { timeout: 60_000 });
    await page.locator("[data-chat-shell]").getByLabel("وصف المشروع").fill(IDEA);
    await recordSteps(page);
    // two presses in a row, from inside the page (an outside click would wait for the transition's layer)
    await page.evaluate(() => {
      const enter = document.querySelector<HTMLElement>("[data-chat-enter]")!;
      enter.click();
      enter.click();
    });
    await expect(page).toHaveURL(/\/agents\/?$/, { timeout: 60_000 });
    await page.locator("html:not([data-scene-transition])").waitFor({ state: "attached", timeout: 120_000 });
    expect(await steps(page)).toEqual(["approachingPortal", "behindFrame", "cameraFollow", "arriving", "idle"]);
    await noLayerLeft(page);
    // the idea came along, and Tashfeer stands in his place, whole and visible
    await expect(page.locator("[data-project-summary]")).toContainText("منصة حجز مواعيد");
    // the same 3D model on the agents screen, never the old picture
    const robot = page.locator("[data-agents-screen] [data-tashfeer]");
    await expect(robot).toBeVisible();
    await expect(robot).toHaveAttribute("data-tashfeer-3d", "ready", { timeout: 60_000 });
    // the screen takes clicks again
    await page.locator("[data-confirm-team]").click();
    await expect(page).toHaveURL(/\/team\/?$/);
    expect(pageErrors).toEqual([]);
  });

  test("forward: a sheet of glass, short, then nothing over the page; back: the same, shorter, never the crossing", async ({
    page,
  }) => {
    await page.addInitScript((idea) => {
      if (!sessionStorage.getItem("tashfeer.project.v1"))
        sessionStorage.setItem("tashfeer.project.v1", JSON.stringify({ idea, attachments: [], notes: [] }));
    }, IDEA);
    await page.goto("/agents");
    await page.locator("[data-agents-screen]").waitFor();
    const kinds: string[] = [];
    await page.exposeFunction("__kind", (k: string) => kinds.push(k));
    await page.evaluate(() =>
      new MutationObserver(() => {
        const k = document.documentElement.dataset.transitionKind;
        if (k) (window as unknown as { __kind: (k: string) => void }).__kind(k);
      }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-transition-kind"] }),
    );
    const t0 = Date.now();
    await page.locator("[data-confirm-team]").click();
    await expect(page).toHaveURL(/\/team\/?$/);
    await settled(page);
    const forwardMs = Date.now() - t0;
    await noLayerLeft(page);
    // back to the agents screen from the team screen: the short one
    await page.locator("[data-team-screen]").waitFor();
    await page.locator("[data-edit-team]").click();
    await expect(page).toHaveURL(/\/agents\/?$/);
    await settled(page);
    await noLayerLeft(page);
    expect(kinds.slice(0, 2)).toEqual(["forward", "back"]);
    // the glass's own time is ≈ 620 ms; the rest is the next screen loading and drawing Tashfeer — on this test machine
    // with no GPU (a software renderer) that takes seconds. A ceiling only: the real duration on a device is measured by
    // the hidden diagnostics (?diag=1)
    expect(forwardMs).toBeLessThan(12_000);
    // the team kept through the round trip
    await expect(page.locator("[data-confirm-team]")).toBeVisible();
  });

  test("reduced motion: plain navigation, no layer", async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: "reduce" });
    const page = await ctx.newPage();
    await skipIntro(page);
    await page.goto("/");
    await page.locator("[data-chat-shell]").getByLabel("وصف المشروع").fill(IDEA);
    await recordSteps(page);
    await page.locator("[data-chat-enter]").click();
    await expect(page).toHaveURL(/\/agents\/?$/);
    expect(await steps(page)).toEqual([]);
    await expect(page.locator("[data-page-veil]")).toHaveCount(0);
    await ctx.close();
  });
});
