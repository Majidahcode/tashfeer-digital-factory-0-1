/**
 * Ambient phrase timing (master prompt R5-A/B).
 * The automatic cycle advances every CYCLE_MS no matter what the pointer does;
 * pointer/touch reveals are layered on top and never reset the cycle.
 */

export const CYCLE_MS = 5000;
/** Each auto phrase fades in, holds, then fades out before the next one (fade itself is CSS, --dur-phrase). */
export const AUTO_VISIBLE_MS = 3600;
/** How long a pointer-revealed phrase stays after the pointer leaves its region. */
export const POINTER_HOLD_MS = 1200;
/** How long a tapped phrase stays revealed on touch screens. */
export const TOUCH_HOLD_MS = 2600;
/** Extra hit area around each phrase for pointer detection. */
export const HIT_SLOP_PX = 24;

export function nextIndex(current: number, count: number): number {
  return count > 0 ? (current + 1) % count : 0;
}

export type RevealInput = {
  index: number;
  autoIndex: number;
  autoVisible: boolean;
  pointerIndex: number | null;
  touchIndex: number | null;
};

export type RevealSource = "auto" | "pointer" | "touch" | null;

export function revealSource({ index, autoIndex, autoVisible, pointerIndex, touchIndex }: RevealInput): RevealSource {
  if (touchIndex === index) return "touch";
  if (pointerIndex === index) return "pointer";
  if (autoVisible && autoIndex === index) return "auto";
  return null;
}

type Rect = { left: number; top: number; right: number; bottom: number };

/** Index of the phrase whose (slop-expanded) rect contains the point, or -1. Hidden slots (zero size) are ignored. */
export function hitTest(rects: readonly Rect[], x: number, y: number, slop = HIT_SLOP_PX): number {
  return rects.findIndex(
    (r) => r.right - r.left > 0 && x >= r.left - slop && x <= r.right + slop && y >= r.top - slop && y <= r.bottom + slop,
  );
}

/** On touch layouts several phrases can share one slot: tapping reveals the next phrase after the visible one. */
export function touchTarget(hits: readonly number[], visibleIndex: number, count: number): number {
  if (!hits.length) return -1;
  if (hits.length === 1) return hits[0] ?? -1;
  const next = nextIndex(visibleIndex, count);
  return hits.includes(next) ? next : (hits[0] ?? -1);
}
