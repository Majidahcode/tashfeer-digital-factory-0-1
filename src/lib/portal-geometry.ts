/**
 * Layout geometry of the owner's portal ring, measured on the asset itself (scripts/derive-portal-ring.py → manifest).
 * Every fraction is relative to the ring's *band box* — the visible ring, without its glow.
 */
import type { CSSProperties } from "react";
import manifest from "@/generated/asset-manifest.json";

const g = manifest.assets["portal-ring"].geometry;
const [IMG_W, IMG_H] = g.size as [number, number];
type Box = { left: number; top: number; width: number; height: number };

/** Band width / height (the portal box keeps this aspect ratio). */
export const RING_ASPECT = g.ringBox.width / g.ringBox.height;

/** The ring image, placed so its band fills the portal box; the glow overflows around it (fractions of the band). */
export const RING_IMAGE: Box = {
  left: -g.ringBox.x / g.ringBox.width,
  top: -g.ringBox.y / g.ringBox.height,
  width: IMG_W / g.ringBox.width,
  height: IMG_H / g.ringBox.height,
};

/** Where the chat glass and the chat content live: inside the ring where it is under 50% opaque. */
export const GLASS_BOX: Box = g.glass.box;
export const CONTENT_BOX: Box = g.content.box;

type Row = readonly [number, number | null, number | null];
const ROWS = g.content.rows as unknown as Row[];

/**
 * Safe horizontal span of the opening between band heights y0…y1 (fractions of the band width): the narrowest point
 * of the measured contour in that range, minus a small margin. Returns null where the contour is closed.
 */
export function openingSpan(y0: number, y1: number, margin = 0.012): [number, number] | null {
  let left = 0;
  let right = 1;
  for (const [y, l, r] of ROWS) {
    if (y < y0 || y > y1) continue;
    if (l === null || r === null) return null;
    left = Math.max(left, l);
    right = Math.min(right, r);
  }
  return right - left > 2 * margin ? [left + margin, right - margin] : null;
}

/**
 * Chat rows, top → bottom, as band-height ranges. Sized for the smallest ring (≈ 366 px wide on a 390 px phone)
 * at the minimum readable sizes; every control scales with the ring (cqi) above that, so the composition is the
 * same at every size. The rows follow the ellipse like a messaging app: the narrow top holds the name, the widest
 * band the conversation (most of the height) and the text field right under it; the narrowing bottom the compact
 * attachment icons, then Enter.
 */
export const CHAT_ROWS = {
  head: [0.226, 0.272],
  status: [0.278, 0.313],
  log: [0.318, 0.594],
  input: [0.601, 0.675],
  tools: [0.685, 0.734],
  enter: [0.745, 0.789],
} as const;

export type ChatRow = keyof typeof CHAT_ROWS;

const pct = (v: number) => `${(v * 100).toFixed(3)}%`;

/** CSS custom properties placing each chat row inside the content box (percentages of that box). */
export function chatRowVars(): CSSProperties {
  const vars: Record<string, string> = {};
  for (const [name, [y0, y1]] of Object.entries(CHAT_ROWS)) {
    const span = openingSpan(y0, y1) ?? [0.5, 0.5];
    vars[`--${name}-t`] = pct((y0 - CONTENT_BOX.top) / CONTENT_BOX.height);
    vars[`--${name}-h`] = pct((y1 - y0) / CONTENT_BOX.height);
    vars[`--${name}-l`] = pct((span[0] - CONTENT_BOX.left) / CONTENT_BOX.width);
    vars[`--${name}-r`] = pct((CONTENT_BOX.left + CONTENT_BOX.width - span[1]) / CONTENT_BOX.width);
  }
  return vars as CSSProperties;
}

/** CSS custom properties positioning a box (fractions of the band) inside the portal box. */
export function boxVars(prefix: string, box: Box): CSSProperties {
  return {
    [`--${prefix}-l`]: pct(box.left),
    [`--${prefix}-t`]: pct(box.top),
    [`--${prefix}-w`]: pct(box.width),
    [`--${prefix}-h`]: pct(box.height),
  } as CSSProperties;
}
