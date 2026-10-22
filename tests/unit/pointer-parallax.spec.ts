import { expect, test } from "@playwright/test";
import { SMOOTHING_S, smoothToward } from "@/lib/pointer-parallax";

/** The shared pointer signal after `frames` updates of `dt` seconds each, from 0 toward 1. */
function after(frames: number, dt: number) {
  let v = 0;
  for (let i = 0; i < frames; i++) v = smoothToward(v, 1, dt);
  return v;
}

test("P1-12 the pointer smoothing keeps the approved step: 8 % of the gap per frame at 60 Hz", () => {
  expect(SMOOTHING_S).toBeCloseTo(-1 / (60 * Math.log(1 - 0.08)), 3);
  expect(smoothToward(0, 1, 1 / 60)).toBeCloseTo(0.08, 3);
  // 1.5 s at 60 Hz, P1-12's wait: where the per-frame rule was too — settled
  expect(after(90, 1 / 60)).toBeCloseTo(1 - 0.92 ** 90, 3);
});

test("P1-12 the pointer smoothing takes the same time at any frame rate", () => {
  for (const seconds of [0.1, 0.5, 1.5]) {
    const at60 = after(Math.round(seconds * 60), 1 / 60);
    expect(after(Math.round(seconds * 120), 1 / 120), `${seconds} s at 120 Hz`).toBeCloseTo(at60, 6);
    expect(after(Math.round(seconds * 30), 1 / 30), `${seconds} s at 30 Hz`).toBeCloseTo(at60, 6);
    expect(after(1, seconds), `${seconds} s in a single frame`).toBeCloseTo(at60, 6);
  }
  // the renderer P1-12 met in WebKit in CI, one frame in 1.5 s: now settled, not one 8 % step of the way
  expect(after(1, 1.5)).toBeGreaterThan(0.999);
});

test("P1-12 the pointer smoothing never overshoots: the parallax stays within its amplitude (≤ 12 px)", () => {
  for (const dt of [1 / 120, 1 / 60, 0.5, 5, 1e6]) {
    for (const [from, to] of [
      [-0.4, 1],
      [1, -1],
      [0.2, 0.2],
    ] as const) {
      const v = smoothToward(from, to, dt);
      expect(v).toBeGreaterThanOrEqual(Math.min(from, to));
      expect(v).toBeLessThanOrEqual(Math.max(from, to));
    }
  }
  // no time, no move
  expect(smoothToward(0.3, 1, 0)).toBe(0.3);
  expect(smoothToward(0.3, 1, -0.01)).toBe(0.3);
});
