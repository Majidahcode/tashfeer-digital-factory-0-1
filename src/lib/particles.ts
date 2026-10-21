/**
 * Ambient particle field — pure functions so behaviour is testable.
 * DEC-08 / master prompt R5: the pointer NEVER changes particle velocity, position or brightness.
 * It only shifts the rendered layer by a bounded depth offset (parallaxOffset).
 */

export type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  /** 0.35 (far) … 1 (near): scales size, alpha, speed and parallax. */
  depth: number;
};

export type Pointer = { x: number; y: number };
export type Rand = () => number;

export const LINK_DISTANCE = 120;
export const PARTICLE_PARALLAX_PX = 10;

export function particleCount(width: number, height: number): number {
  return Math.max(24, Math.min(110, Math.round((width * height) / 16000)));
}

export function createParticles(count: number, width: number, height: number, rand: Rand = Math.random): Particle[] {
  return Array.from({ length: count }, () => {
    const depth = 0.35 + rand() * 0.65;
    return {
      x: rand() * width,
      y: rand() * height,
      vx: (rand() - 0.5) * 0.22 * depth,
      vy: (rand() - 0.5) * 0.22 * depth,
      r: 0.6 + rand() * 1.3 * depth,
      depth,
    };
  });
}

/** Advances the field by `frames` (1 = one 60 Hz frame). Takes no pointer input by design. */
export function stepParticles(particles: readonly Particle[], frames: number, width: number, height: number): Particle[] {
  return particles.map((p) => {
    let { x, y, vx, vy } = p;
    x += vx * frames;
    y += vy * frames;
    if (x < 0 || x > width) {
      vx = -vx;
      x = Math.min(width, Math.max(0, x));
    }
    if (y < 0 || y > height) {
      vy = -vy;
      y = Math.min(height, Math.max(0, y));
    }
    return { ...p, x, y, vx, vy };
  });
}

const clampUnit = (v: number) => Math.max(-1, Math.min(1, Number.isFinite(v) ? v : 0));

/** Bounded depth offset for a pointer normalised to [-1, 1]; |x| and |y| never exceed `amplitude`. */
export function parallaxOffset(pointer: Pointer, depth: number, amplitude: number): Pointer {
  const d = Math.max(0, Math.min(1, depth));
  return {
    x: -clampUnit(pointer.x) * amplitude * d,
    y: -clampUnit(pointer.y) * amplitude * d * 0.6,
  };
}

/** Opacity of the faint network line between two particles; depends on distance and depth only. */
export function linkAlpha(distance: number, depthA: number, depthB: number): number {
  if (distance >= LINK_DISTANCE) return 0;
  return 0.16 * (1 - distance / LINK_DISTANCE) * Math.min(depthA, depthB);
}

/** Dot opacity; depends on depth only (never on pointer distance — unlike the prototype). */
export function dotAlpha(depth: number): number {
  return 0.18 + 0.4 * depth;
}

/**
 * Opacity is quantised to a few levels so the canvas strokes/fills one batched path per level instead of one
 * per line or dot (≈250 draw calls → ≤12 per frame). The step is invisible at these low opacities.
 */
export const ALPHA_LEVELS = 6;

/** Level index of `alpha` in (0, max]; -1 when nothing should be drawn. */
export function alphaLevel(alpha: number, max: number, levels = ALPHA_LEVELS): number {
  if (!(alpha > 0) || !(max > 0)) return -1;
  return Math.min(levels - 1, Math.floor((alpha / max) * levels));
}

/** Representative opacity of a level: the midpoint of its range, so quantising adds no systematic bias. */
export function levelAlpha(level: number, max: number, levels = ALPHA_LEVELS): number {
  return ((level + 0.5) / levels) * max;
}
