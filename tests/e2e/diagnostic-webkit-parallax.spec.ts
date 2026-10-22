import { test } from "@playwright/test";
import { openHome } from "./support";

/*
 * TEMPORARY — CI evidence for PR #1, removed with the fix it informs. Defined only in the cross-engine job
 * (E2E_ENGINES=all). Runs on webkit-1440 (the failing project), firefox-1440 (control) and firefox-390 (Firefox's
 * touch emulation, to check directly whether a mouse there produces pointer events at all); not on the isMobile phone.
 *
 * It replays P1-12's two pointer moves on the unmodified implementation and records, before and after each: the
 * pointer and mouse events the window receives (count, pointerType, target, time), reduced motion (media query and
 * the background's own flag), the offset the background draws with (data-parallax), the computed transform of the DOM
 * parallax layer, the elapsed time and every rendered frame. From the measured frames it gives what the current
 * smoothing (8 % of the gap per frame) and a time-based one (τ = 0.2 s, the same at 60 Hz) would show at P1-12's read.
 * The report is this test's failure message: the only output of a CI run that the development session can read back.
 */

type Snap = {
  at: number;
  drawn: string;
  layer: string;
  motion: string;
  reduce: boolean;
  frames: number[];
  moves: number[];
  counts: Record<string, number>;
  target: string;
};

if (process.env.E2E_ENGINES === "all") {
  test.describe("diagnostic: WebKit pointer parallax", () => {
    test.describe.configure({ retries: 0 });

    test("what the pointer does to the background", async ({ page }, info) => {
      test.skip(Boolean(info.project.use.isMobile), "isMobile phone profile");
      test.setTimeout(90_000);
      await openHome(page);
      await page.evaluate(() => {
        const w = window as unknown as { diagSnap: () => Snap };
        const frames: number[] = [];
        const moves: number[] = [];
        const counts: Record<string, number> = {};
        let target = "";
        const tick = () => {
          if (frames.length < 20_000) frames.push(performance.now());
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
        const count = (k: string) => (counts[k] = (counts[k] ?? 0) + 1);
        window.addEventListener(
          "pointermove",
          (e) => {
            count(`pointermove/${e.pointerType || "(empty)"}`);
            moves.push(performance.now());
            if (!target) {
              const t = e.target as Element | null;
              target = t ? `${t.tagName.toLowerCase()}${t.getAttribute("data-site-header") !== null ? "[data-site-header]" : ""}` : "?";
            }
          },
          { capture: true, passive: true },
        );
        window.addEventListener("mousemove", () => count("mousemove"), { capture: true, passive: true });
        const root = document.querySelector<HTMLElement>("[data-ambient-background]")!;
        const layer = document.querySelector<HTMLElement>("[data-parallax-layer]");
        w.diagSnap = () => ({
          at: performance.now(),
          drawn: root.dataset.parallax ?? "(none)",
          layer: layer ? getComputedStyle(layer).transform : "(no layer)",
          motion: root.dataset.ambientMotion ?? "(none)",
          reduce: matchMedia("(prefers-reduced-motion: reduce)").matches,
          frames: [...frames],
          moves: [...moves],
          counts: { ...counts },
          target,
        });
      });
      const snap = () => page.evaluate(() => (window as unknown as { diagSnap: () => Snap }).diagSnap());
      const vp = page.viewportSize()!;
      const media = await page.evaluate(() =>
        ["(pointer: fine)", "(hover: hover)", "(any-pointer: coarse)"].map((q) => `${q}=${matchMedia(q).matches}`).join(" "),
      );
      const x0 = (s: Snap) => Number(s.drawn.split(" ")[0]);
      const line = (label: string, s: Snap, since: Snap) => {
        const frames = s.frames.filter((t) => t > since.at).length;
        return `${label} +${Math.round(s.at - since.at)}ms frames+${frames} drawn=${s.drawn} layer=${s.layer} motion=${s.motion} reduce=${s.reduce} events=${JSON.stringify(s.counts)}`;
      };
      const rest = await snap();
      const report = [`${info.project.name} ${vp.width}x${vp.height} ${media} target=${rest.target || "-"}`, line("rest", rest, rest)];
      for (const [x, y] of [
        [2, 2],
        [vp.width - 3, vp.height - 3],
      ] as const) {
        const before = await snap();
        const settled = -((x / vp.width) * 2 - 1) * 12;
        await page.mouse.move(x, y, { steps: 8 });
        const moved = await snap();
        await page.waitForTimeout(1_500); // what P1-12 waits
        const read = await snap();
        await page.waitForTimeout(3_000);
        const later = await snap();
        const firstMove = read.moves.find((t) => t > before.at);
        report.push(`move to (${x},${y}): drawn x ${x0(before).toFixed(1)} → settled ${settled.toFixed(1)}; target=${read.target || "-"}`);
        report.push(line(" after the move", moved, before), line(" at P1-12's read", read, before), line(" 3 s later", later, before));
        if (firstMove === undefined) {
          report.push(" no pointermove reached the window after this move");
          continue;
        }
        // frames that ran the smoothing after the first pointermove, up to P1-12's read
        const f = read.frames.filter((t) => t > firstMove && t <= read.at);
        const span = f.length ? f[f.length - 1]! - firstMove : 0;
        const gap = settled - x0(before);
        const measured = gap === 0 ? 0 : (x0(read) - x0(before)) / gap;
        const perFrame = (n: number) => 1 - 0.92 ** Math.max(0, n);
        const timed = 1 - Math.exp(-span / 1000 / 0.2);
        report.push(
          ` model at P1-12's read: ${f.length} frames after the first pointermove (first +${f.length ? Math.round(f[0]! - firstMove) : "-"}ms, last +${Math.round(span)}ms);` +
            ` measured ${(measured * 100).toFixed(1)} % of the way;` +
            ` per-frame model ${(perFrame(f.length - 1) * 100).toFixed(1)}–${(perFrame(f.length) * 100).toFixed(1)} %;` +
            ` time-based model ${(timed * 100).toFixed(1)} % (= ${(x0(before) + gap * timed).toFixed(1)} px)`,
        );
      }
      throw new Error(`diagnostic report\n${report.join("\n")}`);
    });
  });
}
