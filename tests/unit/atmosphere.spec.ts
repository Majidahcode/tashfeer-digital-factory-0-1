import { expect, test } from "@playwright/test";
import {
  LIGHT_PARALLAX_PX,
  anchorLights,
  cellHeight,
  cellRange,
  depthOffset,
  hexToRgb,
  lightAt,
  lightFalloff,
  lightsForCell,
  quietFactor,
  scrollLag,
  sparkAt,
  sparksForCell,
  type Light,
} from "@/lib/atmosphere";

/** Every light of a page this size, cell by cell (as AmbientBackground lays them out). */
function field(width: number, height: number): Light[] {
  const cell = cellHeight(width);
  const [first, last] = cellRange(height, cell);
  const out: Light[] = [];
  for (let k = first; k <= last; k++) out.push(...lightsForCell(k, width, cell));
  return out;
}

/** Light reaching a point (sum of the fields' opacity there) at time t — the drawn canvas, without the canvas. */
function lightAtPoint(lights: readonly Light[], x: number, y: number, t = 0): number {
  let sum = 0;
  for (const l of lights) {
    const p = lightAt(l, t);
    const d = Math.hypot((x - p.x) / l.rx, (y - p.y) / l.ry);
    sum += p.alpha * lightFalloff(d);
  }
  return sum;
}

test("§8 one field for the whole page: deterministic, and a longer page only adds light below", () => {
  for (const width of [390, 768, 1280, 1920]) {
    const short = field(width, 1600);
    const long = field(width, 4200);
    expect(field(width, 1600)).toEqual(short); // the same page always gets the same light
    // nothing that was there moves when the page grows (an opening panel must not reshuffle the atmosphere)
    expect(long.slice(0, short.length - 4)).toEqual(short.slice(0, short.length - 4));
  }
});

test("§8 no dark bands: down the whole page, every band gets light, and the page stays mostly dark", () => {
  for (const width of [390, 768, 1024, 1280]) {
    const height = 3200;
    const lights = field(width, height);
    const bands: number[] = [];
    for (let y = 0; y < height; y += 50) {
      let sum = 0;
      for (let x = 10; x < width; x += 20) sum += lightAtPoint(lights, x, y);
      bands.push(sum / Math.ceil((width - 10) / 20));
    }
    const max = Math.max(...bands);
    const min = Math.min(...bands);
    const mean = bands.reduce((a, b) => a + b, 0) / bands.length;
    expect(min, `${width}px: the darkest band still has light`).toBeGreaterThan(0.3 * max);
    expect(mean, `${width}px: controlled illumination`).toBeLessThan(0.45);
    expect(mean, `${width}px: not a black page`).toBeGreaterThan(0.08);
  }
});

test("§8 it keeps moving on its own: drift, breathing and rising sparks change with time", () => {
  const [light] = lightsForCell(0, 1280, cellHeight(1280));
  const a = lightAt(light!, 0);
  const b = lightAt(light!, 6);
  expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeGreaterThan(1);
  expect(b.alpha).not.toBeCloseTo(a.alpha, 4);
  const [spark] = sparksForCell(0, 1280, cellHeight(1280));
  const s0 = sparkAt(spark!, 0);
  const s1 = sparkAt(spark!, 4);
  expect(s1.y).not.toBeCloseTo(s0.y, 1);
});

test("DEC-08 / §8 the pointer never drives the field: no pointer input, and no light at the cursor", () => {
  // the motion functions take (item, time) only — there is no pointer parameter to place light at the cursor
  expect(lightAt.length).toBe(2);
  expect(sparkAt.length).toBe(2);
  // the only pointer effect is a uniform depth offset, bounded by the parallax amplitude (P1-12: ≤ 12 px)
  expect(LIGHT_PARALLAX_PX).toBeLessThanOrEqual(12);
  for (const x of [-9, -1, 0, 0.4, 1, 7, Number.NaN]) {
    for (const y of [-4, -1, 0, 1, 3]) {
      for (const depth of [-1, 0, 0.35, 1, 3]) {
        const o = depthOffset({ x, y }, depth, LIGHT_PARALLAX_PX);
        expect(Math.abs(o.x)).toBeLessThanOrEqual(12);
        expect(Math.abs(o.y)).toBeLessThanOrEqual(12);
      }
    }
  }
});

test("sparks fade in and out over their life (no pop-in), and never behind the chat", () => {
  const [s] = sparksForCell(3, 390, cellHeight(390));
  const life = s!.life;
  // the start of a life: phase so that u = 0 at t = 0
  const born = { ...s!, phase: 0 };
  expect(sparkAt(born, 0).fade).toBeCloseTo(0, 5);
  expect(sparkAt(born, life / 2).fade).toBeCloseTo(1, 5);
  expect(sparkAt(born, life * 0.999).fade).toBeLessThan(0.1);
  const chat = { left: 100, top: 200, width: 200, height: 300 };
  expect(quietFactor(200, 350, chat)).toBe(0);
  expect(quietFactor(10, 20, chat)).toBe(1);
  expect(quietFactor(310, 350, chat)).toBeGreaterThan(0);
  expect(quietFactor(310, 350, chat)).toBeLessThan(1);
});

test("depth: far light lags behind the page while scrolling, near light and content do not", () => {
  expect(scrollLag(1000, 1)).toBe(0);
  expect(scrollLag(1000, 0.35)).toBeGreaterThan(scrollLag(1000, 0.7));
  expect(scrollLag(-50, 0.35)).toBe(0);
});

test("the light profile is soft and ends at its edge; anchors sit behind the content they light", () => {
  expect(lightFalloff(0)).toBe(1);
  expect(lightFalloff(1)).toBe(0);
  for (let d = 0; d < 1; d += 0.05) expect(lightFalloff(d + 0.05)).toBeLessThanOrEqual(lightFalloff(d));
  const portal = { left: 600, top: 80, width: 400, height: 650 };
  const [behind] = anchorLights(portal, null, null);
  expect(behind!.x).toBe(800);
  expect(behind!.y).toBeCloseTo(405);
  expect(hexToRgb("#087a3f")).toEqual([8, 122, 63]);
  expect(hexToRgb("not a colour")).toBeNull();
});
