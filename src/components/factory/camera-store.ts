/**
 * How the visitor is watching the factory, shared by the 3D scene (which moves the camera) and the controls around it
 * (which ask for a way of watching). It holds intentions only; the camera's pose is the scene's business.
 *
 *   intro     the opening shot: wide, then a slow approach to the product (skipped when motion is reduced)
 *   follow    the camera travels beside the line with the product
 *   station   stopped in front of one station, to inspect it
 *   overview  the whole factory
 *   free      the visitor's own: drag to look, wheel or pinch to zoom, right-drag or two fingers to move
 *
 * Any interaction of the visitor's with the scene switches to "free": the camera never fights their control.
 */
import { useSyncExternalStore } from "react";
import type { StationId } from "@/domain/factory";

export type CameraMode = "intro" | "follow" | "station" | "overview" | "free";
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
    /** a new way of watching: the scene moves there (smoothly unless motion is reduced) */
    go(mode: Exclude<CameraMode, "free">, station: StationId | null = null) {
      set({ mode, station: mode === "station" ? station : null, settled: false, request: state.request + 1 });
    },
    /** the visitor took the camera */
    release() {
      if (state.mode !== "free") set({ mode: "free", settled: true });
    },
    settle() {
      if (!state.settled) set({ settled: true });
    },
  };
}

export function useCamera(store: CameraStore): CameraState {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}
