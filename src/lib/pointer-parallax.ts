"use client";

import type { Pointer } from "@/lib/particles";

/**
 * One shared, smoothed pointer signal for background parallax layers.
 * - Values are normalised to [-1, 1]; layers convert them to a few pixels of offset.
 * - Disabled entirely under prefers-reduced-motion.
 * - Updates per layer element (not on :root) to avoid whole-document style recalculation.
 */

type Listener = (p: Pointer) => void;

const listeners = new Set<Listener>();
const target: Pointer = { x: 0, y: 0 };
const current: Pointer = { x: 0, y: 0 };
let raf = 0;
let listening = false;

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function frame() {
  current.x += (target.x - current.x) * 0.08;
  current.y += (target.y - current.y) * 0.08;
  for (const l of listeners) l(current);
  const settled = Math.abs(target.x - current.x) < 0.0005 && Math.abs(target.y - current.y) < 0.0005;
  raf = settled ? 0 : requestAnimationFrame(frame);
}

function onPointerMove(e: PointerEvent) {
  if (prefersReducedMotion()) return;
  target.x = (e.clientX / Math.max(1, window.innerWidth)) * 2 - 1;
  target.y = (e.clientY / Math.max(1, window.innerHeight)) * 2 - 1;
  if (!raf) raf = requestAnimationFrame(frame);
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
