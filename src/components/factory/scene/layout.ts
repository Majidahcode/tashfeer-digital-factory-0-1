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

/** the belt: 2.1 m across, its running surface 0.42 m above the floor, a raised lip at each edge */
export const TRACK = { width: 2.1, top: 0.42, lip: 0.06, lipWidth: 0.14 };
/** where the product waits before the first station */
export const ENTRY_U = 0.05;
const FIRST = 0.2;
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

/**
 * A ribbon along the line between two points of its cross-section — (`a` across, `ay` up) to (`b` across, `by` up) —
 * with u along the line in metres (÷ `tile`) and v across. Flat, vertical or sloped: the belt is built from these.
 */
export function ribbonGeometry(a: number, ay: number, b: number, by: number, tile = 1, samples = 360): BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const length = CURVE.getLength();
  for (let i = 0; i <= samples; i++) {
    const u = i / samples;
    const { p, n } = frameAt(u);
    pos.push(p.x + n.x * a, ay, p.z + n.z * a, p.x + n.x * b, by, p.z + n.z * b);
    uv.push((u * length) / tile, 0, (u * length) / tile, 1);
  }
  for (let i = 0; i < samples; i++) {
    const k = i * 2;
    idx.push(k, k + 2, k + 1, k + 2, k + 3, k + 1);
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
  const target = p.clone().add(new Vector3(0, TRACK.top + 1.1, 0)).addScaledVector(n, -0.6).addScaledVector(t, 0.8);
  const pos = p.clone().addScaledVector(n, 7.6).addScaledVector(t, -2.8).add(new Vector3(0, 2.8, 0));
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

/**
 * The reference angle (the owner's approved image): low, on the camera side, just behind the product at the start of
 * the line, looking along it — the product large in front, the first station beside it, the line bending away.
 */
export function samplePose(): Pose {
  // found by projecting the product, Tashfeer and the stations and matching their places in the reference image
  const { p, t, n } = frameAt(ENTRY_U);
  const target = p.clone().addScaledVector(t, 3.4).addScaledVector(n, -2.75).add(new Vector3(0, 1, 0));
  const pos = p.clone().addScaledVector(n, 9.3).addScaledVector(t, 3.6).add(new Vector3(0, 3, 0));
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
