import { expect, test } from "@playwright/test";
import {
  type Box,
  EDGE_BOTTOM,
  EDGE_TOP,
  EDGE_X,
  FreeSpace,
  MARGIN_BOTTOM,
  MARGIN_TOP,
  MARGIN_X,
  PHRASE_GAP,
  type Rect,
  bandOf,
  inflate,
  overlaps,
  pickPosition,
  rectOf,
  regionOf,
  seedFor,
  withAir,
} from "@/lib/phrase-placement";

const box = (x: number, y: number, w = 200, h = 24): Box => ({ x, y, w, h });

test("the air around a phrase covers what P1-16 checks wherever it is measured, plus the travel", () => {
  // P1-16: 10 px across, 14 px above and below, measured at rest; a waiting phrase sits 6 px lower
  expect(MARGIN_X).toBeGreaterThanOrEqual(10);
  expect(MARGIN_TOP).toBeGreaterThanOrEqual(14);
  expect(MARGIN_BOTTOM).toBeGreaterThanOrEqual(14 + 6);
  // whatever the pointer does (±6 px across, ±3.6 px down and up), real air stays
  expect(MARGIN_X - 6).toBeGreaterThanOrEqual(4);
  expect(MARGIN_TOP - 3.6).toBeGreaterThanOrEqual(4);
  expect(MARGIN_BOTTOM - 6 - 3.6).toBeGreaterThanOrEqual(4);
  expect(withAir({ x0: 100, y0: 100, x1: 200, y1: 124 })).toEqual({
    x0: 100 - MARGIN_X,
    y0: 100 - MARGIN_TOP,
    x1: 200 + MARGIN_X,
    y1: 124 + MARGIN_BOTTOM,
  });
});

test("free space: blocked rectangles, the layer's bounds, and 1 px rows", () => {
  const f = new FreeSpace(400, 300);
  f.block({ x0: 100, y0: 100, x1: 200, y1: 150 });
  expect(f.isFree({ x0: 0, y0: 0, x1: 100, y1: 100 })).toBe(true);
  expect(f.isFree({ x0: 150, y0: 140, x1: 160, y1: 160 })).toBe(false);
  expect(f.isFree({ x0: 0, y0: 0, x1: 401, y1: 10 })).toBe(false); // outside the layer
  // rows are 1 px: a box may end right where an obstacle starts, even at a fractional edge
  const g = new FreeSpace(400, 300);
  g.block({ x0: 0, y0: 150.4, x1: 400, y1: 200 });
  expect(g.isFree({ x0: 10, y0: 100, x1: 300, y1: 150 })).toBe(true);
  expect(g.isFree({ x0: 10, y0: 100, x1: 300, y1: 151 })).toBe(false);
});

test("a phone's 64 px bay takes a 23 px line with its air, though its edges fall between pixels", () => {
  const f = new FreeSpace(390, 400);
  f.block({ x0: 0, y0: 0, x1: 390, y1: 183.4 }); // the characters' floor line
  f.block({ x0: 0, y0: 247.4, x1: 390, y1: 400 }); // the copy, 64 px below
  const places = f.positions({ w: 212, h: 23 });
  expect(places.length).toBeGreaterThan(0);
  expect(places.filter((p) => p.y - MARGIN_TOP < 183.4 || p.y + 23 + MARGIN_BOTTOM > 247.4)).toEqual([]);
});

test("every place offered keeps its air clear and stays inside the layer's edges", () => {
  const f = new FreeSpace(1280, 736);
  const obstacles: Rect[] = [
    { x0: 0, y0: 0, x1: 1280, y1: 30 },
    { x0: 40, y0: 60, x1: 600, y1: 330 },
    { x0: 640, y0: 40, x1: 980, y1: 700 },
    { x0: 1050, y0: 80, x1: 1250, y1: 620 },
  ];
  for (const o of obstacles) f.block(o);
  const size = { w: 220, h: 26 };
  const places = f.positions(size, 8, 4);
  expect(places.length).toBeGreaterThan(50);
  const bad = places.filter((p) => {
    const r = rectOf({ ...p, ...size });
    const inside = r.x0 >= EDGE_X && r.y0 >= EDGE_TOP && r.x1 <= 1280 - EDGE_X && r.y1 <= 736 - EDGE_BOTTOM;
    return !inside || obstacles.some((o) => overlaps(withAir(r), o));
  });
  expect(bad).toEqual([]);
});

test("regions: bands of 220 px, one column on a phone, two on a tablet, three on wide screens", () => {
  expect(regionOf(box(16, 10), 390)).toBe(regionOf(box(170, 10), 390));
  expect(regionOf(box(16, 10), 768)).not.toBe(regionOf(box(560, 10), 768));
  const wide = [box(100, 10), box(900, 10), box(1700, 10)].map((b) => regionOf(b, 1920));
  expect(new Set(wide).size).toBe(3);
  expect(bandOf(regionOf(box(100, 10), 1920))).toBe(0);
  expect(bandOf(regionOf(box(100, 230), 1920))).toBe(1);
});

