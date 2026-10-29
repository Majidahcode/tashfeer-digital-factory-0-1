import { expect, test, type Page } from "@playwright/test";
import { openHome, settled } from "./support";

/*
 * Screen 4 — «مراجعة النموذجين»: reached by approving the team; two illustrative models; one choice; change requests
 * tied to their model and kept across a reload (files by name only); approval with the unexecuted requests stated;
 * the approval marked for review when the idea, the team or the choice changes; the way in without an approved team.
 */

const IDEA = "أبي منصة حجز مواعيد لعيادتي، يحجز فيها العملاء ويدفعون مسبقًا";

async function toPrototypes(page: Page) {
  await openHome(page);
  await page.locator("[data-chat-shell]").getByLabel("وصف المشروع").fill(IDEA);
  await page.locator("[data-chat-enter]").click();
  await page.locator("[data-agents-screen]").waitFor();
  await settled(page);
  await page.locator("[data-confirm-team]").click();
  await page
    .locator("[data-team-screen] [data-agent-card]")
    .first()
    .waitFor({ state: "attached" });
  await settled(page);
  await page.locator("[data-approve-team]").click();
  await expect(page).toHaveURL(/\/prototypes\/?$/);
  await page.locator("[data-prototype=A]").waitFor();
  await settled(page);
}

const chosen = (page: Page) =>
  page.evaluate(() =>
    [
      ...document.querySelectorAll<HTMLElement>(
        "[data-prototype][data-selected]",
      ),
    ].map((e) => e.dataset.prototype),
  );

test("two models with a name and a direction each, clearly illustrative; approval disabled until one is chosen; only one at a time", async ({
  page,
}) => {
  await toPrototypes(page);
  for (const id of ["A", "B"]) {
    const card = page.locator(`[data-prototype=${id}]`);
    await expect(card.getByRole("heading")).toHaveText(`النموذج ${id}`);
    await expect(card.locator("[data-prototype-preview]")).toContainText(
      "معاينة توضيحية",
    );
  }
  await expect(page.getByText("لم تُولَّد من فكرتك")).toBeVisible();
  await expect(page.locator("[data-tashfeer]")).toBeVisible();
  await expect(page.locator("[data-portal]")).toHaveCount(0);
  await expect(page.locator("[data-approve-design]")).toBeDisabled();
  await page.locator("[data-choose=A]").click();
  expect(await chosen(page)).toEqual(["A"]);
  await page.locator("[data-choose=B]").click();
  expect(await chosen(page)).toEqual(["B"]);
  await expect(page.locator("[data-approve-design]")).toBeEnabled();
});

test("the models are seen on the page itself: two actions each, no comparison window; «مقارنة مباشرة» is a label", async ({
  page,
}) => {
  await toPrototypes(page);
  await expect(page.locator("[data-view]")).toHaveCount(0);
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /مقارنة/ })).toHaveCount(0);
  for (const id of ["A", "B"]) {
    const card = page.locator(`[data-prototype=${id}]`);
    // the two actions, and the «معاينة توضيحية» stamp on the preview
    await expect(card.getByRole("button")).toHaveCount(3);
    await expect(card.locator(`[data-choose=${id}]`)).toBeVisible();
    await expect(card.locator(`[data-request=${id}]`)).toBeVisible();
    await expect(card.locator(`[data-open-preview=${id}]`)).toHaveText("معاينة توضيحية");
  }
  const label = page.locator("[data-compare-label]");
  expect(await label.evaluate((e) => e.tagName)).toBe("SPAN");
  const wide = (page.viewportSize()?.width ?? 0) >= 1100;
  if (wide) await expect(label).toHaveText("مقارنة مباشرة");
  else await expect(label).toBeHidden();
});

