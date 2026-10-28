/**
 * «أنا» → Tashfeer: the path of the pointer from the headline's first word to the robot who says it.
 * Pure geometry (scene coordinates), so it is tested on its own (tests/unit/speaker-arrow.spec.ts).
 *
 * Two cases, decided by where the word sits:
 *   - beside the robot's head (phones): a short hook leaving the word sideways and curving down onto his chest —
 *     the owner approved this one as it is;
 *   - above the robot (everywhere else): a gentle arc. Candidate arcs leave the word on the side facing him, tilted up
 *     or level, and arrive on his head diagonally; every candidate is sampled against the boxes it must not touch
 *     (headline lines, paragraphs, buttons, the portal, the chat, the steps, the customer, the phrases) and the
 *     clear one that arrives closest to a 55° diagonal, with the smoothest bend, wins. So it adapts to the live
 *     layout at every width instead of being tuned to one.
 */

export type Pt = { x: number; y: number };
export type Box = { left: number; right: number; top: number; bottom: number };
export type Curve = { S: Pt; C1: Pt; C2: Pt; E: Pt };
export type Drawing = { line: string; tip: string; curve: Curve };

/** Robot anatomy as fractions of its image box (measured on tashfeer-robot-original.png). */
export const HEAD = { x: 0.5, y: 0.004 };
export const CHEST = { x: 0.93, y: 0.28 }; // the right edge of his upper chest, beside the crossed arm
const HEAD_GAP = 10; // the arrowhead stops this far from the head, along its approach
const TIP = 9; // arrowhead arm length
const TIP_ANGLE = (28 * Math.PI) / 180;
const CLEARANCE = 6; // px kept between the line and anything it must not touch
const IDEAL_ARRIVAL = 55; // degrees below the horizontal

const rad = (deg: number) => (deg * Math.PI) / 180;

export function bezier({ S, C1, C2, E }: Curve, t: number): Pt {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return { x: a * S.x + b * C1.x + c * C2.x + d * E.x, y: a * S.y + b * C1.y + c * C2.y + d * E.y };
}

const inside = (p: Pt, b: Box, pad: number) =>
  p.x > b.left - pad && p.x < b.right + pad && p.y > b.top - pad && p.y < b.bottom + pad;

/** Degrees below the horizontal of the curve's end direction (90 = straight down). */
export function arrivalAngle(c: Curve): number {
  return (Math.atan2(c.E.y - c.C2.y, Math.abs(c.E.x - c.C2.x)) * 180) / Math.PI;
}

/** The largest distance between the curve and its chord, as a share of the chord's length (0 = a straight line). */
export function bend(c: Curve): number {
  const dx = c.E.x - c.S.x;
  const dy = c.E.y - c.S.y;
  const len = Math.hypot(dx, dy) || 1;
  let worst = 0;
  for (let i = 1; i < 24; i++) {
    const p = bezier(c, i / 24);
    worst = Math.max(worst, Math.abs((p.x - c.S.x) * dy - (p.y - c.S.y) * dx) / len);
  }
  return worst / len;
}

/** Beside the head (phones): the approved hook — leave the word sideways, curve down onto the chest. */
export function hookToChest(label: Box, robot: Box): Curve {
  const w = robot.right - robot.left;
  const h = robot.bottom - robot.top;
  const head = robot.left + HEAD.x * w;
  const toLeft = head < label.left;
  const midY = label.top + 0.58 * (label.bottom - label.top);
  const E = { x: robot.left + (toLeft ? CHEST.x : 1 - CHEST.x) * w + (toLeft ? 4 : -4), y: robot.top + CHEST.y * h };
  const S = { x: toLeft ? label.left - 6 : label.right + 6, y: midY };
  return {
    S,
    C1: { x: S.x + 0.55 * (E.x - S.x), y: S.y },
    C2: { x: E.x + 0.15 * (S.x - E.x), y: E.y - 0.7 * (E.y - S.y) },
    E,
  };
}

type Candidate = { curve: Curve; score: number; clear: boolean };

/**
 * Above the robot: the clear arc that best meets the brief — diagonal arrival, a visible but gentle bend, short.
 * `bounds` is the area the line may use (the scene). Returns the least-bad arc if none is clear.
 */
