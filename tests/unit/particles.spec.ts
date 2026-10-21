import { expect, test } from "@playwright/test";
import {
  LINK_DISTANCE,
  createParticles,
  dotAlpha,
  linkAlpha,
  parallaxOffset,
  particleCount,
  stepParticles,
} from "@/lib/particles";

function seeded(seed = 7) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

test("P1-12 the particle step takes no pointer input and is deterministic", () => {
  expect(stepParticles.length).toBe(4); // (particles, frames, width, height) — no pointer parameter exists
  const ps = createParticles(40, 1440, 900, seeded());
  const a = stepParticles(ps, 1, 1440, 900);
  const b = stepParticles(ps, 1, 1440, 900);
  expect(a).toEqual(b);
});

test("P1-12 dot opacity depends on depth only (no pointer-distance brightening)", () => {
  expect(dotAlpha.length).toBe(1);
  expect(dotAlpha(0.5)).toBeCloseTo(dotAlpha(0.5));
});

test("P1-12 parallax offset never exceeds its amplitude, even for out-of-range input", () => {
  for (const x of [-5, -1, -0.3, 0, 0.7, 1, 9, Number.NaN]) {
    for (const y of [-3, -1, 0, 1, 4]) {
      for (const depth of [0, 0.35, 1, 2]) {
        const o = parallaxOffset({ x, y }, depth, 12);
        expect(Math.abs(o.x)).toBeLessThanOrEqual(12);
        expect(Math.abs(o.y)).toBeLessThanOrEqual(12);
      }
    }
  }
});

test("particles stay inside the canvas and bounce at the edges", () => {
  let ps = createParticles(60, 800, 600, seeded(3));
  for (let i = 0; i < 2000; i++) ps = stepParticles(ps, 4, 800, 600);
  for (const p of ps) {
    expect(p.x).toBeGreaterThanOrEqual(0);
    expect(p.x).toBeLessThanOrEqual(800);
    expect(p.y).toBeGreaterThanOrEqual(0);
    expect(p.y).toBeLessThanOrEqual(600);
  }
});

test("network lines fade with distance and vanish beyond the link distance", () => {
  expect(linkAlpha(LINK_DISTANCE, 1, 1)).toBe(0);
  expect(linkAlpha(10, 1, 1)).toBeGreaterThan(linkAlpha(100, 1, 1));
  expect(particleCount(390, 844)).toBeGreaterThanOrEqual(24);
  expect(particleCount(2560, 1440)).toBeLessThanOrEqual(110);
});
