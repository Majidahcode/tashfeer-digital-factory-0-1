/**
 * Where the ambient phrases appear (owner's correction of 2026-10-23): spread over the whole homepage, in its free
 * space — never on the copy, the portal and its glow, the characters, the «أنا» arrow, the steps or a control — with a
 * placement that varies from one appearance to the next but is reproducible: every choice is drawn from a seeded PRNG
 * (the layout's size, the phrase, the appearance's number), never from Math.random, and recomputed when the layout
 * changes.
 *
 * Pure geometry, in the phrase layer's coordinates (px from its top-left corner). The component measures the page and
 * feeds it here (AmbientPhrases.tsx).
 */
import { mulberry32 } from "./atmosphere";

export type Rect = { x0: number; y0: number; x1: number; y1: number };
export type Point = { x: number; y: number };
export type Size = { w: number; h: number };
/** A phrase's box at a place: its top-left corner in the layer, and its size. */
export type Box = Point & Size;

/**
 * Air kept around a phrase's box at rest (no parallax), beyond the box itself: at least what P1-16 checks there — 10 px
 * across, 14 px above and below, i.e. the phrase's whole travel plus 4 px — and 2 px more. The travel: ±6 px of pointer
 * parallax across, ±3.6 px up and down, and the fade-in offset — a waiting phrase sits 6 px lower than an appearing
 * one, so the air under the box is 6 px deeper than above it. Whatever the pointer does, a phrase keeps ≥ 6 px of air.
 */
export const MARGIN_X = 12;
export const MARGIN_TOP = 16;
export const MARGIN_BOTTOM = 22;
/**
 * Distance kept from the layer's sides — the phrase's parallax travel (±6 px) and 6 px more, so that it never touches
 * the screen's edge — and from its top and bottom.
 */
export const EDGE_X = 12;
export const EDGE_TOP = 8;
export const EDGE_BOTTOM = 12;
/** Phrases never sit closer than this to one another. */
export const PHRASE_GAP = 24;
/**
 * The free space's resolution: cells CELL px wide and ROW px tall. Rows are 1 px, so that a bay of free space only
 * a few pixels taller than a phrase and its air is not lost to rounding (a phone's bays have 3 px to spare).
 */
export const CELL = 4;
export const ROW = 1;
/** The lattice of places tried, px (AmbientPhrases makes it coarser on wide screens, where places are many). */
export const STEP_X = 4;
export const STEP_Y = 2;
/** Height of the horizontal bands that make the regions, ≈ a third of a laptop screen. */
export const BAND = 220;
/** Width that makes one more column of regions (a phone has one column, a tablet two, wide screens three). */
export const COLUMN = 640;

export function inflate(r: Rect, mx: number, my: number): Rect {
  return { x0: r.x0 - mx, y0: r.y0 - my, x1: r.x1 + mx, y1: r.y1 + my };
}

/** A phrase's box with the air it keeps (MARGIN_*). */
export function withAir(r: Rect): Rect {
  return { x0: r.x0 - MARGIN_X, y0: r.y0 - MARGIN_TOP, x1: r.x1 + MARGIN_X, y1: r.y1 + MARGIN_BOTTOM };
}

export function overlaps(a: Rect, b: Rect): boolean {
  return a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
}

export function rectOf(b: Box): Rect {
  return { x0: b.x, y0: b.y, x1: b.x + b.w, y1: b.y + b.h };
}

/**
 * The layer's free space on a grid of CELL × ROW px cells: blocked cells are counted in a summed-area table, so
 * whether a box is clear costs four lookups whatever its size.
 */
export class FreeSpace {
  readonly cols: number;
  readonly rows: number;
  private readonly blocked: Uint8Array;
  private sums: Int32Array | null = null;

  constructor(
    readonly width: number,
    readonly height: number,
    readonly cell = CELL,
    readonly row = ROW,
  ) {
    this.cols = Math.max(1, Math.ceil(width / cell));
    this.rows = Math.max(1, Math.ceil(height / row));
    this.blocked = new Uint8Array(this.cols * this.rows);
  }

  /** The cells a rectangle touches, clipped to the grid (empty when c1 < c0 or r1 < r0). */
  private span(r: Rect) {
    return {
      c0: Math.max(0, Math.floor(r.x0 / this.cell)),
      c1: Math.min(this.cols - 1, Math.ceil(r.x1 / this.cell) - 1),
      r0: Math.max(0, Math.floor(r.y0 / this.row)),
      r1: Math.min(this.rows - 1, Math.ceil(r.y1 / this.row) - 1),
    };
  }

