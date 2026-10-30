/**
 * Where the factory's camera is going, shared by the 3D scene (which moves the camera) and the controls around it (which
 * ask for a shot). It holds intentions only; the camera's pose is the scene's business. There is no free camera: the
 * visitor chooses shots, never drags, turns or zooms the scene.
 *
 *   intro     the opening shot: the belt and the product, then a slow approach to the product (skipped when motion is
 *             reduced)
 *   follow    the tour: beside the product from the front and a little to the side, moving with it along the line and
 *             holding still while it is worked on
 *   station   one station chosen by the visitor: the camera goes there and stays until they return to the product
 */
import { useSyncExternalStore } from "react";
import type { StationId } from "@/domain/factory";

export type CameraMode = "intro" | "follow" | "station";
export type CameraState = { mode: CameraMode; station: StationId | null; settled: boolean; request: number };

export type CameraStore = ReturnType<typeof createCameraStore>;

export function createCameraStore(initial: CameraMode) {
  let state: CameraState = { mode: initial, station: null, settled: initial === "follow", request: 0 };
  const listeners = new Set<() => void>();
  const set = (next: Partial<CameraState>) => {
    state = { ...state, ...next };
    for (const l of listeners) l();
  };
  return {
    get: () => state,
    subscribe(l: () => void) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    /** a new shot: the scene moves there (smoothly unless motion is reduced or the tour's motion is paused) */
    go(mode: CameraMode, station: StationId | null = null) {
      set({ mode, station: mode === "station" ? station : null, settled: false, request: state.request + 1 });
    },
    settle() {
      if (!state.settled) set({ settled: true });
    },
  };
}

export function useCamera(store: CameraStore): CameraState {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}
