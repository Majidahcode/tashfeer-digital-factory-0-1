import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { openHome } from "./support";

const FOCUSABLE =
  "a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex='-1'])";

test("P1-15 axe-core reports no serious or critical violations", async ({ page }, info) => {
  await openHome(page);
  const results = await new AxeBuilder({ page }).analyze();
  const blocking = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  const other = results.violations.filter((v) => !blocking.includes(v));
  info.annotations.push({
    type: "axe (moderate/minor)",
    description: other.map((v) => `${v.id} (${v.impact}, ${v.nodes.length})`).join(", ") || "none",
  });
  info.annotations.push({ type: "axe incomplete", description: results.incomplete.map((v) => `${v.id} (${v.nodes.length})`).join(", ") || "none" });
  expect(blocking.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
});

test("P1-15 every interactive element is reachable with Tab and shows a visible focus indicator", async ({ page }) => {
  await openHome(page);
  // Baseline outline/shadow of each focusable element (and its parent, for :focus-within rings) while unfocused.
  const baseline = await page.evaluate((selector) => {
    const sig = (el: Element | null) => {
      if (!el) return "";
      const cs = getComputedStyle(el);
      return `${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor} | ${cs.boxShadow}`;
    };
    return [...document.querySelectorAll(selector)].map((el, i) => {
      el.setAttribute("data-focus-probe", String(i));
      const name = el.getAttribute("aria-label") || el.id || el.textContent?.trim().slice(0, 24) || el.tagName;
      return { name, self: sig(el), parent: sig(el.parentElement) };
    });
  }, FOCUSABLE);
  expect(baseline.length).toBeGreaterThanOrEqual(5);

  const reached = new Map<number, { changed: boolean; onScreen: boolean }>();
  for (let i = 0; i < baseline.length + 4 && reached.size < baseline.length; i++) {
    await page.keyboard.press("Tab");
    const info = await page.evaluate(async () => {
      const el = document.activeElement;
      const probe = el?.getAttribute("data-focus-probe");
      if (!el || probe == null) return null;
      // let focus transitions finish (the skip link slides in) before judging position
      await Promise.all(el.getAnimations().map((a) => a.finished.catch(() => null)));
      const sig = (node: Element | null) => {
        if (!node) return "";
        const cs = getComputedStyle(node);
        return `${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor} | ${cs.boxShadow}`;
      };
      const r = el.getBoundingClientRect();
      return {
        probe: Number(probe),
        self: sig(el),
        parent: sig(el.parentElement),
        onScreen: r.width > 0 && r.height > 0 && r.right > 0 && r.left < innerWidth && r.bottom > 0 && r.top < innerHeight,
      };
    });
    if (!info) continue;
    const base = baseline[info.probe]!;
    reached.set(info.probe, { changed: info.self !== base.self || info.parent !== base.parent, onScreen: info.onScreen });
  }
  const report = baseline.map((b, i) => ({ name: b.name, ...(reached.get(i) ?? { changed: false, onScreen: false, missed: true }) }));
  expect(report.filter((r) => !r.changed || !r.onScreen)).toEqual([]);
});

test("loads without console errors, page errors or failed requests", async ({ page }) => {
  const problems: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") problems.push(`console: ${m.text()}`);
  });
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  page.on("requestfailed", (r) => problems.push(`failed: ${r.url()} ${r.failure()?.errorText ?? ""}`));
  page.on("response", (r) => {
    if (r.status() >= 400) problems.push(`${r.status()}: ${r.url()}`);
  });
  await openHome(page);
  await page.mouse.move(300, 300);
  await page.keyboard.press("Tab");
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(800);
  expect(problems).toEqual([]);
});

test("the intake is an honest design preview: nothing pretends to send, upload or record", async ({ page }) => {
  await openHome(page);
  const chat = page.locator("[data-chat-shell]");
  await expect(chat.getByRole("button", { name: "ادخل" })).toBeDisabled();
  for (const label of ["الوصف", "روابط", "ملفات", "فيديو", "صور"]) await expect(chat.getByRole("button", { name: label })).toBeDisabled();
  await expect(chat.getByRole("button", { name: /تسجيل صوتي/ })).toBeDisabled();
  await expect(page.getByRole("button", { name: /تحدّث الآن/ })).toBeDisabled();
  await expect(chat).toContainText("معاينة تصميم — غير مفعّل");

  const box = chat.getByLabel("وصف المشروع");
  await box.fill("أبي موقع لمطعمي");
  await box.press("Enter");
  await expect(chat.getByRole("status")).toHaveText("معاينة تصميم: الإرسال والمرفقات والصوت غير مفعّلة بعد.");
  await expect(box).toHaveValue("أبي موقع لمطعمي");
  await expect(chat.getByRole("log")).not.toContainText("أبي موقع لمطعمي");
});

test("DEC-20 the header offers only real destinations, and every in-page link resolves", async ({ page }) => {
  await openHome(page);
  const header = page.locator("[data-site-header]");
  await expect(header.locator("a[href], button")).toHaveCount(2);
  await expect(header.getByRole("link", { name: "ابدأ بوصف مشروعك" })).toHaveAttribute("href", "#intake");
  const hashes = await page.locator("a[href^='#']").evaluateAll((els) => els.map((e) => e.getAttribute("href")!));
  for (const hash of hashes) await expect(page.locator(hash)).toHaveCount(1);
  await expect(page.locator("nav")).toHaveCount(0);
});
