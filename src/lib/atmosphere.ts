/**
 * The homepage's one shared atmosphere (owner's correction of 2026-10-22, §8): a single background behind the whole
 * page — not one per section — made of soft emerald/lime light fields and a fine network of rising sparks.
 *
 * - Page coordinates, laid out on a vertical lattice of cells, each cell seeded by its own index: the field is the same
 *   at any page length, a taller page only adds cells below (nothing above moves), so the light never switches at a
 *   section boundary and never reshuffles when the page grows (e.g. the «كيف نبدأ؟» panel opens).
 * - Motion is a pure function of time — drift and breathing of the light, sparks rising and fading — so it keeps
 *   moving while the pointer is still. The pointer never changes it (DEC-08): it only offsets what is drawn by a
 *   bounded depth parallax (P1-12), and scrolling lets far light lag behind the page (depth on touch screens too).
 * - Nothing here is attached to the cursor: no light is placed at, or brightened near, the pointer.
 */
import { type Pointer, parallaxOffset } from "./particles";

export type Tone = "emerald" | "bright" | "lime" | "highlight";

/** A soft elliptical light field. */
export type Light = {
  x: number;
  y: number;
  rx: number;
  ry: number;
  tone: Tone;
  /** peak opacity of the field's centre */
  alpha: number;
  /** 0.3 (far) … 1 (near): parallax and scroll depth */
  depth: number;
  /** drift amplitude (px) and periods (s) */
  ax: number;
  ay: number;
  px: number;
  py: number;
  /** breathing period (s) */
  pa: number;
  phase: number;
};

/** A spark: rises from its anchor, fades in and out over its life, sways sideways. */
export type Spark = {
  x: number;
  y: number;
  r: number;
  depth: number;
  /** seconds per life */
  life: number;
  /** px per second */
  rise: number;
  sway: number;
  swayPeriod: number;
  phase: number;
};

export type Rect = { left: number; top: number; width: number; height: number };

/** Near light moves at most this far with the pointer (far light: × depth). P1-12: ≤ 12 px. */
export const LIGHT_PARALLAX_PX = 12;
/** How much far light lags behind the page while scrolling: (1 − depth) × this × scrollY. */
export const SCROLL_DEPTH = 0.3;
/** One spark per this many px² of page. */
export const SPARK_AREA = 15000;
/** The light canvas is drawn at 1/LIGHT_SCALE resolution and scaled up: light fields have no detail to lose. */
export const LIGHT_SCALE = 8;

/** Small, fast, seedable PRNG (mulberry32): the same seed always gives the same field. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const seedOf = (k: number, salt: number) => (Math.imul(k + 1009, 2654435761) ^ Math.imul(salt, 40503)) >>> 0;

/** Height of one lattice cell for a page this wide (px). */
export function cellHeight(width: number): number {
  return Math.round(Math.min(520, Math.max(300, width * 0.36 + 160)));
}

/** Cell indices that cover the page, with spare cells above (scroll lag pulls far light down) and below. */
export function cellRange(height: number, cell: number): [number, number] {
  return [-2, Math.ceil(Math.max(0, height) / cell) + 1];
}

/**
 * The light fields of one cell: two emerald fields — a larger one on one side, a smaller one on the other (sides
 * alternate from cell to cell) — a lime-lit emerald field somewhere between, and often a small lime or yellow-green
 * accent. Every field is taller than a cell, so neighbouring cells overlap into one continuous, mostly dark wash.
 */
export function lightsForCell(k: number, width: number, cell: number): Light[] {
  const rand = mulberry32(seedOf(k, 1));
  const span = Math.min(1200, Math.max(420, width));
  const right = ((k % 2) + 2) % 2 === 0;
  const make = (tone: Tone, depth: number, ry: number, wide: number, alpha: number, x: number, y: number): Light => ({
    x,
    y,
    rx: Math.max(ry * 1.1, span * wide),
    ry,
    tone,
    alpha,
    depth,
    ax: ry * (0.08 + 0.06 * rand()),
    ay: ry * (0.06 + 0.05 * rand()),
    px: 26 + 18 * rand(),
    py: 30 + 20 * rand(),
    pa: 15 + 12 * rand(),
    phase: rand(),
  });
  const side = (onRight: boolean) => width * (onRight ? 0.62 + 0.28 * rand() : 0.1 + 0.28 * rand());
  // the main field sits in the middle of its cell and the second one on the boundary with the next cell, so field
  // centres are never much more than half a cell apart down the page: there is no gap between cells to read as a band
  const lights: Light[] = [
    make("emerald", 0.3 + 0.12 * rand(), cell * (0.85 + 0.15 * rand()), 0.38 + 0.12 * rand(), 0.2 + 0.07 * rand(), side(right), (k + 0.35 + 0.3 * rand()) * cell),
    make("emerald", 0.4 + 0.15 * rand(), cell * (0.7 + 0.15 * rand()), 0.3 + 0.12 * rand(), 0.15 + 0.06 * rand(), side(!right), (k + 0.85 + 0.3 * rand()) * cell),
    make("bright", 0.6 + 0.15 * rand(), cell * (0.35 + 0.15 * rand()), 0.22 + 0.1 * rand(), 0.05 + 0.04 * rand(), width * (0.2 + 0.6 * rand()), (k + rand()) * cell),
  ];
  if (rand() < 0.55) {
    const tone: Tone = rand() < 0.55 ? "lime" : "highlight";
    lights.push(
      make(tone, 0.85 + 0.15 * rand(), cell * (0.16 + 0.1 * rand()), 0.1 + 0.06 * rand(), 0.035 + 0.03 * rand(), width * (0.12 + 0.76 * rand()), (k + rand()) * cell),
    );
  }
  return lights;
}

