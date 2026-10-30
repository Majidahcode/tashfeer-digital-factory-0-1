import { expect, test, type Page } from "@playwright/test";

/*
 * The layered factory trial (/factory/layers): the owner's pictures as layers. The pictures load once; choosing a
 * station moves the camera there smoothly and shows the project's content (real HTML) in the station's content area;
 * rapid choices, resizing and reduced motion behave; the camera stays within its limits; production changes the
 * content but never reloads the pictures or moves the camera.
 */

const IDEA = "أبي منصة حجز مواعيد لعيادتي، يحجز فيها العملاء ويدفعون مسبقًا";
const TEAM = ["ux", "back", "front", "qa", "ops"];

async function seedApproved(page: Page) {
  await page.addInitScript(
    ({ idea, team }) => {
      if (sessionStorage.getItem("tashfeer.project.v1")) return;
      sessionStorage.setItem(
        "tashfeer.project.v1",
        JSON.stringify({
          idea,
          attachments: [],
          team,
          confirmed: true,
          approvedTeam: team,
          chosenModel: "B",
          notes: [],
          approvedDesign: { model: "B", idea, team, at: 1 },
        }),
      );
    },
    { idea: IDEA, team: TEAM },
  );
}

const root = (page: Page) => page.locator("[data-layered]");

async function open(page: Page, query = "") {
  await seedApproved(page);
  await page.goto(`/factory/layers${query}`);
  await expect(root(page)).toHaveAttribute("data-ready", "true", { timeout: 120_000 });
  await settled(page);
}

async function settled(page: Page) {
  await expect(root(page)).toHaveAttribute("data-camera-settled", "true", { timeout: 60_000 });
}

/** the camera's pose against its goal: arrived */
async function atGoal(page: Page) {
  return page.evaluate(() => {
    const p = window.__layered!.pose();
    const g = window.__layered!.goal();
    return Math.abs(p.tx - g.tx) + Math.abs(p.ty - g.ty) + Math.abs(p.dist - g.dist) < 1e-3;
  });
}

async function choose(page: Page, id: "s04" | "s05" | "overview") {
  await page.locator(id === "overview" ? "[data-view-overview]" : `[data-view-station=${id}]`).click();
}

