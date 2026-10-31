import { expect, test, type Page } from "@playwright/test";
import { skipIntro } from "./support";

/*
 * Tashfeer as his 3D model on the screens: transparent and click-through, the old picture never used, attentive to
 * typing (without swinging on short pauses), listening only once the microphone records, a stand-in still of the
 * same model without WebGL.
 */

const robot = (page: Page) => page.locator("[data-tashfeer]").first();

async function home(page: Page) {
  await skipIntro(page);
  await page.goto("/");
  await expect(robot(page)).toHaveAttribute("data-tashfeer-3d", "ready", { timeout: 60_000 });
}

test.describe("Tashfeer in 3D", () => {
  test.describe.configure({ timeout: 120_000 });

  test("transparent, never in the way of a click, and the old picture is not loaded", async ({ page }) => {
    const old: string[] = [];
    page.on("request", (r) => r.url().includes("/assets/characters/tashfeer.png") && old.push(r.url()));
    await home(page);
    const look = await robot(page).evaluate((el) => {
      const c = el.querySelector("canvas")!;
      const gl = (c.getContext("webgl2") ?? c.getContext("webgl")) as WebGLRenderingContext | null;
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return {
        alpha: gl?.getContextAttributes()?.alpha ?? null,
        background: getComputedStyle(el).backgroundColor,
        canvasBackground: getComputedStyle(c).backgroundColor,
        pointer: getComputedStyle(c).pointerEvents,
        hitIsCharacter: !!hit && el.contains(hit),
      };
    });
    expect(look.alpha).toBe(true);
    expect(look.background).toBe("rgba(0, 0, 0, 0)");
    expect(look.canvasBackground).toBe("rgba(0, 0, 0, 0)");
    expect(look.pointer).toBe("none");
    expect(look.hitIsCharacter).toBe(false);
    // the chat beside him still takes clicks and typing
    await page.locator("[data-chat-shell] textarea").fill("تجربة");
    expect(old).toEqual([]);
  });

  test("typing: he turns to the chat and stays; an emptied field sends him back", async ({ page }) => {
    await home(page);
    const field = page.locator("[data-chat-shell] textarea");
    await field.pressSequentially("أبي منصة");
    await expect(robot(page)).toHaveAttribute("data-tashfeer-state", "attending");
    await page.waitForTimeout(2000);
    await expect(robot(page)).toHaveAttribute("data-tashfeer-state", "attending");
    await field.fill("");
    await expect(robot(page)).toHaveAttribute("data-tashfeer-state", "idle");
  });

  test("the microphone refused: he does not listen, and the page says so", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop-1280", "one size");
    await home(page);
    await page.locator("[data-mic]").click();
    await expect(page.locator("[data-mic-note]")).toBeVisible();
    await expect(robot(page)).toHaveAttribute("data-tashfeer-state", "idle");
  });

  test("without WebGL: the still of the same model, never the old picture", async ({ page }) => {
    await page.addInitScript(() => {
      const get = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
        return /webgl/.test(type) ? null : (get as (...a: unknown[]) => unknown).call(this, type, ...rest);
      } as typeof get;
    });
    await skipIntro(page);
    await page.goto("/");
    await expect(robot(page)).toHaveAttribute("data-tashfeer-3d", "fallback");
    const still = robot(page).locator("img");
    await expect(still).toHaveAttribute("src", "/characters/tashfeer-3d.webp");
    await expect(still).toHaveAttribute("data-visible", "");
    expect(await still.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true);
  });
});
