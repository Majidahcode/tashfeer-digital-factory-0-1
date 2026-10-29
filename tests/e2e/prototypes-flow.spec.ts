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

test("«عرض النموذج» opens a larger preview that closes; choosing there counts", async ({
  page,
}) => {
  await toPrototypes(page);
  await page.locator("[data-view=A]").click();
  const dialog = page.locator("dialog[data-preview-dialog=A]");
  await expect(dialog).toBeVisible();
  const big = await dialog.locator("[data-prototype-preview=A]").boundingBox();
  const small = await page
    .locator("[data-prototype=A] [data-prototype-preview=A]")
    .boundingBox();
  expect(big!.width).toBeGreaterThan(small!.width * 1.3);
  await dialog.locator("[data-dialog-close]").click();
  await expect(dialog).toBeHidden();
  await page.locator("[data-view=B]").click();
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await page.locator("[data-view=B]").click();
  await page
    .locator("dialog[open]")
    .getByRole("button", { name: "اختيار هذا النموذج" })
    .click();
  await page.locator("dialog[open] [data-dialog-close]").click();
  expect(await chosen(page)).toEqual(["B"]);
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

test("approving with unexecuted requests says so first; the approval is saved, survives a reload, and names the next step", async ({
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
  await expect(page.locator("[data-design-approved]")).toHaveCount(0);
  await page.locator("[data-approve-anyway]").click();
  const done = page.locator("[data-design-approved]");
  await expect(done).toContainText("النموذج B");
  await expect(done).toContainText("واجهة المصنع");
  await expect(done).toContainText("لم يبدأ أي إنتاج فعلي");
  await page.reload();
  await expect(done).toBeVisible();
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

test("the review fits: no sideways scroll; both previews are shown", async ({
  page,
}) => {
  await toPrototypes(page);
  const r = await page.evaluate(() => ({
    sideways:
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
    previews: [
      ...document.querySelectorAll("[data-prototype] [data-prototype-preview]"),
    ].map((e) => Math.round(e.getBoundingClientRect().width)),
  }));
  expect(r.sideways).toBeLessThanOrEqual(0);
  expect(r.previews).toHaveLength(2);
  for (const w of r.previews) expect(w).toBeGreaterThan(250);
});