/** The sparks of one cell (page coordinates). Cells below the page top only: nothing is drawn above the page. */
export function sparksForCell(k: number, width: number, cell: number): Spark[] {
  if (k < 0) return [];
  const rand = mulberry32(seedOf(k, 2));
  const count = Math.max(4, Math.round((width * cell) / SPARK_AREA));
  return Array.from({ length: count }, () => {
    const depth = 0.35 + rand() * 0.65;
    return {
      x: rand() * width,
      y: (k + rand()) * cell,
      r: 0.6 + rand() * 1.3 * depth,
      depth,
      life: 24 + 22 * rand(),
      rise: 2.5 + 6.5 * depth,
      sway: 6 + 14 * rand(),
      swayPeriod: 9 + 10 * rand(),
      phase: rand(),
    };
  });
}

/**
 * Light that stays behind the page's key content, measured from the live layout (page coordinates): a deep emerald
 * field behind the portal — its glow spilling into the room — a soft one behind the headline and lime light
 * rising under the steps. They drift little, so they stay behind what they light.
 */
export function anchorLights(portal: Rect | null, headline: Rect | null, steps: Rect | null): Light[] {
  const out: Light[] = [];
  const field = (r: Rect, tone: Tone, kx: number, ky: number, alpha: number, depth: number, cy = 0.5): Light => {
    const rx = Math.max(160, r.width * kx);
    return {
      x: r.left + r.width / 2,
      y: r.top + r.height * cy,
      rx,
      ry: Math.max(120, r.height * ky),
      tone,
      alpha,
      depth,
      ax: rx * 0.03,
      ay: rx * 0.025,
      px: 34,
      py: 41,
      pa: 19,
      phase: 0.3,
    };
  };
  if (portal) out.push(field(portal, "emerald", 1.3, 0.8, 0.2, 0.85));
  if (headline) out.push(field(headline, "emerald", 0.75, 1.1, 0.12, 0.9));
  if (steps) out.push(field(steps, "lime", 0.55, 1.4, 0.05, 0.92, 0.85));
  return out;
}

/**
 * Opacity profile of a light field at normalised distance d from its centre (1 = its edge): soft centre, long tail,
 * exactly 0 at the edge. Drawn into a sprite pixel by pixel: canvas gradients are dithered, and a dithered field drawn
 * at low resolution and scaled up showed its dither as a grid of blotches.
 */
export function lightFalloff(d: number): number {
  return d >= 1 ? 0 : (1 - d * d) ** 2.6;
}

const TAU = Math.PI * 2;

/** Where a light is at time t (s), and how bright: drift and breathing only — no pointer input. */
export function lightAt(l: Light, t: number): { x: number; y: number; alpha: number } {
  return {
    x: l.x + l.ax * Math.sin(TAU * (t / l.px + l.phase)),
    y: l.y + l.ay * Math.sin(TAU * (t / l.py + l.phase * 1.7)),
    alpha: l.alpha * (0.84 + 0.16 * Math.sin(TAU * (t / l.pa + l.phase * 2.3))),
  };
}

/** Where a spark is at time t (s) and its opacity factor (0…1) over its life — no pointer input. */
export function sparkAt(s: Spark, t: number): { x: number; y: number; fade: number } {
  const u = (((t / s.life + s.phase) % 1) + 1) % 1;
  return {
    x: s.x + s.sway * Math.sin(TAU * (t / s.swayPeriod + s.phase)),
    y: s.y - s.rise * s.life * (u - 0.5),
    fade: Math.sqrt(Math.sin(Math.PI * u)),
  };
}

/** Pointer parallax for something at this depth (bounded: |x|, |y| ≤ amplitude). */
export function depthOffset(pointer: Pointer, depth: number, amplitude: number): Pointer {
  return parallaxOffset(pointer, depth, amplitude);
}

/**
 * Sparks fade out around a quiet area (the chat inside the portal: nothing moves behind its text): 0 inside the
 * rectangle, rising to 1 at `feather` px outside it.
 */
export function quietFactor(x: number, y: number, quiet: Rect | null, feather = 28): number {
  if (!quiet) return 1;
  const dx = Math.max(quiet.left - x, 0, x - (quiet.left + quiet.width));
  const dy = Math.max(quiet.top - y, 0, y - (quiet.top + quiet.height));
  return Math.min(1, Math.hypot(dx, dy) / feather);
}

/** Far light lags behind the page while scrolling; near light (depth 1) moves with it. */
export function scrollLag(scrollY: number, depth: number): number {
  return Math.max(0, scrollY) * (1 - Math.max(0, Math.min(1, depth))) * SCROLL_DEPTH;
}

/** "#rrggbb" → [r, g, b]; anything else → null (the tokens are hex, see src/styles/tokens.css). */
export function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  return m ? [Number.parseInt(m[1]!, 16), Number.parseInt(m[2]!, 16), Number.parseInt(m[3]!, 16)] : null;
}
