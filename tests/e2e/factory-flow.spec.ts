import { expect, test, type Page } from "@playwright/test";
import { openHome, settled } from "./support";

/*
 * Screen 5 — the production factory (phase 1): reached by approving a model; a real 3D scene (WebGL) with one product on
 * a curved line; a directed tour — the opening shot, the camera following the product, a move to a chosen station and
 * back to the product — and no free camera (no drag, wheel or finger moves it); one card for the station in view;
 * pausing the tour's motion; keyboard; reduced motion; no WebGL.
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
  // on the widest screens a software-drawn frame takes a second or more: three times the time there
  test.beforeEach(({ page }) => {
    if ((page.viewportSize()?.width ?? 0) > 1440) test.slow();
  });

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

  test("the tour: the opening shot settles beside the product; production moves it and the camera and the card go with it", async ({
    page,
  }) => {
    await seedApproved(page);
    await openFactory(page, "?speed=4");
    await cameraSettled(page);
    await expect(screen(page)).toHaveAttribute("data-camera-mode", "follow");
    expect(await page.evaluate(() => window.__tashfeerFactory!.productInView())).toBe(true);
    // the card shows where the product is; nothing chosen, so no way back to show
    const card = page.locator("[data-station-panel]");
    await expect(card).toHaveAttribute("data-station-panel", "setup");
    await expect(card).toHaveAttribute("data-card-mode", "follow");
    await expect(card.locator("[data-follow-return]")).toHaveCount(0);
    const before = await page.evaluate(() => window.__tashfeerFactory!.pose());
    await page.locator("[data-production-toggle]").click();
    // the product reaches the second station: the card follows it, the camera follows it
    await expect(card).toHaveAttribute("data-station-panel", "interfaces", { timeout: 60_000 });
    await expect
      .poll(() => page.evaluate(() => window.__tashfeerFactory!.productInView()), { timeout: 30_000 })
      .toBe(true);
    const after = await page.evaluate(() => window.__tashfeerFactory!.pose());
    expect(Math.hypot(...after.pos.map((v, i) => v - before.pos[i]!))).toBeGreaterThan(1);
    await expect(screen(page)).toHaveAttribute("data-camera-mode", "follow");
  });

  test("choosing a station: a smooth move, the station framed, production untouched; then back to the product", async ({
    page,
  }) => {
    // smoothness is measured frame by frame; WebGL here is drawn in software (a frame or two a second on a large
    // screen), so it is measured on a small one, where there are enough frames to see the path
    const vp = page.viewportSize()!;
    if (vp.width > 800) await page.setViewportSize({ width: 800, height: 500 });
    await seedApproved(page);
    await openFactory(page);
    await cameraSettled(page);
    const toQuality = await samplePath(page, () => page.locator("[data-station-btn=quality]").click());
    await expect(screen(page)).toHaveAttribute("data-camera-mode", "station");
    await expect(screen(page)).toHaveAttribute("data-camera-station", "quality");
    const q = pathStats(toQuality);
    expect(q.samples).toBeGreaterThan(5);
    expect(q.total).toBeGreaterThan(2);
    // no jump: no single frame covers most of the way
    expect(q.maxStep).toBeLessThan(q.total * 0.4);
    expect(await page.evaluate(() => window.__tashfeerFactory!.inView("quality"))).toBe(true);
    const card = page.locator("[data-station-panel=quality]");
    await expect(card).toHaveAttribute("data-card-mode", "station");
    // a future stage: waiting, and no output shown as made
    await expect(card.locator("[data-panel-status]")).toHaveText("لم تبدأ");
    await expect(card.locator("[data-panel-task]")).toHaveText("بانتظار وصول منتجك إلى هذه المرحلة");
    await expect(card.locator("[data-card-output]")).toHaveCount(0);
    // the camera stays with the visitor while they read
    const held = await page.evaluate(() => window.__tashfeerFactory!.pose());
    await page.waitForTimeout(1500);
    const still = await page.evaluate(() => window.__tashfeerFactory!.pose());
    expect(Math.hypot(...still.pos.map((v, i) => v - held.pos[i]!))).toBeLessThan(1e-3);
    // choosing a station changes nothing in production
    await expect(page.locator("[data-production-state]")).toHaveText("الإنتاج لم يبدأ");
    await expect(page.locator("[data-station-btn=setup]")).toHaveAttribute("data-status", "waiting");

    const back = await samplePath(page, () => card.locator("[data-follow-return]").click());
    const b = pathStats(back);
    expect(b.maxStep).toBeLessThan(b.total * 0.4);
    await expect(screen(page)).toHaveAttribute("data-camera-mode", "follow");
    expect(await page.evaluate(() => window.__tashfeerFactory!.productInView())).toBe(true);
    await expect(page.locator("[data-station-panel]")).toHaveAttribute("data-card-mode", "follow");
  });

  test("the card never covers the product, following it or at its station", async ({ page }) => {
    await seedApproved(page);
    await openFactory(page);
    await cameraSettled(page);
    // production runs until the product is at work in the first station, then pauses there (from inside the page: on a
    // slow software renderer an outside click can come late)
    await page.locator("[data-production-toggle]").click();
    await page.evaluate(
      () =>
        new Promise<void>((done) => {
          const t = setInterval(() => {
            if (document.querySelector<HTMLElement>("[data-station-btn=setup]")?.dataset.status !== "active") return;
            clearInterval(t);
            document.querySelector<HTMLElement>("[data-production-toggle]")!.click();
            done();
          }, 20);
        }),
    );
    await expect(screen(page)).toHaveAttribute("data-production", "paused");
    for (const step of ["follow", "station"] as const) {
      if (step === "station") await page.locator("[data-station-btn=setup]").click();
      // the camera has come to rest on the shot
      await cameraSettled(page);
      await expect
        .poll(async () => {
          const a = await page.evaluate(() => window.__tashfeerFactory!.pose());
          await page.waitForTimeout(400);
          const b = await page.evaluate(() => window.__tashfeerFactory!.pose());
          return Math.hypot(...a.pos.map((v, i) => v - b.pos[i]!));
        }, { timeout: 60_000 })
        .toBeLessThan(1e-3);
      const p = await page.evaluate(() => window.__tashfeerFactory!.productOnScreen());
      const canvas = (await page.locator("[data-factory-canvas] canvas").boundingBox())!;
      const card = (await page.locator("[data-station-panel]").boundingBox())!;
      const x = canvas.x + p.x;
      const y = canvas.y + p.y;
      const inside = x > card.x && x < card.x + card.width && y > card.y && y < card.y + card.height;
      expect(inside, `${step}: the product's middle is under the card`).toBe(false);
      expect(p.x, step).toBeGreaterThan(0);
      expect(p.x, step).toBeLessThan(canvas.width);
      expect(p.y, step).toBeGreaterThan(0);
      expect(p.y, step).toBeLessThan(canvas.height);
    }
  });

  test("no free camera: dragging, the wheel or a finger on the scene do not move it", async ({ page }, info) => {
    await seedApproved(page);
    await openFactory(page);
    await cameraSettled(page);
    const canvas = page.locator("[data-factory-canvas] canvas");
    const box = (await canvas.boundingBox())!;
    const before = await page.evaluate(() => window.__tashfeerFactory!.pose());
    if (info.project.use.hasTouch) {
      const cdp = await page.context().newCDPSession(page);
      const touch = (type: "touchStart" | "touchMove" | "touchEnd", x: number) =>
        cdp.send("Input.dispatchTouchEvent", {
          type,
          touchPoints: type === "touchEnd" ? [] : [{ x: box.x + box.width * x, y: box.y + box.height * 0.45 }],
        });
      await touch("touchStart", 0.5);
      for (let i = 1; i <= 6; i++) await touch("touchMove", 0.5 + i * 0.04);
      await touch("touchEnd", 0.74);
    } else {
      await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.45);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.3, { steps: 8 });
      await page.mouse.up();
      await page.mouse.wheel(0, -500);
    }
    await page.waitForTimeout(1500);
    const after = await page.evaluate(() => window.__tashfeerFactory!.pose());
    expect(Math.hypot(...after.pos.map((v, i) => v - before.pos[i]!))).toBeLessThan(1e-3);
    expect(Math.hypot(...after.target.map((v, i) => v - before.target[i]!))).toBeLessThan(1e-3);
    await expect(screen(page)).toHaveAttribute("data-camera-mode", "follow");
  });

  test("rapid choices between stations end on the last one, framed and still", async ({ page }) => {
    await seedApproved(page);
    await openFactory(page);
    await cameraSettled(page);
    for (const id of ["quality", "delivery", "interfaces", "quality"]) await page.locator(`[data-station-btn=${id}]`).click();
    await page.locator("[data-follow-return]").click();
    await page.locator("[data-station-btn=delivery]").click();
    await cameraSettled(page);
    await expect(screen(page)).toHaveAttribute("data-camera-station", "delivery");
    await expect(page.locator("[data-station-panel]")).toHaveAttribute("data-station-panel", "delivery");
    expect(await page.evaluate(() => window.__tashfeerFactory!.inView("delivery"))).toBe(true);
    const a = await page.evaluate(() => window.__tashfeerFactory!.pose());
    await page.waitForTimeout(1000);
    const b = await page.evaluate(() => window.__tashfeerFactory!.pose());
    expect(Math.hypot(...a.pos.map((v, i) => v - b.pos[i]!))).toBeLessThan(1e-3);
  });

  test("pausing the tour's motion holds the camera while production goes on; resuming returns to the product", async ({
    page,
  }) => {
    await seedApproved(page);
    await openFactory(page, "?speed=4");
    await cameraSettled(page);
    await page.locator("[data-tour-toggle]").click();
    await expect(screen(page)).toHaveAttribute("data-tour", "paused");
    const held = await page.evaluate(() => window.__tashfeerFactory!.pose());
    await page.locator("[data-production-toggle]").click();
    await expect(page.locator("[data-station-btn=interfaces]")).toHaveAttribute("data-status", "active", {
      timeout: 60_000,
    });
    // production went on (the product moved on to the next station), the camera did not
    await expect(screen(page)).toHaveAttribute("data-production", "running");
    const still = await page.evaluate(() => window.__tashfeerFactory!.pose());
    expect(Math.hypot(...still.pos.map((v, i) => v - held.pos[i]!))).toBeLessThan(1e-3);
    await page.locator("[data-tour-toggle]").click();
    await expect(screen(page)).toHaveAttribute("data-tour", "moving");
    await expect
      .poll(() => page.evaluate(() => window.__tashfeerFactory!.productInView()), { timeout: 30_000 })
      .toBe(true);
    const moved = await page.evaluate(() => window.__tashfeerFactory!.pose());
    expect(Math.hypot(...moved.pos.map((v, i) => v - held.pos[i]!))).toBeGreaterThan(0.5);
  });

  test("Tashfeer here is his mark and one line, changed with the production's state; his full figure is not loaded", async ({
    page,
  }) => {
    const figure: string[] = [];
    page.on("request", (r) => r.url().includes("/assets/characters/tashfeer") && figure.push(r.url()));
    await seedApproved(page);
    await openFactory(page, "?speed=4");
    const guide = page.locator("[data-guide]");
    await expect(guide).toHaveText("منتجك جاهز على خط الإنتاج. ابدأ الإنتاج متى شئت.");
    await page.locator("[data-production-toggle]").click();
    // a new line once production starts, and new lines as the product moves on (here sped up: whichever stage it is in)
    await expect(guide).not.toHaveText("منتجك جاهز على خط الإنتاج. ابدأ الإنتاج متى شئت.");
    await expect(guide).toContainText("منتجك");
    // paused: the line says so
    await page.evaluate(() => document.querySelector<HTMLElement>("[data-production-toggle]")?.click());
    await expect(guide).toContainText(/متوقف مؤقتًا|اكتمل/);
    expect(figure).toEqual([]);
  });

  test("production: runs, pauses, comes back paused after a reload where it was; quality shows the issue, its fix and the retest; delivery claims no download", async ({
    page,
  }) => {
    await seedApproved(page);
    await openFactory(page, "?speed=4");
    await page.locator("[data-production-toggle]").click();
    await expect(screen(page)).toHaveAttribute("data-production", "running");
    // pause the moment the first station is done, from inside the page: on a slow (software) renderer a click from
    // outside can arrive after the whole run has finished
    await page.evaluate(
      () =>
        new Promise<void>((done) => {
          const t = setInterval(() => {
            if (document.querySelector<HTMLElement>("[data-station-btn=setup]")?.dataset.status !== "done") return;
            clearInterval(t);
            document.querySelector<HTMLElement>("[data-production-toggle]")!.click();
            done();
          }, 20);
        }),
    );
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
    // pause from inside the page: on a slow (software) renderer the button is redrawn under an outside click
    await page.evaluate(() => document.querySelector<HTMLElement>("[data-production-toggle]")!.click());
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
