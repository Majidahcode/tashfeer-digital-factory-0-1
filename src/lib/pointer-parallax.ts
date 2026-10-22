"use client";

import type { Pointer } from "@/lib/particles";

/**
 * One shared, smoothed pointer signal for background parallax layers.
 * - Values are normalised to [-1, 1]; layers convert them to a few pixels of offset.
 * - Mouse and pen only: a finger is scrolling or tapping, not looking around (touch screens keep the autonomous
 *   motion and the scroll depth instead).
 * - Disabled entirely under prefers-reduced-motion.
 * - Updates per layer element (not on :root) to avoid whole-document style recalculation.
 * - Smoothed in time, not per frame: the signal takes the same time to follow the pointer at any frame rate.
 */

type Listener = (p: Pointer) => void;

/**
 * Time constant of the smoothing (s): after `dt` seconds the signal has closed 1 − e^(−dt/τ) of its gap to the
 * pointer, however many frames were drawn in between. τ = 0.2 s is the approved feel — 8 % of the gap per frame at
 * 60 Hz — kept on a 120 Hz screen, a 30 Hz power-saving one, or a renderer that draws a frame a second (with a fixed
 * 8 % per frame, WebKit in CI moved the background one step, 1 px, in the 1.5 s a 60 Hz screen settles in).
 */
export const SMOOTHING_S = 0.2;

/** One smoothing update: `from` moves toward `to` by the share of the gap that `dt` seconds close, never past it. */
export function smoothToward(from: number, to: number, dt: number): number {
  if (!(dt > 0)) return from;
  return from + (to - from) * (1 - Math.exp(-dt / SMOOTHING_S));
}

const listeners = new Set<Listener>();
const target: Pointer = { x: 0, y: 0 };
const current: Pointer = { x: 0, y: 0 };
let raf = 0;
let listening = false;
/** When the signal was last brought up to date (performance.now(), ms). */
let updatedAt = 0;

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function frame() {
  const now = performance.now();
  const dt = (now - updatedAt) / 1000;
  updatedAt = now;
  current.x = smoothToward(current.x, target.x, dt);
  current.y = smoothToward(current.y, target.y, dt);
  for (const l of listeners) l(current);
  const settled = Math.abs(target.x - current.x) < 0.0005 && Math.abs(target.y - current.y) < 0.0005;
  raf = settled ? 0 : requestAnimationFrame(frame);
}

function onPointerMove(e: PointerEvent) {
  if (prefersReducedMotion() || e.pointerType === "touch") return;
  target.x = (e.clientX / Math.max(1, window.innerWidth)) * 2 - 1;
  target.y = (e.clientY / Math.max(1, window.innerHeight)) * 2 - 1;
  if (!raf) {
    updatedAt = performance.now(); // at rest until this move: the smoothing runs from now
    raf = requestAnimationFrame(frame);
  }
}

export function subscribeParallax(listener: Listener): () => void {
  listeners.add(listener);
  if (!listening && typeof window !== "undefined") {
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    listening = true;
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size && listening) {
      window.removeEventListener("pointermove", onPointerMove);
      listening = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    }
  };
}

export function currentParallax(): Pointer {
  return { ...current };
}
