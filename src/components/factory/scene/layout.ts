/**
 * The factory floor's layout: the production line's curve, where the stations stand along it, and the camera poses
 * (where it stands and what it looks at) for each way of watching. Units are metres; y is up.
 *
 * The line is one smooth curve on the floor that comes toward the visitor and bends away. The camera side of the line
 * is its "left" (the normal n); the stations stand on the far side, so the line and the product are always between
 * the camera and the station it looks at.
 */
import {
  BufferAttribute,
  BufferGeometry,
  CatmullRomCurve3,
  Vector3,
} from "three";

export const CURVE = new CatmullRomCurve3(
  [
    new Vector3(-11, 0, 3.5),
    new Vector3(-6, 0, 5.2),
    new Vector3(-1, 0, 4.2),
    new Vector3(3.5, 0, 1),
    new Vector3(6, 0, -3.2),
    new Vector3(9.5, 0, -6.4),
    new Vector3(14, 0, -7.6),
  ],
  false,
  "centripetal",
);

export const TRACK = { width: 1.7, top: 0.34 };
/** where the product waits before the first station */
export const ENTRY_U = 0.05;
const FIRST = 0.17;
const LAST = 0.9;

export function stationU(index: number, count: number): number {
  return count <= 1 ? FIRST : FIRST + ((LAST - FIRST) * index) / (count - 1);
}

const UP = new Vector3(0, 1, 0);

export function frameAt(u: number) {
  const p = CURVE.getPointAt(Math.min(1, Math.max(0, u)));
  const t = CURVE.getTangentAt(Math.min(1, Math.max(0, u))).setY(0).normalize();
  const n = new Vector3(-t.z, 0, t.x); // the camera side
  return { p, t, n };
}

/** A station's place: beside the line, on the far side. */
export function stationPlace(index: number, count: number) {
  const u = stationU(index, count);
  const { p, t, n } = frameAt(u);
  return { u, pos: p.clone().addScaledVector(n, -2.3), t, n, line: p };
}

/* ── the line's geometry: a flat, rounded ribbon with low walls ── */

export function trackGeometry(samples = 320): BufferGeometry {
  const w = TRACK.width / 2;
  const h = TRACK.top;
  const bevel = 0.06;
  // the cross-section, from the camera side round to the far side (x across, y up)
  const section: [number, number][] = [
    [w + 0.02, 0],
    [w, h - bevel],
    [w - bevel, h],
    [-w + bevel, h],
    [-w, h - bevel],
    [-w - 0.02, 0],
  ];
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= samples; i++) {
    const { p, n } = frameAt(i / samples);
    for (const [x, y] of section) {
      pos.push(p.x + n.x * x, y, p.z + n.z * x);
    }
  }
  const k = section.length;
  for (let i = 0; i < samples; i++) {
    for (let j = 0; j < k - 1; j++) {
      const a = i * k + j;
      const b = (i + 1) * k + j;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** A flat strip along the line, `offset` across it and `width` wide, at height y (the underglow, the floor glow). */
export function stripGeometry(offset: number, width: number, y: number, samples = 320): BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= samples; i++) {
    const u = i / samples;
    const { p, n } = frameAt(u);
    for (const [s, v] of [
      [offset - width / 2, 0],
      [offset + width / 2, 1],
    ] as const) {
      pos.push(p.x + n.x * s, y, p.z + n.z * s);
      uv.push(u, v);
    }
  }
  for (let i = 0; i < samples; i++) {
    const a = i * 2;
    idx.push(a, a + 2, a + 1, a + 2, a + 3, a + 1);
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute("uv", new BufferAttribute(new Float32Array(uv), 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/* ── camera poses ── */

export type Pose = { pos: Vector3; target: Vector3 };

/** Beside the line, slightly behind the product, looking at it: the tracking shot. */
export function followPose(u: number): Pose {
  const { p, t, n } = frameAt(u);
  const target = p.clone().add(new Vector3(0, TRACK.top + 0.7, 0)).addScaledVector(n, -0.6).addScaledVector(t, 0.8);
  const pos = p.clone().addScaledVector(n, 6.6).addScaledVector(t, -2.6).add(new Vector3(0, 2.5, 0));
  return { pos, target };
}

/** In front of a station, across the line, a little above: the stop to inspect it. */
export function stationPose(index: number, count: number, panelSide = 0, panelBelow = 0): Pose {
  const s = stationPlace(index, count);
  // the camera's right, seen from the line's side; `panelSide` moves the look point that way, so the station sits
  // beside the details panel instead of under it
  const right = new Vector3().crossVectors(s.n.clone().negate(), UP).normalize();
  // `panelBelow` aims lower, so the station rises above a panel that covers the lower part of a phone's screen
  const target = s.pos
    .clone()
    .add(new Vector3(0, 0.8 - panelBelow, 0))
    .addScaledVector(s.n, 0.8)
    .addScaledVector(right, panelSide);
  const pos = s.pos
    .clone()
    .addScaledVector(s.n, 8.6)
    .addScaledVector(s.t, -1.4)
    .addScaledVector(right, panelSide)
    .add(new Vector3(0, 3.1, 0));
  return { pos, target };
}

/** The whole factory: high and wide. */
export function overviewPose(): Pose {
  return { pos: new Vector3(-1, 14, 21), target: new Vector3(1.5, 0, -1) };
}

/** Where the opening shot starts: far, low and wide, before the dolly in. */
export function introStartPose(): Pose {
  return { pos: new Vector3(-16, 4.2, 20), target: new Vector3(0, 0.6, 0) };
}

/** The free camera stays inside the factory. */
export const BOUNDS = { min: new Vector3(-14, 0, -11), max: new Vector3(17, 3, 9), minDistance: 2.4, maxDistance: 28 };

export function clampTarget(v: Vector3) {
  v.clamp(BOUNDS.min, BOUNDS.max);
}

export { UP };