export function arcToHead(label: Box, robot: Box, guards: readonly Box[], bounds: Box): Curve {
  const w = robot.right - robot.left;
  const h = robot.bottom - robot.top;
  const head = { x: robot.left + HEAD.x * w, y: robot.top + HEAD.y * h };
  const cx = (label.left + label.right) / 2;
  const side = head.x >= cx ? 1 : -1; // +1: the robot is to the word's right
  const midY = label.top + 0.55 * (label.bottom - label.top);
  const starts: Array<{ S: Pt; dir: number }> = [
    { S: { x: side > 0 ? label.right + 8 : label.left - 8, y: midY }, dir: side > 0 ? 0 : 180 },
    { S: { x: side > 0 ? label.right + 4 : label.left - 4, y: label.bottom + 4 }, dir: side > 0 ? 35 : 145 },
  ];
  const robotBody: Box = { left: robot.left + 0.12 * w, right: robot.right - 0.12 * w, top: robot.top + 0.02 * h, bottom: robot.bottom };
  let best: Candidate | null = null;
  for (const { S, dir } of starts) {
    for (const arrive of [35, 45, 55, 65, 75]) {
      const ux = side * Math.cos(rad(arrive));
      const uy = Math.sin(rad(arrive));
      const E = { x: head.x - HEAD_GAP * ux, y: head.y - HEAD_GAP * uy };
      const chord = Math.hypot(E.x - S.x, E.y - S.y);
      if (chord < 24) continue;
      for (const tilt of [-30, -18, -6, 6]) {
        const a = rad(dir + (side > 0 ? tilt : -tilt));
        for (const k1 of [0.3, 0.45, 0.6]) {
          for (const k2 of [0.3, 0.45, 0.6]) {
            const curve: Curve = {
              S,
              C1: { x: S.x + k1 * chord * Math.cos(a), y: S.y + k1 * chord * Math.sin(a) },
              C2: { x: E.x - k2 * chord * ux, y: E.y - k2 * chord * uy },
              E,
            };
            let hits = 0;
            for (let i = 0; i <= 48; i++) {
              const t = i / 48;
              const p = bezier(curve, t);
              if (p.x < bounds.left + 2 || p.x > bounds.right - 2 || p.y < bounds.top + 2 || p.y > bounds.bottom - 2) hits++;
              if (t > 0.12 && inside(p, label, 2)) hits++;
              if (t < 0.9 && inside(p, robotBody, 0)) hits++;
              for (const g of guards) if (inside(p, g, CLEARANCE)) hits++;
            }
            const b = bend(curve);
            const score =
              Math.abs(arrivalAngle(curve) - IDEAL_ARRIVAL) +
              (b < 0.08 ? (0.08 - b) * 400 : 0) + // nearly straight: what the owner asked to avoid
              (b > 0.3 ? (b - 0.3) * 300 : 0) + // a loop or a wide swing
              chord / 40 +
              Math.abs(k1 - 0.45) * 10 +
              Math.abs(k2 - 0.45) * 10 +
              hits * 1000;
            if (!best || score < best.score) best = { curve, score, clear: hits === 0 };
          }
        }
      }
    }
  }
  return best!.curve;
}

/** SVG paths for the curve and its arrowhead (along the end tangent, so it always points into the robot). */
export function toDrawing(curve: Curve): Drawing {
  const { C2, E } = curve;
  const len = Math.hypot(E.x - C2.x, E.y - C2.y) || 1;
  const ux = (E.x - C2.x) / len;
  const uy = (E.y - C2.y) / len;
  const arm = (sign: number) => {
    const c = Math.cos(sign * TIP_ANGLE);
    const s = Math.sin(sign * TIP_ANGLE);
    return { x: E.x - TIP * (ux * c - uy * s), y: E.y - TIP * (ux * s + uy * c) };
  };
  const f = (p: Pt) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
  return {
    line: `M${f(curve.S)} C${f(curve.C1)} ${f(curve.C2)} ${f(E)}`,
    tip: `M${f(arm(1))} L${f(E)} L${f(arm(-1))}`,
    curve,
  };
}

/**
 * The curve cut into `n` pieces of equal length along it, each with the fraction of the way it sits at (its middle),
 * so a colour can run along the path itself — not across the screen, as a straight gradient would on an arc.
 */
export function alongCurve(curve: Curve, n = 48): { d: string; at: number }[] {
  const STEPS = 400;
  const pts: Pt[] = [];
  const len: number[] = [0];
  for (let i = 0; i <= STEPS; i++) {
    pts.push(bezier(curve, i / STEPS));
    if (i) len.push(len[i - 1]! + Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y));
  }
  const total = len[STEPS]! || 1;
  const pointAt = (s: number): Pt => {
    let i = 1;
    while (i < STEPS && len[i]! < s) i++;
    const k = (s - len[i - 1]!) / ((len[i]! - len[i - 1]!) || 1);
    return { x: pts[i - 1]!.x + k * (pts[i]!.x - pts[i - 1]!.x), y: pts[i - 1]!.y + k * (pts[i]!.y - pts[i - 1]!.y) };
  };
  const f = (p: Pt) => `${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
  const out: { d: string; at: number }[] = [];
  for (let j = 0; j < n; j++) {
    const a = (j / n) * total;
    const b = ((j + 1) / n) * total;
    const mid = [1, 2, 3].map((q) => pointAt(a + ((b - a) * q) / 4));
    out.push({ d: `M${f(pointAt(a))} L${mid.map(f).join(" L")} L${f(pointAt(b))}`, at: (j + 0.5) / n });
  }
  return out;
}

/** Which case applies: the word beside the robot's head (hook) or above him (arc). */
export function pointer(label: Box, robot: Box, guards: readonly Box[], bounds: Box): Drawing {
  const headY = robot.top + HEAD.y * (robot.bottom - robot.top);
  const above = headY > label.bottom + 12;
  return toDrawing(above ? arcToHead(label, robot, guards, bounds) : hookToChest(label, robot));
}