  /** Blocks every cell the rectangle touches (clipped to the layer). */
  block(r: Rect): void {
    const { c0, c1, r0, r1 } = this.span(r);
    if (c1 < c0) return;
    for (let y = r0; y <= r1; y++) this.blocked.fill(1, y * this.cols + c0, y * this.cols + c1 + 1);
    this.sums = null;
  }

  private table(): Int32Array {
    if (this.sums) return this.sums;
    const w = this.cols + 1;
    const s = new Int32Array(w * (this.rows + 1));
    for (let y = 0; y < this.rows; y++) {
      let run = 0;
      for (let x = 0; x < this.cols; x++) {
        run += this.blocked[y * this.cols + x]!;
        s[(y + 1) * w + x + 1] = s[y * w + x + 1]! + run;
      }
    }
    this.sums = s;
    return s;
  }

  /** True when no blocked cell meets the rectangle (cells partly covered count) and it lies inside the layer. */
  isFree(r: Rect): boolean {
    if (r.x0 < 0 || r.y0 < 0 || r.x1 > this.width || r.y1 > this.height) return false;
    const s = this.table();
    const w = this.cols + 1;
    const c0 = Math.floor(r.x0 / this.cell);
    const c1 = Math.min(this.cols, Math.ceil(r.x1 / this.cell));
    const r0 = Math.floor(r.y0 / this.row);
    const r1 = Math.min(this.rows, Math.ceil(r.y1 / this.row));
    const n = s[r1 * w + c1]! - s[r0 * w + c1]! - s[r1 * w + c0]! + s[r0 * w + c0]!;
    return n === 0;
  }

  /**
   * Every place on a stepX × stepY lattice where a box of this size, with its air (withAir), is clear and keeps
   * EDGE_* from the layer's sides. The obstacles were blocked as they are (not inflated): the air is added here.
   */
  positions(size: Size, stepX = STEP_X, stepY = STEP_Y): Point[] {
    const out: Point[] = [];
    const xMax = this.width - EDGE_X - size.w;
    const yMax = this.height - EDGE_BOTTOM - size.h;
    const x0 = Math.ceil(EDGE_X / stepX) * stepX;
    const y0 = Math.ceil(EDGE_TOP / stepY) * stepY;
    for (let y = y0; y <= yMax; y += stepY)
      for (let x = x0; x <= xMax; x += stepX)
        if (this.isFree(withAir({ x0: x, y0: y, x1: x + size.w, y1: y + size.h }))) out.push({ x, y });
    return out;
  }
}

/** Regions per band: the most columns a layer is divided into. */
const COLUMNS = 3;

/**
 * A region: a horizontal band of the layer and a column of it (by the box's centre), as one number — band × COLUMNS +
 * column. Narrow layers are one column, so that the two ends of one strip of free space never count as two places.
 */
export function regionOf(b: Box, width: number): number {
  const columns = Math.min(COLUMNS, Math.max(1, Math.ceil(width / COLUMN)));
  const cy = b.y + b.h / 2;
  const cx = b.x + b.w / 2;
  const column = Math.min(columns - 1, Math.max(0, Math.floor((cx / width) * columns)));
  return Math.max(0, Math.floor(cy / BAND)) * COLUMNS + column;
}

/** The band a region (regionOf) belongs to. */
export const bandOf = (region: number) => Math.floor(region / COLUMNS);

