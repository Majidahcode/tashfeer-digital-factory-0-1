import { expect, test } from "@playwright/test";
import {
  LIMITS,
  cameraPosition,
  clampOffsets,
  deg,
  fitDistance,
  mixPose,
  overviewPose,
  stationPose,
} from "../../src/components/factory/layered/layered-camera";

/* The layered factory's camera: framing, and limits that keep the flat pictures from showing their edges. */

test("a station's content area fills the asked share of the view (wide and narrow screens)", () => {
  const t = Math.tan(deg(30) / 2);
  const content = { x0: -1, y0: 0, x1: 1, y1: 1 };
  for (const aspect of [16 / 9, 390 / 700]) {
    const p = stationPose(content, 0.5, aspect);
    const viewH = 2 * t * p.dist;
    const viewW = viewH * aspect;
    // it fits, and at least one side reaches its share
    expect(2 / viewW).toBeLessThanOrEqual(aspect >= 1 ? 0.4 + 1e-9 : 0.9 + 1e-9);
    expect(1 / viewH).toBeLessThanOrEqual(aspect >= 1 ? 0.3 + 1e-9 : 0.42 + 1e-9);
    expect(Math.max(2 / viewW / (aspect >= 1 ? 0.4 : 0.9), 1 / viewH / (aspect >= 1 ? 0.3 : 0.42))).toBeCloseTo(1, 6);
    expect(p).toMatchObject({ tx: 0, ty: 0.5, tz: 0.5, yaw: 0, pitch: 0 });
  }
});

test("the overview frames the whole belt on a wide screen, the stations' part on a narrow one", () => {
  const all = { x0: -10, y0: -3, x1: 10, y1: 4 };
  const st = { x0: -6, y0: -2, x1: 3, y1: 3 };
  expect(overviewPose(all, st, 1.6).tx).toBe(0);
  expect(overviewPose(all, st, 0.5).tx).toBe(-1.5);
  expect(fitDistance(20, 7, 1.6, 0.96, 0.9)).toBeGreaterThan(fitDistance(9, 5, 1.6, 0.96, 0.9));
});

test("the visitor's tilt and zoom stay inside the limits; the camera never goes round to the side or behind", () => {
  for (const view of ["overview", "station"] as const) {
    const o = clampOffsets(view, { yaw: 3, pitch: -3, zoom: 50 });
    expect(Math.abs(o.yaw)).toBeLessThanOrEqual(LIMITS[view].yaw);
    expect(Math.abs(o.pitch)).toBeLessThanOrEqual(LIMITS[view].pitch);
    expect(o.zoom).toBe(LIMITS[view].zoomOut);
    expect(clampOffsets(view, { yaw: 0, pitch: 0, zoom: 0.01 }).zoom).toBe(LIMITS[view].zoomIn);
    // at the widest tilt the camera is still in front of the pictures, facing them within a few degrees
    const c = cameraPosition({ tx: 0, ty: 0, tz: 0, dist: 10, yaw: LIMITS[view].yaw, pitch: LIMITS[view].pitch });
    expect(c.z).toBeGreaterThan(9.8);
    expect(LIMITS[view].yaw).toBeLessThanOrEqual(deg(5));
  }
});

test("moving between poses is a blend: the ends are the poses themselves", () => {
  const a = { tx: 0, ty: 0, tz: 0, dist: 10, yaw: 0, pitch: 0 };
  const b = { tx: 4, ty: 1, tz: 0.5, dist: 5, yaw: 0, pitch: 0 };
  expect(mixPose(a, b, 0)).toEqual(a);
  expect(mixPose(a, b, 1)).toEqual(b);
  expect(mixPose(a, b, 0.5).dist).toBe(7.5);
});
