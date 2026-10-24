/**
 * Layout geometry of the owner's portal, measured on the asset itself (scripts/derive-portal-reference.py → manifest).
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
 * of the measured contour in that range, minus a margin. The contour is where the ring is 25 % opaque — inside its
 * soft inner glow, not at the band — so with the margin every control keeps clear air around it. Returns null where
 * the contour is closed.
 */
export function openingSpan(y0: number, y1: number, margin = 0.015): [number, number] | null {
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
 * Chat rows, top → bottom, as band-height ranges [top, bottom], with an optional range [from, to] whose narrowest
 * span sets the row's width. Sized for the smallest ring (≈ 366 px wide on a 390 px phone) at the minimum readable
 * sizes; every control scales with the ring (cqi) above that, so the composition is the same at every size. Like a
 * messaging app: the avatar alone in the opening's narrow top, then the conversation — most of the height, its
 * messages gathered at the bottom, right above the text field, no wider than it (so its width is taken from where it
 * holds messages down to the field's row: the empty top of the conversation may reach into the narrower part) — then
 * the text field, the compact attachment icons and Enter in the narrowing bottom. Measured for the owner's reference
 * portal (2026-10-23).
 */
export const CHAT_ROWS = {
  head: [0.165, 0.237],
  log: [0.245, 0.584, 0.36, 0.676],
  input: [0.592, 0.676],
  tools: [0.684, 0.748],
  enter: [0.756, 0.812],
} as const satisfies Record<string, readonly number[]>;

export type ChatRow = keyof typeof CHAT_ROWS;

const pct = (v: number) => `${(v * 100).toFixed(3)}%`;

/** CSS custom properties placing each chat row inside the content box (percentages of that box). */
export function chatRowVars(): CSSProperties {
  const vars: Record<string, string> = {};
  for (const [name, row] of Object.entries(CHAT_ROWS)) {
    const [y0 = 0, y1 = 0, w0 = y0, w1 = y1] = row as readonly number[];
    const span = openingSpan(w0, w1) ?? [0.5, 0.5];
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