/** A stable 32-bit seed for a layout and an appearance. */
export function seedFor(width: number, height: number, phrase: number, appearance: number): number {
  let h = 2166136261 >>> 0;
  for (const v of [Math.round(width), Math.round(height), phrase, appearance]) {
    h ^= v >>> 0;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

export type PickOptions<T extends Box = Box> = {
  /** the layer's width (for regions) */
  width: number;
  /** boxes never to be overlapped (phrases that must stay where they are), kept PHRASE_GAP apart */
  others: readonly Rect[];
  /** boxes overlapped only when there is no better choice (phrases that may move out of the way) */
  soft?: readonly Rect[];
  /** the visible part of the layer (y range): places fully inside it are preferred */
  view?: { y0: number; y1: number };
  /**
   * Regions to avoid this time, most important first (where a phrase was just seen). The longest leading part of
   * the list that still leaves two regions to choose from is avoided — so the draw never becomes a fixed rotation.
   */
  avoidRegions?: readonly number[];
  /** within the drawn region, the candidates to use when there are any (e.g. one line rather than two) */
  prefer?: (c: T) => boolean;
  /** where the last phrase was seen: within the drawn region, the half of the places farther from it is used */
  from?: Rect;
  /** seeded randomness for this appearance */
  seed: number;
};

/**
 * One appearance's place among the candidates (boxes the free space allows, possibly of different shapes):
 * deterministic in `seed`. In order of precedence it keeps clear of `others`; prefers places inside the view (unless
 * the view holds only the region where the last phrase was seen); keeps to
 * regions other than the ones to avoid, preferring regions with a place clear of `soft`; draws a band — another band
 * than the first region to avoid, when there is one, so that the phrases travel up and down the page — then a region
 * of that band (so a band with free space across the screen's width is not favoured over one with a single opening);
 * and inside the region takes a place clear of `soft` and `prefer`red when there is one, in the half of the region
 * farther `from` where the last phrase was seen. Null when there is no room.
 */
export function pickPosition<T extends Box>(candidates: readonly T[], o: PickOptions<T>): T | null {
  const gapped = (rects: readonly Rect[]) => rects.map((q) => inflate(q, PHRASE_GAP, PHRASE_GAP));
  const hard = gapped(o.others);
  const soft = gapped(o.soft ?? []);
  const clear = candidates.filter((c) => {
    const r = rectOf(c);
    return hard.every((q) => !overlaps(r, q));
  });
  if (!clear.length) return null;
  const view = o.view;
  const inView = view ? clear.filter((c) => c.y >= view.y0 && c.y + c.h <= view.y1) : clear;
  // in view first — unless every place in view is in the region where the last phrase was just seen: then anywhere,
  // rather than the same place again (a phone's first screen can hold a single bay)
  const last = o.avoidRegions?.[0];
  const freshInView = last === undefined || inView.some((c) => regionOf(c, o.width) !== last);
  const pool = inView.length && freshInView ? inView : clear;
  const byRegion = new Map<number, T[]>();
  for (const c of pool) {
    const k = regionOf(c, o.width);
    const list = byRegion.get(k);
    if (list) list.push(c);
    else byRegion.set(k, [c]);
  }
  const keys = [...byRegion.keys()].sort((a, b) => a - b);
  const avoid = [...(o.avoidRegions ?? [])];
  let fresh = keys.filter((k) => !avoid.includes(k));
  while (avoid.length > 1 && fresh.length < 2) {
    avoid.pop();
    fresh = keys.filter((k) => !avoid.includes(k));
  }
  const calm = (c: T) => {
    const r = rectOf(c);
    return soft.every((q) => !overlaps(r, q));
  };
  const open = fresh.length ? fresh : keys;
  const quiet = open.filter((k) => byRegion.get(k)!.some(calm));
  const choices = quiet.length ? quiet : open;
  const lastBand = o.avoidRegions?.[0] === undefined ? null : bandOf(o.avoidRegions[0]);
  const allBands = [...new Set(choices.map(bandOf))];
  const otherBands = allBands.filter((b) => b !== lastBand);
  const bands = otherBands.length ? otherBands : allBands;
  const rng = mulberry32(o.seed);
  const band = bands[Math.floor(rng() * bands.length)]!;
  const inBand = choices.filter((k) => bandOf(k) === band);
  const region = inBand[Math.floor(rng() * inBand.length)]!;
  const narrow = (list: T[], keep: (c: T) => boolean) => {
    const kept = list.filter(keep);
    return kept.length ? kept : list;
  };
  let list = narrow(byRegion.get(region)!, calm);
  if (o.prefer) list = narrow(list, o.prefer);
  const from = o.from;
  if (from && list.length > 1) {
    // each appearance travels visibly: the farther half of the region from where the last one was seen
    const fx = (from.x0 + from.x1) / 2;
    const fy = (from.y0 + from.y1) / 2;
    const dist = (c: T) => Math.hypot(c.x + c.w / 2 - fx, c.y + c.h / 2 - fy);
    const sorted = list.map(dist).sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)]!;
    list = list.filter((c) => dist(c) >= median);
  }
  return list[Math.floor(rng() * list.length)]!;
}