test("«معاينة توضيحية» opens that model in a larger window; choosing there counts; it closes", async ({
  page,
}) => {
  await toPrototypes(page);
  await page.locator("[data-open-preview=B]").click();
  const dialog = page.locator("dialog[data-preview-dialog=B]");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading")).toHaveText("النموذج B");
  const big = await dialog.locator("[data-prototype-preview=B]").boundingBox();
  const small = await page.locator("[data-prototype=B] [data-prototype-preview=B]").boundingBox();
  expect(big!.width).toBeGreaterThanOrEqual(small!.width);
  await expect(dialog.locator("[data-open-preview]")).toHaveCount(0);
  await dialog.locator("[data-dialog-choose=B]").click();
  expect(await chosen(page)).toEqual(["B"]);
  await expect(dialog.locator("[data-dialog-choose=B]")).toHaveText(/النموذج المختار/);
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await page.locator("[data-open-preview=A]").click();
  await page.locator("dialog[open] [data-dialog-close]").click();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  // «طلب تعديل» in the window closes it and opens the form for that model
  await page.locator("[data-open-preview=A]").click();
  await page.locator("[data-dialog-request=A]").click();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await expect(page.locator("[data-note-form=A]")).toBeVisible();
});

test("the change-request form is hidden until asked for, names its model, and closes", async ({
  page,
}) => {
  await toPrototypes(page);
  await expect(page.locator("[data-note-form]")).toHaveCount(0);
  await expect(page.locator("[data-note-text]")).toHaveCount(0);
  await page.locator("[data-request=A]").click();
  const form = page.locator("[data-note-form=A]");
  await expect(form).toBeVisible();
  await expect(form).toContainText("طلب تعديل على النموذج A");
  await expect(page.locator("[data-note-text]")).toBeFocused();
  await expect(page.locator("[data-note-attach]")).toBeVisible();
  await expect(page.locator("[data-request=A]")).toHaveAttribute("aria-expanded", "true");
  await page.locator("[data-request=B]").click();
  await expect(page.locator("[data-note-form=B]")).toContainText("النموذج B");
  await page.locator("[data-note-close]").click();
  await expect(page.locator("[data-note-form]")).toHaveCount(0);
});

test("a change request is tied to its model, kept across a reload, and its file then needs re-attaching", async ({
  page,
}) => {
  await toPrototypes(page);
  await page.locator("[data-request=B]").click();
  await expect(page.locator("[data-note-target=B]")).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await page.locator("[data-note-text]").fill("أريد الأزرار أهدأ قليلًا");
  const chooser = page.waitForEvent("filechooser");
  await page.locator("[data-note-attach]").click();
  await (
    await chooser
  ).setFiles({
    name: "مرجع.png",
    mimeType: "image/png",
    buffer: Buffer.from("89504e47", "hex"),
  });
  await page.locator("[data-note-save]").click();
  await page.locator("[data-request=A]").click();
  await page.locator("[data-note-text]").fill("ملاحظة على النموذج الفاتح");
  await page.locator("[data-note-save]").click();

  const notes = page.locator("[data-note-list] li");
  await expect(notes).toHaveCount(2);
  await expect(page.locator("[data-note=B]")).toContainText(
    "أريد الأزرار أهدأ قليلًا",
  );
  await expect(page.locator("[data-note=B]")).toContainText(
    "لم ينفّذها وكيل بعد",
  );
  await expect(page.locator("[data-note=A]")).toContainText(
    "ملاحظة على النموذج الفاتح",
  );
  await expect(page.locator("[data-request=B]")).toContainText("(1)");
  await expect(page.locator("[data-note=B] [data-stale]")).toHaveCount(0);

  await page.reload();
  await page.locator("[data-prototype=A]").waitFor();
  await expect(notes).toHaveCount(2);
  await expect(page.locator("[data-note=B] [data-stale]")).toContainText(
    "تحتاج إعادة إرفاق",
  );
});

test("approving with unexecuted requests says so first; the approval is saved and opens the factory; back here it stands", async ({
  page,
}) => {
  await toPrototypes(page);
  await page.locator("[data-choose=B]").click();
  await page.locator("[data-request=B]").click();
  await page.locator("[data-note-text]").fill("تعديل لم يُنفّذ");
  await page.locator("[data-note-save]").click();
  await page.locator("[data-approve-design]").click();
  await expect(page.locator("[data-approve-confirm]")).toContainText(
    "لم تُنفَّذ بعد",
  );
  await expect(page).toHaveURL(/\/prototypes\/?$/);
  await page.locator("[data-approve-anyway]").click();
  await expect(page).toHaveURL(/\/factory\/?$/);
  await page.goto("/prototypes");
  const done = page.locator("[data-design-approved]");
  await expect(done).toContainText("النموذج B");
  await expect(page.locator("[data-enter-factory]")).toBeVisible();
  // choosing the other model withdraws it
  await page.locator("[data-choose=A]").click();
  await expect(page.locator("[data-design-review]")).toBeVisible();
  await expect(page.locator("[data-approve-design]")).toBeEnabled();
});

