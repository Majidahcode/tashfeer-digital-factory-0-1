/**
 * The layered (2.5D) factory's camera, as plain functions: where it looks for each view, and how far the visitor may
 * move it. The pictures are flat and drawn in their own perspective, so the camera faces them and only tilts a little:
 * enough to feel their depth (the layers move against each other), never enough to see them edge-on or from behind.
 *
 * World units: the belt's picture is 20 wide. y up; the pictures face +z; the camera stands on +z.
 */

export type Vec2 = { x: number; y: number };
export type Rect = { x0: number; y0: number; x1: number; y1: number };

/** a pose: the point looked at, the distance, and the tilt (yaw left/right, pitch up/down, radians) */
export type Pose = { tx: number; ty: number; tz: number; dist: number; yaw: number; pitch: number };

export const FOV_DEG = 30;

/** how far the visitor may tilt and zoom, per view */
export const LIMITS = {
  overview: { yaw: deg(5), pitch: deg(3), zoomIn: 0.8, zoomOut: 1.1 },
  station: { yaw: deg(3), pitch: deg(2), zoomIn: 0.85, zoomOut: 1.12 },
} as const;

export function deg(d: number) {
  return (d * Math.PI) / 180;
}

/** the distance at which a w × h area fills the given fractions of the view */
export function fitDistance(w: number, h: number, aspect: number, fracW: number, fracH: number) {
  const t = Math.tan(deg(FOV_DEG) / 2);
  const byH = h / (2 * t * fracH);
  const byW = w / (2 * t * aspect * fracW);
  return Math.max(byH, byW);
}

/** the whole scene: the belt and its stations; on a narrow (portrait) screen, the stations' part of the belt */
export function overviewPose(bounds: Rect, stationsBounds: Rect, aspect: number): Pose {
  const b = aspect >= 1 ? bounds : stationsBounds;
  const w = b.x1 - b.x0;
  const h = b.y1 - b.y0;
  return {
    tx: (b.x0 + b.x1) / 2,
    ty: (b.y0 + b.y1) / 2,
    tz: 0,
    dist: fitDistance(w, h, aspect, 0.96, 0.9),
    yaw: 0,
    pitch: 0,
  };
}

/**
 * Close to one station: its content area centred; on a wide screen it fills about half the view (the station's glass
 * and base around it), on a narrow one most of the width (so its text stays readable).
 */
export function stationPose(content: Rect, z: number, aspect: number): Pose {
  const w = content.x1 - content.x0;
  const h = content.y1 - content.y0;
  const wide = aspect >= 1;
  return {
    tx: (content.x0 + content.x1) / 2,
    ty: (content.y0 + content.y1) / 2,
    tz: z,
    // wide: the whole glass with its tag and most of the base in view; narrow: the content area across the width
    dist: fitDistance(w, h, aspect, wide ? 0.4 : 0.9, wide ? 0.3 : 0.42),
    yaw: 0,
    pitch: 0,
  };
}

/** the visitor's own tilt and zoom, kept inside the limits of the view */
export function clampOffsets(
  view: keyof typeof LIMITS,
  o: { yaw: number; pitch: number; zoom: number },
): { yaw: number; pitch: number; zoom: number } {
  const l = LIMITS[view];
  return {
    yaw: Math.max(-l.yaw, Math.min(l.yaw, o.yaw)),
    pitch: Math.max(-l.pitch, Math.min(l.pitch, o.pitch)),
    zoom: Math.max(l.zoomIn, Math.min(l.zoomOut, o.zoom)),
  };
}

/** the camera's position for a pose */
export function cameraPosition(p: Pose) {
  return {
    x: p.tx + Math.sin(p.yaw) * Math.cos(p.pitch) * p.dist,
    y: p.ty + Math.sin(p.pitch) * p.dist,
    z: p.tz + Math.cos(p.yaw) * Math.cos(p.pitch) * p.dist,
  };
}

/** sine in-out */
export const ease = (x: number) => -(Math.cos(Math.PI * x) - 1) / 2;

export function mixPose(a: Pose, b: Pose, k: number): Pose {
  const m = (x: number, y: number) => x + (y - x) * k;
  return {
    tx: m(a.tx, b.tx),
    ty: m(a.ty, b.ty),
    tz: m(a.tz, b.tz),
    dist: m(a.dist, b.dist),
    yaw: m(a.yaw, b.yaw),
    pitch: m(a.pitch, b.pitch),
  };
}
