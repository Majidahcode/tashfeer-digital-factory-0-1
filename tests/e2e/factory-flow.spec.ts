import { expect, test, type Page } from "@playwright/test";
import { openHome, settled } from "./support";

/*
 * Screen 5 — the production factory (phase 1): reached by approving a model; a real 3D scene (WebGL) with one product on
 * a curved line; the opening shot, the tracking shot, a move to a station and back to the whole factory; one details
 * panel; the visitor's own camera (mouse and touch) that the tour never fights; keyboard; reduced motion; no WebGL.
 * Production comes from a local simulation, labelled as such: it pauses and resumes, comes back paused after a reload,
 * and never continues on an approval that has changed.
 */

const IDEA = "أبي منصة حجز مواعيد لعيادتي، يحجز فيها العملاء ويدفعون مسبقًا";
const TEAM = ["ux", "back", "front", "qa", "ops"];

/** An approved project in this tab (as the earlier screens leave it), without walking through them. */
async function seedApproved(page: Page, model: "A" | "B" = "B") {
  await page.addInitScript(
    ({ idea, team, model }) => {
      if (sessionStorage.getItem("tashfeer.project.v1")) return;
      sessionStorage.setItem(
        "tashfeer.project.v1",
        JSON.stringify({
          idea,
          attachments: [],
          team,
          confirmed: true,
          approvedTeam: team,
          chosenModel: model,
          notes: [],
          approvedDesign: { model, idea, team, at: 1 },
        }),
      );
    },
    { idea: IDEA, team: TEAM, model },
  );
}

const screen = (page: Page) => page.locator("[data-factory-screen]");

async function openFactory(page: Page, query = "") {
  await page.goto(`/factory${query}`);
  await screen(page).waitFor();
  await page.locator("[data-factory-canvas] canvas").waitFor();
}

/** Wait until the camera has finished its move (the scene marks it settled). */
async function cameraSettled(page: Page) {
  await expect(screen(page)).toHaveAttribute("data-camera-settled", "", { timeout: 40_000 });
}

