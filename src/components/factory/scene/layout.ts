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

/* ── camera shots ── */

/*
 * The tour's shots. The camera always stands on the camera side of the line (n), in front of the product and the
 * stations and a little to the side, above them: never behind, never inside anything. Wide screens and phones have
 * their own shots (a phone is tall: it stands further back and higher, and keeps the product in the middle).
 */

export type Pose = { pos: Vector3; target: Vector3 };
export type Frame = "wide" | "tall";

/** The tour: beside the product, from the front and a little behind, looking a little ahead to where it is going. */
export function followPose(u: number, frame: Frame): Pose {
  const { pos: p, t, n } = productPlace(u);
  if (frame === "tall") {
    return {
      target: p.clone().add(new Vector3(0, 1.2, 0)).addScaledVector(t, 0.5).addScaledVector(n, -0.4),
      pos: p.clone().addScaledVector(n, 8.2).addScaledVector(t, -1.4).add(new Vector3(0, 3.1, 0)),
    };
  }
  return {
    target: p.clone().add(new Vector3(0, 1.15, 0)).addScaledVector(t, 1.5).addScaledVector(n, -0.7),
    pos: p.clone().addScaledVector(n, 6.6).addScaledVector(t, -2.6).add(new Vector3(0, 2.5, 0)),
  };
}

/** One station, chosen by the visitor: in front of it, its glass and base whole, the product's lane before it. */
export function stationPose(index: number, frame: Frame): Pose {
  const s = stationPlace(index);
  if (frame === "tall") {
    return {
      target: s.pos.clone().add(new Vector3(0, 1.0, 0)).addScaledVector(s.n, 0.9),
      pos: s.pos.clone().addScaledVector(s.n, 8.6).addScaledVector(s.t, -1.0).add(new Vector3(0, 3.0, 0)),
    };
  }
  return {
    target: s.pos.clone().add(new Vector3(0, 1.0, 0)).addScaledVector(s.n, 0.9),
    pos: s.pos.clone().addScaledVector(s.n, 6.8).addScaledVector(s.t, -1.8).add(new Vector3(0, 2.6, 0)),
  };
}

/** The opening shot: further back and higher, the belt running away with the product at its start. */
export function introPose(u: number, frame: Frame): Pose {
  const { pos: p, t, n } = productPlace(u);
  const back = frame === "tall" ? 1.35 : 1;
  return {
    target: p.clone().addScaledVector(t, 4).add(new Vector3(0, 0.6, 0)),
    pos: p
      .clone()
      .addScaledVector(n, 12 * back)
      .addScaledVector(t, -6)
      .add(new Vector3(0, 6.5 * back, 0)),
  };
}

/**
 * Pulls a shot back along its own line of sight (never sideways: the angle stays the one designed) until a subject of
 * the given half-size fits the free part of the screen. `tanX`/`tanY` are the tangents of the free part's half-angles.
 * On a wide screen the designed shots already fit; on a phone this is what keeps the product whole.
 */
export function fitPose(p: Pose, half: { x: number; y: number }, tanX: number, tanY: number): Pose {
  const back = p.pos.clone().sub(p.target);
  const d = back.length();
  const need = Math.max(half.x / Math.max(tanX, 1e-3), half.y / Math.max(tanY, 1e-3));
  if (need <= d) return p;
  return { target: p.target, pos: p.target.clone().addScaledVector(back, need / d) };
}

/** what each shot keeps whole (half-sizes, metres): the product with a little of its station; one station */
export const FOLLOW_HALF = { x: 2.8, y: 1.7 };
export const STATION_HALF = { x: 2.1, y: 1.7 };

export { UP };
