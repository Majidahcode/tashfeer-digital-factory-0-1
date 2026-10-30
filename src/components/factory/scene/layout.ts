/**
 * The factory floor's layout: the production line's curve, where the stations stand along it, and the camera poses
 * (where it stands and what it looks at) for each way of watching. Units are metres; y is up.
 *
 * After the owner's reference image: the belt is a wide black platform that runs almost straight away from the
 * visitor and then bends in an S. The stations stand ON the belt, in a row along its far lane, closely spaced; the
 * product travels along the near lane, so it passes in front of them without touching them. The camera side of the
 * line is its "left" (the normal n).
 */
import {
  BufferAttribute,
  BufferGeometry,
  CatmullRomCurve3,
  Vector3,
} from "three";

export const CURVE = new CatmullRomCurve3(
  [
    new Vector3(-15, 0, 6.4),
    new Vector3(-8, 0, 3.9),
    new Vector3(-1, 0, 1.4),
    new Vector3(4.5, 0, -0.4),
    new Vector3(8.5, 0, -3.2),
    new Vector3(12.5, 0, -5.6),
    new Vector3(19, 0, -6.6),
  ],
  false,
  "centripetal",
);

const LENGTH = CURVE.getLength();

/** the belt: 4.6 m across, its running surface 0.42 m above the floor, a rounded rim at each edge */
export const TRACK = { width: 4.6, top: 0.42, rim: 0.22 };
/** the two lanes across the belt: the stations' (far) and the product's (near), from its middle */
export const LANES = { station: -1.2, product: 1.25 };
/** along the line, in metres: where the product waits, where the first station stands, and the spacing */
const ENTRY_S = 3;
const FIRST_S = 7.4;
const SPACING_S = 3.05;

/** where the product waits before the first station */
export const ENTRY_U = ENTRY_S / LENGTH;

/** a station's place along the line (the spacing is fixed, so it does not depend on how many there are) */
export function stationU(index: number): number {
  return Math.min(0.97, (FIRST_S + SPACING_S * index) / LENGTH);
}

const UP = new Vector3(0, 1, 0);

export function frameAt(u: number) {
  const p = CURVE.getPointAt(Math.min(1, Math.max(0, u)));
  const t = CURVE.getTangentAt(Math.min(1, Math.max(0, u))).setY(0).normalize();
  const n = new Vector3(-t.z, 0, t.x); // the camera side
  return { p, t, n };
}

/** A station's place: on the belt, in the far lane (y is the belt's surface). */
export function stationPlace(index: number) {
  const u = stationU(index);
  const { p, t, n } = frameAt(u);
  return { u, pos: p.clone().addScaledVector(n, LANES.station).setY(TRACK.top), t, n, line: p };
}

/** The product's place at u: on the belt, in the near lane. */
export function productPlace(u: number) {
  const { p, t, n } = frameAt(u);
  return { pos: p.clone().addScaledVector(n, LANES.product).setY(TRACK.top), t, n };
}

/**
 * A ribbon along the line between two points of its cross-section — (`a` across, `ay` up) to (`b` across, `by` up) —
 * with u along the line in metres (÷ `tile`) and v across. Flat, vertical or sloped: the belt is built from these.
 */
export function ribbonGeometry(a: number, ay: number, b: number, by: number, tile = 1, samples = 360): BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const length = LENGTH;
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
  const { pos: p, t, n } = productPlace(u);
  const target = p.clone().add(new Vector3(0, 1.1, 0)).addScaledVector(n, -1.2).addScaledVector(t, 1.4);
  const pos = p.clone().addScaledVector(n, 7.4).addScaledVector(t, -3.2).add(new Vector3(0, 2.6, 0));
  return { pos, target };
}

/** In front of a station, across the line, a little above: the stop to inspect it. */
export function stationPose(index: number, count: number, panelSide = 0, panelBelow = 0): Pose {
  const s = stationPlace(index);
  // the camera's right, seen from the line's side; `panelSide` moves the look point that way, so the station sits
  // beside the details panel instead of under it
  const right = new Vector3().crossVectors(s.n.clone().negate(), UP).normalize();
  // `panelBelow` aims lower, so the station rises above a panel that covers the lower part of a phone's screen
  const target = s.pos
    .clone()
    .add(new Vector3(0, 0.9 - panelBelow, 0))
    .addScaledVector(s.n, 0.6)
    .addScaledVector(right, panelSide);
  const pos = s.pos
    .clone()
    .addScaledVector(s.n, 8.2)
    .addScaledVector(s.t, -1.6)
    .addScaledVector(right, panelSide)
    .add(new Vector3(0, 2.9, 0));
  return { pos, target };
}

/**
 * The reference angle (the owner's approved image): low, on the camera side, just behind the product at the start of
 * the line, looking along it — the product large in front, the first station beside it, the line bending away.
 */
export function samplePose(): Pose {
  // found by projecting the product, Tashfeer and the stations and matching their places in the reference image
  // (scratch search: the reference's screen positions of the product, Tashfeer and stations 01–05)
  return { pos: SAMPLE.pos.clone(), target: SAMPLE.target.clone() };
}

/** the reference angle's camera, in world coordinates, and its field of view */
export const SAMPLE = { pos: new Vector3(-7.5, 5.4, 17), target: new Vector3(-7.22, 1.6, 3.64), fov: 46 };

/** The whole factory: high and wide. */
export function overviewPose(): Pose {
  return { pos: new Vector3(-3, 16, 22), target: new Vector3(1.5, 0, -1) };
}

/** Where the opening shot starts: far, low and wide, before the dolly in. */
export function introStartPose(): Pose {
  return { pos: new Vector3(-22, 5, 22), target: new Vector3(-6, 1, 3) };
}

/** The free camera stays inside the factory. */
export const BOUNDS = { min: new Vector3(-18, 0, -12), max: new Vector3(20, 4, 12), minDistance: 2.4, maxDistance: 30 };

export function clampTarget(v: Vector3) {
  v.clamp(BOUNDS.min, BOUNDS.max);
}

export { UP };