/** Sample the camera every frame while it moves to `click`'s destination: the path must be continuous. */
async function samplePath(page: Page, click: () => Promise<void>) {
  await page.evaluate(() => {
    const w = window as unknown as { __path: number[][]; __pathOn: boolean };
    w.__path = [];
    w.__pathOn = true;
    const loop = () => {
      const f = window.__tashfeerFactory;
      if (f) w.__path.push(f.pose().pos);
      if (w.__pathOn) requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
  const request = Number(await screen(page).getAttribute("data-camera-request"));
  await click();
  // this move was asked for (a new request), then wait for it to end
  await expect(screen(page)).toHaveAttribute("data-camera-request", String(request + 1));
  await cameraSettled(page);
  return page.evaluate(() => {
    const w = window as unknown as { __path: number[][]; __pathOn: boolean };
    w.__pathOn = false;
    return w.__path;
  });
}

/** The way travelled (the sum of the frame-to-frame steps) and the largest single step. */
function pathStats(path: number[][]) {
  const d = (a: number[], b: number[]) => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);
  let max = 0;
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    const step = d(path[i]!, path[i - 1]!);
    total += step;
    max = Math.max(max, step);
  }
  return { total, maxStep: max, samples: path.length };
}

test.describe("factory", () => {
  // WebGL here is drawn in software (no GPU in CI): frames are slow, the camera's moves take their full time
  test.describe.configure({ timeout: 120_000 });

  test("approving a model opens the factory: a 3D scene, the product, the stations, the history, and the simulation labelled", async ({
    page,
  }) => {
    await openHome(page);
    await page.locator("[data-chat-shell]").getByLabel("وصف المشروع").fill(IDEA);
    await page.locator("[data-chat-enter]").click();
    await page.locator("[data-agents-screen]").waitFor();
    await settled(page);
    await page.locator("[data-confirm-team]").click();
    await page.locator("[data-team-screen] [data-agent-card]").first().waitFor({ state: "attached" });
    await settled(page);
    await page.locator("[data-approve-team]").click();
    await page.locator("[data-prototype=A]").waitFor();
    await settled(page);
    await page.locator("[data-choose=A]").click();
    await page.locator("[data-approve-design]").click();
    await expect(page).toHaveURL(/\/factory\/?$/);
    await expect(screen(page)).toHaveAttribute("data-webgl", "yes");
    await expect(page.locator("[data-factory-canvas] canvas")).toBeVisible();
    await expect(page.locator("[data-simulation-tag]")).toHaveText("محاكاة تفاعلية");
    await expect(page.getByLabel("سجل المشروع")).toContainText("اعتماد النموذج A");
    await expect(page.locator("[data-production-state]")).toHaveText("الإنتاج لم يبدأ");
    // quality and delivery are always stations; history (analysis, approvals) is not
    await expect(page.locator("[data-station-btn=quality]")).toBeVisible();
    await expect(page.locator("[data-station-btn=delivery]")).toBeVisible();
    await expect(page.locator("[data-station-btn]")).not.toContainText(["تحليل الفكرة"]);
  });

  test("without approvals the factory points to the step that is needed", async ({ page }) => {
    await page.goto("/factory");
    await expect(page.locator("[data-factory-gate]")).toContainText("اختر فريقك أولًا");
    await expect(page.locator("[data-factory-canvas]")).toHaveCount(0);
  });

  test("the opening shot ends on the product; a station is reached smoothly and framed; back to the whole factory and to the product", async ({
    page,
  }) => {
    // smoothness is measured frame by frame; WebGL here is drawn in software, and on large screens a frame can take
    // longer than a whole move under the suite's parallel load — so the path is measured at 1024×640 at most
    const vp = page.viewportSize()!;
    if (vp.width > 1024) await page.setViewportSize({ width: 1024, height: 640 });
    await seedApproved(page);
    await openFactory(page);
    await cameraSettled(page);
    await expect(screen(page)).toHaveAttribute("data-camera-mode", "follow");

    const toQuality = await samplePath(page, () => page.locator("[data-station-btn=quality]").click());
    await expect(screen(page)).toHaveAttribute("data-camera-mode", "station");
    await expect(screen(page)).toHaveAttribute("data-camera-station", "quality");
    const q = pathStats(toQuality);
    expect(q.samples).toBeGreaterThan(5);
    expect(q.total).toBeGreaterThan(2);
    // no jump: no single frame covers most of the way (the move is spread over many frames, whatever the frame rate)
    expect(q.maxStep).toBeLessThan(q.total * 0.4);
    expect(await page.evaluate(() => window.__tashfeerFactory!.inView("quality"))).toBe(true);
    await expect(page.locator("[data-station-panel=quality]")).toBeVisible();

    // another station straight from here, then the whole factory, then the product again
    for (const id of ["delivery", "interfaces"]) {
      const path = await samplePath(page, () => page.locator(`[data-station-btn=${id}]`).click());
      const p = pathStats(path);
      expect(p.samples).toBeGreaterThan(5);
      expect(p.maxStep).toBeLessThan(p.total * 0.4);
      expect(await page.evaluate((s) => window.__tashfeerFactory!.inView(s), id)).toBe(true);
    }
    await page.locator("[data-cam-overview]").click();
    await cameraSettled(page);
    await expect(screen(page)).toHaveAttribute("data-camera-mode", "overview");
    await expect(page.locator("[data-station-panel]")).toHaveCount(0);
    for (const id of ["interfaces", "quality", "delivery"])
      expect(await page.evaluate((s) => window.__tashfeerFactory!.inView(s), id)).toBe(true);
    await page.locator("[data-cam-follow]").click();
    await cameraSettled(page);
    await expect(screen(page)).toHaveAttribute("data-camera-mode", "follow");
  });

  test("the visitor's own camera: a drag stops the tour, and the camera stays where they left it", async ({
    page,
  }, info) => {
    test.skip(Boolean(info.project.use.hasTouch), "mouse; touch has its own test");
    await seedApproved(page);
    await openFactory(page);
    await cameraSettled(page);
    const canvas = page.locator("[data-factory-canvas] canvas");
    const box = (await canvas.boundingBox())!;
    const before = await page.evaluate(() => window.__tashfeerFactory!.pose());
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.45);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.62, box.y + box.height * 0.4, { steps: 8 });
    await page.mouse.up();
    await expect(screen(page)).toHaveAttribute("data-camera-mode", "free");
    await page.mouse.wheel(0, -300);
    // let the controls' own easing come to rest
    await page.waitForTimeout(3500);
    const left = await page.evaluate(() => window.__tashfeerFactory!.pose());
    expect(Math.hypot(...left.pos.map((v, i) => v - before.pos[i]!))).toBeGreaterThan(0.3);
    await page.waitForTimeout(2000);
    const later = await page.evaluate(() => window.__tashfeerFactory!.pose());
    // not pulled back by the tour: it stays where the visitor left it
    expect(Math.hypot(...later.pos.map((v, i) => v - left.pos[i]!))).toBeLessThan(0.15);
    await expect(screen(page)).toHaveAttribute("data-camera-mode", "free");
    // a station is still one click away
    await page.locator("[data-station-btn=quality]").click();
    await cameraSettled(page);
    await expect(screen(page)).toHaveAttribute("data-camera-station", "quality");
  });

  test("touch: tapping a station works, and a finger on the scene takes the camera", async ({ page }, info) => {
    test.skip(!info.project.use.hasTouch, "touch screens");
    await seedApproved(page);
    await openFactory(page);
    await cameraSettled(page);
    await page.locator("[data-station-btn=quality]").tap();
    await cameraSettled(page);
    await expect(page.locator("[data-station-panel=quality]")).toBeVisible();
    await page.locator("[data-panel-close]").tap();
    // a real finger drag (touch input through the browser, not synthetic events)
    const canvas = page.locator("[data-factory-canvas] canvas");
    const b = (await canvas.boundingBox())!;
    const cdp = await page.context().newCDPSession(page);
    const touch = (type: "touchStart" | "touchMove" | "touchEnd", x: number) =>
      cdp.send("Input.dispatchTouchEvent", {
        type,
        touchPoints: type === "touchEnd" ? [] : [{ x: b.x + b.width * x, y: b.y + b.height * 0.45 }],
      });
    await touch("touchStart", 0.5);
    for (let i = 1; i <= 6; i++) await touch("touchMove", 0.5 + i * 0.03);
    await touch("touchEnd", 0.68);
    await expect(screen(page)).toHaveAttribute("data-camera-mode", "free");
  });

  test("keyboard: a number key chooses a station, Esc closes its panel; the station buttons are reachable with Tab", async ({
    page,
  }) => {
    await seedApproved(page);
    await openFactory(page);
    await page.keyboard.press("4");
    await expect(page.locator("[data-station-panel=quality]")).toBeVisible();
    await expect(screen(page)).toHaveAttribute("data-camera-station", "quality");
    await page.keyboard.press("Escape");
    await expect(page.locator("[data-station-panel]")).toHaveCount(0);
    const btn = page.locator("[data-station-btn=delivery]");
    await btn.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("[data-station-panel=delivery]")).toBeVisible();
  });

  test("production: runs, pauses, comes back paused after a reload where it was; quality shows the issue, its fix and the retest; delivery claims no download", async ({
    page,
  }) => {
    await seedApproved(page);
    await openFactory(page, "?speed=4");
    await page.locator("[data-production-toggle]").click();
    await expect(screen(page)).toHaveAttribute("data-production", "running");
    await expect(page.locator("[data-station-btn=setup]")).toHaveAttribute("data-status", "done", { timeout: 15_000 });
    await page.locator("[data-production-toggle]").click();
    await expect(screen(page)).toHaveAttribute("data-production", "paused");
    const states = () =>
      page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>("[data-station-btn]")].map((b) => b.dataset.status),
      );
    const before = await states();
    await page.waitForTimeout(1500);
    expect(await states()).toEqual(before);

    await page.reload();
    await screen(page).waitFor();
    await expect(screen(page)).toHaveAttribute("data-production", "paused");
    await expect(page.locator("[data-production-state]")).toHaveText("الإنتاج متوقف مؤقتًا");
    expect(await states()).toEqual(before);
    await expect(page.locator("[data-production-toggle]")).toContainText("استئناف");

    await page.locator("[data-production-toggle]").click();
    await page.locator("[data-station-btn=quality]").click();
    const mobile = page.locator("[data-check=mobile]");
    await expect(mobile).toContainText("مشكلة", { timeout: 30_000 });
    await expect(mobile).toHaveAttribute("data-check-state", "pass", { timeout: 30_000 });
    await expect(mobile.locator("[data-check-fix]")).toContainText("المعالجة");
    await expect(mobile).toContainText("إعادة الاختبار: نجح");
    await expect(screen(page)).toHaveAttribute("data-production", "finished", { timeout: 30_000 });
    await page.locator("[data-station-btn=delivery]").click();
    const delivery = page.locator("[data-panel-delivery]");
    await expect(delivery).toContainText("لا يوجد ملف للتنزيل ولا رابط منشور");
    await expect(delivery.locator("a[download], a[href]")).toHaveCount(0);
    await expect(page.locator("[data-station-panel=delivery] [data-panel-status]")).toHaveText("مكتملة");
  });

  test("a changed approval stops the factory: no production on an old approval", async ({ page }) => {
    await seedApproved(page);
    await openFactory(page, "?speed=4");
    await page.locator("[data-production-toggle]").click();
    await expect(page.locator("[data-station-btn=setup]")).toHaveAttribute("data-status", "done", { timeout: 15_000 });
    await page.locator("[data-production-toggle]").click();
    // choosing the other model withdraws the design approval
    await page.goto("/prototypes");
    await page.locator("[data-choose=A]").click();
    await page.goto("/factory");
    await expect(page.locator("[data-factory-gate]")).toContainText("اعتمد نموذجك أولًا");
    await expect(page.locator("[data-factory-gate]")).toContainText("لا يتابع المصنع إنتاجًا على اعتماد قديم");
    // approved again: production starts over
    await page.locator("[data-gate-go]").click();
    await page.locator("[data-approve-design]").click();
    await expect(page).toHaveURL(/\/factory\/?$/);
    await expect(page.locator("[data-production-state]")).toHaveText("الإنتاج لم يبدأ");
    await expect(page.locator("[data-station-btn=setup]")).toHaveAttribute("data-status", "waiting");
  });

  test("reduced motion: no opening move, the camera is placed at once", async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await seedApproved(page);
    await openFactory(page);
    await expect(screen(page)).toHaveAttribute("data-camera-mode", "follow", { timeout: 3000 });
    await page.locator("[data-station-btn=quality]").click();
    await expect(screen(page)).toHaveAttribute("data-camera-settled", "", { timeout: 1000 });
    expect(await page.evaluate(() => window.__tashfeerFactory!.inView("quality"))).toBe(true);
    await ctx.close();
  });

  test("without WebGL: a clear message, the approved model, and the stations and their panel still work", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const get = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
        return /webgl/.test(type) ? null : (get as (...a: unknown[]) => unknown).call(this, type, ...rest);
      } as typeof get;
    });
    await seedApproved(page);
    await page.goto("/factory");
    await expect(screen(page)).toHaveAttribute("data-webgl", "no");
    await expect(page.locator("[data-webgl-fallback]")).toContainText("WebGL غير متاح");
    await expect(page.locator("[data-webgl-fallback] [data-prototype-preview=B]")).toBeVisible();
    await expect(page.locator("[data-factory-canvas]")).toHaveCount(0);
    await page.locator("[data-station-btn=quality]").click();
    await expect(page.locator("[data-station-panel=quality]")).toBeVisible();
  });

  test("the station panel: name, agent, status and task up front; outputs and checks on request; the simulation labelled", async ({
    page,
  }) => {
    await seedApproved(page);
    await openFactory(page);
    await page.locator("[data-station-btn=quality]").click();
    const panel = page.locator("[data-station-panel=quality]");
    await expect(panel.locator("h2")).toHaveText("الجودة");
    await expect(panel.locator("[data-panel-status]")).toHaveText("لم تبدأ");
    await expect(panel.locator("[data-panel-agent]")).toHaveText("اختبار الجودة");
    await expect(panel.locator("[data-panel-task]")).toBeVisible();
    await expect(panel).toContainText("محاكاة تفاعلية");
    // the rest is closed until asked for
    const details = panel.locator("[data-panel-details]");
    await expect(details).not.toHaveAttribute("open", "");
    await expect(panel.locator("[data-panel-output]")).toBeHidden();
    await expect(panel.locator("[data-panel-checks]")).toBeHidden();
    await details.locator("summary").click();
    await expect(panel.locator("[data-panel-output]")).toBeVisible();
    await expect(panel.locator("[data-panel-checks]")).toBeVisible();
  });

  test("the visual sample: the reference angle frames the product's case and the first station; the camera can still go round it", async ({
    page,
  }) => {
    await seedApproved(page);
    await openFactory(page);
    await cameraSettled(page);
    await page.locator("[data-cam-sample]").click();
    await expect(screen(page)).toHaveAttribute("data-camera-mode", "sample");
    await cameraSettled(page);
    expect(await page.evaluate(() => window.__tashfeerFactory!.inView("setup"))).toBe(true);
    // camera moves never change production
    await expect(page.locator("[data-production-state]")).toHaveText("الإنتاج لم يبدأ");
    await expect(page.locator("[data-station-btn=setup]")).toHaveAttribute("data-status", "waiting");
  });

  test("no console errors on the factory", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(e.message));
    await seedApproved(page);
    await openFactory(page);
    await cameraSettled(page);
    await page.locator("[data-station-btn=quality]").click();
    await cameraSettled(page);
    expect(errors).toEqual([]);
  });
});