test.describe("layered factory trial", () => {
  test.setTimeout(240_000);

  test("the pictures load once; the scene opens on the whole belt; nothing in the console", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    await open(page);
    await expect(root(page)).toHaveAttribute("data-camera-mode", "overview");
    const loads = await page.evaluate(() => window.__layeredLoads!);
    expect(Object.keys(loads)).toHaveLength(5);
    expect(Object.values(loads).every((n) => n === 1)).toBe(true);
    await expect(page.locator("[data-sim-label]")).toBeVisible();
    await expect(page.locator("[data-content-panel]")).not.toHaveAttribute("data-visible", "true");
    expect(errors).toEqual([]);
  });

  test("a station: the camera arrives, the content shows inside it; the other station; back to the whole scene", async ({
    page,
  }) => {
    await open(page);
    await choose(page, "s04");
    await settled(page);
    await expect(root(page)).toHaveAttribute("data-camera-station", "s04");
    const panel = page.locator("[data-content-panel=s04]");
    await expect(panel).toHaveAttribute("data-visible", "true");
    await expect(panel).toContainText("تصميم الواجهات");
    await expect(panel).toContainText("المطور الأمامي"); // the project's own team: real data, not a picture
    await expect(panel).toContainText("محاكاة تفاعلية");
    // the panel lies inside the scene (never under the bars) and is big enough to read
    const stage = (await page.locator("[data-layered-canvas]").boundingBox())!;
    const box = (await panel.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(stage.x - 1);
    expect(box.y).toBeGreaterThanOrEqual(stage.y - 1);
    expect(box.x + box.width).toBeLessThanOrEqual(stage.x + stage.width + 1);
    expect(box.y + box.height).toBeLessThanOrEqual(stage.y + stage.height + 1);
    expect(box.width).toBeGreaterThan(Math.min(260, stage.width * 0.6));
    await choose(page, "s05");
    await settled(page);
    await expect(page.locator("[data-content-panel=s05]")).toHaveAttribute("data-visible", "true");
    await choose(page, "overview");
    await settled(page);
    await expect(root(page)).toHaveAttribute("data-camera-mode", "overview");
    await expect(page.locator("[data-content-panel]")).not.toHaveAttribute("data-visible", "true");
  });

  test("rapid choices end where the last one asked, with the camera there", async ({ page }) => {
    await open(page);
    for (const id of ["s04", "s05", "overview", "s04", "s05"] as const) await choose(page, id);
    await settled(page);
    await expect(root(page)).toHaveAttribute("data-camera-station", "s05");
    expect(await atGoal(page)).toBe(true);
    await expect(page.locator("[data-content-panel=s05]")).toHaveAttribute("data-visible", "true");
  });

  test("the move is continuous: no frame jumps most of the way", async ({ page }) => {
    // measured at 1024×640 at most (a software renderer here: fewer frames on larger screens)
    const vp = page.viewportSize()!;
    if (vp.width > 1024) await page.setViewportSize({ width: 1024, height: 640 });
    await open(page);
    const path = await page.evaluate(
      () =>
        new Promise<number[][]>((done) => {
          const out: number[][] = [];
          const t0 = performance.now();
          const f = () => {
            const p = window.__layered!.pose();
            out.push([p.tx, p.ty, p.dist]);
            if (performance.now() - t0 < 3000) requestAnimationFrame(f);
            else done(out);
          };
          (document.querySelector("[data-view-station=s05]") as HTMLElement).click();
          requestAnimationFrame(f);
        }),
    );
    const steps = path.slice(1).map((p, i) => Math.hypot(...p.map((v, k) => v - path[i]![k]!)));
    const total = steps.reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThan(1);
    expect(steps.filter((s) => s > 1e-4).length).toBeGreaterThan(3);
    expect(Math.max(...steps)).toBeLessThan(total * 0.45);
  });

  test("the visitor's tilt and zoom stay within the limits (no edge-on, no going behind)", async ({ page }, info) => {
    test.skip(Boolean(info.project.use.hasTouch), "mouse");
    await open(page);
    const box = (await page.locator("[data-layered-canvas]").boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 5, box.y + 5, { steps: 6 });
    await page.mouse.move(box.x + box.width - 5, box.y + box.height - 5, { steps: 6 });
    await page.mouse.up();
    for (let i = 0; i < 12; i++) await page.mouse.wheel(0, -400);
    const o = await page.evaluate(() => window.__layered!.pose().offsets);
    expect(Math.abs(o.yaw)).toBeLessThanOrEqual((5 * Math.PI) / 180 + 1e-9);
    expect(Math.abs(o.pitch)).toBeLessThanOrEqual((3 * Math.PI) / 180 + 1e-9);
    expect(o.zoom).toBeGreaterThanOrEqual(0.8 - 1e-9);
    // a new view clears the visitor's tilt and zoom
    await choose(page, "s04");
    await settled(page);
    expect(await page.evaluate(() => window.__layered!.pose().offsets)).toEqual({ yaw: 0, pitch: 0, zoom: 1 });
  });

  test("resizing keeps the station framed and its content inside the scene", async ({ page }) => {
    await open(page);
    await choose(page, "s05");
    await settled(page);
    const vp = page.viewportSize()!;
    await page.setViewportSize({ width: Math.round(vp.width * 0.7), height: Math.round(vp.height * 0.85) });
    await settled(page);
    await expect.poll(() => atGoal(page), { timeout: 30_000 }).toBe(true);
    const stage = (await page.locator("[data-layered-canvas]").boundingBox())!;
    const box = (await page.locator("[data-content-panel=s05]").boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(stage.x + stage.width + 1);
    expect(box.y + box.height).toBeLessThanOrEqual(stage.y + stage.height + 1);
  });

  test("reduced motion: the camera is placed at once", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await open(page);
    await choose(page, "s04");
    // no move to wait for: arrived within a couple of frames
    await expect.poll(() => atGoal(page), { timeout: 5_000, intervals: [50, 50, 100] }).toBe(true);
    await settled(page);
  });

  test("production changes the content, never the pictures or the camera", async ({ page }) => {
    await open(page, "?speed=8");
    await choose(page, "s04");
    await settled(page);
    const before = await page.evaluate(() => window.__layered!.pose());
    await page.locator("[data-production-toggle]").click();
    // the interfaces stage starts after the setup stage: its task appears in the panel
    await expect(page.locator("[data-content-panel=s04] [data-task]")).not.toHaveText("—", { timeout: 60_000 });
    await expect(root(page)).toHaveAttribute("data-camera-station", "s04");
    const after = await page.evaluate(() => window.__layered!.pose());
    expect(Math.abs(after.tx - before.tx) + Math.abs(after.dist - before.dist)).toBeLessThan(1e-6);
    const loads = await page.evaluate(() => window.__layeredLoads!);
    expect(Object.values(loads).every((n) => n === 1)).toBe(true);
  });
});