test("the draw is reproducible: a seed for a layout and an appearance, never Math.random", () => {
  expect(seedFor(1280, 736, 1, 3)).toBe(seedFor(1280, 736, 1, 3));
  expect(seedFor(1280, 736, 1, 3)).not.toBe(seedFor(1280, 736, 1, 4));
  expect(seedFor(1280, 736, 1, 3)).not.toBe(seedFor(1440, 836, 1, 3));
  const candidates = [box(20, 20), box(700, 20), box(20, 400), box(700, 400)];
  const o = { width: 1280, others: [], seed: 7 };
  expect(pickPosition(candidates, o)).toEqual(pickPosition(candidates, o));
  const seen = new Set(Array.from({ length: 40 }, (_, s) => JSON.stringify(pickPosition(candidates, { ...o, seed: s }))));
  expect(seen.size).toBeGreaterThan(2); // and it varies from one appearance to the next
});

test("a phrase never lands on another that must stay, and keeps PHRASE_GAP from it", () => {
  const stay = rectOf(box(100, 100));
  const candidates = [box(100, 100), box(100 + 200 + PHRASE_GAP - 1, 100), box(100, 100 + 24 + PHRASE_GAP + 1)];
  for (let s = 0; s < 30; s++) {
    const p = pickPosition(candidates, { width: 1280, others: [stay], seed: s });
    expect(p).toEqual(candidates[2]);
  }
  expect(pickPosition([box(100, 100)], { width: 1280, others: [stay], seed: 1 })).toBeNull();
});

test("places in view first; then a region other than the last ones seen, and another band", () => {
  const top = box(20, 20);
  const middle = box(20, 300);
  const bottom = box(20, 520);
  const candidates = [top, middle, bottom];
  for (let s = 0; s < 30; s++) {
    // only the middle is in view
    expect(pickPosition(candidates, { width: 1280, others: [], view: { y0: 250, y1: 400 }, seed: s })).toEqual(middle);
    // the last seen: the top; never the top again while there is a choice
    const p = pickPosition(candidates, { width: 1280, others: [], avoidRegions: [regionOf(top, 1280)], seed: s });
    expect(p).not.toEqual(top);
  }
  // two regions to avoid among three leave one — so the older one is dropped and the draw keeps two choices
  const picks = new Set(
    Array.from({ length: 40 }, (_, s) =>
      JSON.stringify(
        pickPosition(candidates, {
          width: 1280,
          others: [],
          avoidRegions: [regionOf(top, 1280), regionOf(middle, 1280)],
          seed: s,
        }),
      ),
    ),
  );
  expect(picks).toEqual(new Set([JSON.stringify(middle), JSON.stringify(bottom)]));
  // the only region left is used, rather than none
  expect(pickPosition([top], { width: 1280, others: [], avoidRegions: [regionOf(top, 1280)], seed: 3 })).toEqual(top);
});

test("with two bands, appearances alternate between them; a band is drawn before its columns", () => {
  // the top band has three openings across the screen, the bottom band one
  const top = [box(40, 20), box(860, 20), box(1660, 20)];
  const low = box(860, 700);
  const candidates = [...top, low];
  let last = regionOf(low, 1920);
  let bottoms = 0;
  for (let s = 0; s < 20; s++) {
    const p = pickPosition(candidates, { width: 1920, others: [], avoidRegions: [last], seed: s })!;
    expect(bandOf(regionOf(p, 1920))).not.toBe(bandOf(last));
    if (p === low) bottoms++;
    last = regionOf(p, 1920);
  }
  expect(bottoms).toBe(10);
  // without a band to avoid, the lone bottom opening is as likely as the whole top band
  const counts = Array.from({ length: 400 }, (_, s) => pickPosition(candidates, { width: 1920, others: [], seed: s }));
  const share = counts.filter((p) => p === low).length / counts.length;
  expect(share).toBeGreaterThan(0.35);
  expect(share).toBeLessThan(0.65);
});

test("soft obstacles are avoided when there is a choice, and one line is preferred to two", () => {
  const busy = rectOf(box(20, 20));
  const a = box(20, 20);
  const b = { ...box(400, 20), shape: "stack" };
  const c = { ...box(400, 60), shape: "line" };
  for (let s = 0; s < 30; s++) {
    // same band and column: inside the region, the place clear of the soft box, in one line
    const p = pickPosition([{ ...a, shape: "line" }, b, c], {
      width: 900,
      others: [],
      soft: [busy],
      prefer: (k) => k.shape === "line",
      seed: s,
    });
    expect(p).toEqual(c);
  }
  // nothing clear of the soft box: it is used all the same
  expect(pickPosition([a], { width: 900, others: [], soft: [busy], seed: 2 })).toEqual(a);
  expect(overlaps(rectOf(a), inflate(busy, PHRASE_GAP, PHRASE_GAP))).toBe(true);
});
