/**
 * The layered factory's layout: each picture's place and size in the world, from the pictures themselves
 * (assets.json: their sizes, the content area and the base's foot of each station, points on the belt's surface).
 *
 * Depth (z): the belt at the back, the farther station in front of it, the nearer station in front of that — small
 * gaps, so the layers move against each other when the camera tilts, but a station never seems to slide off the belt
 * within the camera's limits.
 */
import assets from "./assets.json";
import type { Rect } from "./layered-camera";

export const BELT_WIDTH = 20;

export type LayerStationId = "s04" | "s05";
export type StageId = "interfaces" | "services";

/** the two stations of this trial, and the production stage whose data each one shows */
export const LAYER_STATIONS: readonly {
  id: LayerStationId;
  art: "station-04" | "station-05";
  num: string;
  title: string;
  stage: StageId;
  /** the point on the belt (belt picture pixels) where its foot stands */
  on: [number, number];
  /** its width in the world (the farther one smaller) */
  width: number;
  z: number;
}[] = [
  { id: "s04", art: "station-04", num: "04", title: "تصميم الواجهات", stage: "interfaces", on: [650, 450], width: 4.4, z: 0.5 },
  { id: "s05", art: "station-05", num: "05", title: "التطوير والبرمجة", stage: "services", on: [1250, 372], width: 3.75, z: 0.25 },
];

const [BELT_PX_W, BELT_PX_H] = assets.belt.original as [number, number];

export const BELT = {
  src: assets.belt.src,
  w: BELT_WIDTH,
  h: (BELT_WIDTH * BELT_PX_H) / BELT_PX_W,
  z: -0.25,
};

/** a point of the belt's picture (original pixels) in the world */
export function beltPoint([px, py]: [number, number]) {
  const [w, h] = assets.belt.original as [number, number];
  return { x: (px / w - 0.5) * BELT.w, y: (0.5 - py / h) * BELT.h };
}

export type Placed = {
  id: LayerStationId;
  src: string;
  emptySrc: string;
  /** the picture's centre and size in the world */
  cx: number;
  cy: number;
  z: number;
  w: number;
  h: number;
  /** the content area (inside the glass's inner panel), in the world */
  content: Rect;
};

export function placeStations(): Placed[] {
  return LAYER_STATIONS.map((s) => {
    const a = assets[s.art];
    const [ow, oh] = a.original as [number, number];
    const w = s.width;
    const h = (w * oh) / ow;
    const foot = beltPoint(s.on);
    const [fx, fy] = a.foot as [number, number];
    // the picture's centre: its foot pixel on the belt's point
    const cx = foot.x + w * (0.5 - fx / ow);
    const cy = foot.y + h * (fy / oh - 0.5);
    const [x0, y0, x1, y1] = a.content as [number, number, number, number];
    const toWorld = (px: number, py: number) => ({ x: cx + w * (px / ow - 0.5), y: cy + h * (0.5 - py / oh) });
    const p0 = toWorld(x0, y1);
    const p1 = toWorld(x1, y0);
    return { id: s.id, src: a.src, emptySrc: a.empty.src, cx, cy, z: s.z, w, h, content: { x0: p0.x, y0: p0.y, x1: p1.x, y1: p1.y } };
  });
}

/** the area the overview frames: the whole belt with the stations on it; and the stations' part only */
export function sceneBounds(placed: readonly Placed[]): { all: Rect; stations: Rect } {
  const tops = placed.map((p) => p.cy + p.h / 2);
  const all = { x0: -BELT.w / 2, x1: BELT.w / 2, y0: -BELT.h / 2, y1: Math.max(BELT.h / 2, ...tops) };
  const xs = placed.flatMap((p) => [p.cx - p.w / 2, p.cx + p.w / 2]);
  const ys = placed.flatMap((p) => [p.cy - p.h / 2, p.cy + p.h / 2]);
  const stations = { x0: Math.min(...xs) - 0.4, x1: Math.max(...xs) + 0.4, y0: Math.min(...ys) - 0.6, y1: Math.max(...ys) + 0.2 };
  return { all, stations };
}

export const ALL_SOURCES = [assets.belt.src, ...LAYER_STATIONS.flatMap((s) => [assets[s.art].src, assets[s.art].empty.src])];