test("changing the idea after the design is approved marks the approval for review; the team and data come back", async ({
  page,
}) => {
  await toPrototypes(page);
  await page.locator("[data-choose=A]").click();
  await page.locator("[data-approve-design]").click();
  await expect(page).toHaveURL(/\/factory\/?$/);
  await page.goto("/prototypes");
  await expect(page.locator("[data-design-approved]")).toBeVisible();
  await page.locator("[data-back-to-team]").click();
  await page.locator("[data-team-screen]").waitFor();
  await settled(page);
  await page.locator("[data-back-to-agents]").click();
  await page.locator("[data-agents-screen]").waitFor();
  await settled(page);
  await page.locator("[data-back-to-idea]").click();
  const field = page.locator("[data-chat-shell]").getByLabel("وصف المشروع");
  await expect(field).toHaveValue(IDEA);
  await field.fill(`${IDEA} مع تطبيق جوال`);
  await page.goto("/prototypes");
  await page.locator("[data-prototype=A]").waitFor();
  await expect(page.locator("[data-design-review]")).toBeVisible();
  await expect(page.locator("[data-design-approved]")).toHaveCount(0);
  expect(await chosen(page)).toEqual(["A"]);
});

test("opened without an approved team, the screen points to the step that is needed", async ({
  page,
}) => {
  await page.goto("/prototypes");
  await expect(page.locator("[data-prototypes-gate]")).toBeVisible();
  await expect(page.locator("[data-prototypes-gate]")).toContainText(
    "اختر فريقك أولًا",
  );
  await page.locator("[data-gate-go]").click();
  await expect(page).toHaveURL(/\/agents\/?$/);
});

test("the previews are large from the start: side by side on a desktop, one under the other below; nothing cut", async ({
  page,
}) => {
  await toPrototypes(page);
  const r = await page.evaluate(() => ({
    vw: document.documentElement.clientWidth,
    sideways:
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
    previews: [
      ...document.querySelectorAll<HTMLElement>("[data-prototype] [data-prototype-preview]"),
    ].map((e) => {
      const b = e.getBoundingClientRect();
      return { x: b.x, y: b.y, w: b.width, h: b.height, cut: e.scrollHeight - e.clientHeight };
    }),
  }));
  expect(r.sideways).toBeLessThanOrEqual(0);
  expect(r.previews).toHaveLength(2);
  const [a, b] = r.previews;
  for (const p of r.previews) expect(p.cut).toBeLessThanOrEqual(1);
  expect(Math.abs(a!.w - b!.w)).toBeLessThanOrEqual(1);
  expect(Math.abs(a!.h - b!.h)).toBeLessThanOrEqual(1);
  if (r.vw >= 1100) {
    // side by side, together most of the width
    expect(Math.abs(a!.y - b!.y)).toBeLessThanOrEqual(1);
    expect(a!.w + b!.w).toBeGreaterThan(r.vw * 0.6);
  } else {
    // one under the other, each nearly the full width
    expect(b!.y).toBeGreaterThan(a!.y + a!.h);
    expect(a!.w).toBeGreaterThan(Math.min(r.vw * 0.8, 700));
  }
});

test("on a desktop the two models and the approval are on the first screen", async ({ page }) => {
  const vp = page.viewportSize()!;
  test.skip(vp.width < 1100 || vp.height < 760, "desktop sizes");
  await toPrototypes(page);
  const bottom = await page
    .locator("[data-approve-design]")
    .evaluate((e) => e.getBoundingClientRect().bottom);
  expect(bottom).toBeLessThanOrEqual(vp.height);
});
