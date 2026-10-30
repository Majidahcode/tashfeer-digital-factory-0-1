"use client";
/* eslint-disable react-hooks/immutability -- three.js objects and the panel's style are changed every frame */

/**
 * The layered (2.5D) factory scene: the owner's pictures (the belt, two stations) as flat layers at small depth gaps,
 * over the site's dark ambient background (the canvas is transparent). The camera faces the layers and only tilts and
 * zooms a little (limits in layered-camera.ts). Production never moves it: the scene receives only which station is
 * chosen.
 *
 * The content panel is real HTML (in LayeredFactory); every frame the scene places it over the chosen station's
 * content area, as the camera sees it.
 */
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { type RefObject, useEffect, useMemo, useRef } from "react";
import {
  CanvasTexture,
  type MeshBasicMaterial,
  type PerspectiveCamera,
  SRGBColorSpace,
  type Texture,
  Vector3,
} from "three";
import {
  FOV_DEG,
  type Pose,
  cameraPosition,
  clampOffsets,
  ease,
  mixPose,
  overviewPose,
  stationPose,
} from "./layered-camera";
import { BELT, type LayerStationId, type Placed, placeStations, sceneBounds } from "./layout";

export type CameraView = { mode: "overview" } | { mode: "station"; id: LayerStationId };

export type CameraReport = { mode: "overview" | "station"; id: LayerStationId | null; settled: boolean };

const MOVE_S = 1.1;

declare global {
  interface Window {
    /** read-only views of the layered scene, for tests and reviews */
    __layered?: {
      pose: () => Pose & { offsets: { yaw: number; pitch: number; zoom: number } };
      goal: () => Pose;
    };
  }
}

export default function LayeredScene({
  textures,
  view,
  reducedMotion,
  panel,
  onSelect,
  onCamera,
}: {
  /** the pictures, already loaded (the scene is mounted only once they are) */
  textures: Record<string, Texture>;
  view: CameraView;
  reducedMotion: boolean;
  /** the content panel (HTML), placed by the scene over the chosen station's content area */
  panel: RefObject<HTMLDivElement | null>;
  onSelect: (id: LayerStationId) => void;
  onCamera: (r: CameraReport) => void;
}) {
  return (
    <Canvas
      flat
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      camera={{ fov: FOV_DEG, near: 0.1, far: 200, position: [0, 0, 40] }}
      data-layered-canvas=""
      style={{ background: "transparent", touchAction: "none" }}
    >
      <Layers textures={textures} view={view} reducedMotion={reducedMotion} panel={panel} onSelect={onSelect} onCamera={onCamera} />
    </Canvas>
  );
}

function Layers({
  textures,
  view,
  reducedMotion,
  panel,
  onSelect,
  onCamera,
}: {
  textures: Record<string, Texture>;
  view: CameraView;
  reducedMotion: boolean;
  panel: RefObject<HTMLDivElement | null>;
  onSelect: (id: LayerStationId) => void;
  onCamera: (r: CameraReport) => void;
}) {
  const placed = useMemo(() => placeStations(), []);
  const bounds = useMemo(() => sceneBounds(placed), [placed]);
  const haze = useMemo(() => hazeTexture(), []);
  return (
    <>
      {/* far behind: a soft emerald haze, moving least when the camera tilts (the deepest layer) */}
      <mesh position={[-2, 1.5, -9]} renderOrder={-1}>
        <planeGeometry args={[60, 26]} />
        <meshBasicMaterial map={haze} transparent depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0, BELT.z]} renderOrder={0}>
        <planeGeometry args={[BELT.w, BELT.h]} />
        <meshBasicMaterial map={textures[BELT.src]} transparent depthWrite={false} toneMapped={false} />
      </mesh>
      {/* the farther station drawn first */}
      {[...placed]
        .sort((a, b) => a.z - b.z)
        .map((p, i) => (
          <StationLayer
            key={p.id}
            p={p}
            order={1 + i}
            art={textures[p.src]!}
            empty={textures[p.emptySrc]!}
            focused={view.mode === "station" && view.id === p.id}
            reducedMotion={reducedMotion}
            onSelect={onSelect}
          />
        ))}
      <Rig view={view} placed={placed} bounds={bounds} reducedMotion={reducedMotion} panel={panel} onCamera={onCamera} />
    </>
  );
}

/**
 * A station: its picture, and under it the same picture with its inner panel emptied (a stopgap until the real empty
 * pictures exist) — shown only while the station is chosen, when the content panel covers that area entirely.
 */
function StationLayer({
  p,
  order,
  art,
  empty,
  focused,
  reducedMotion,
  onSelect,
}: {
  p: Placed;
  order: number;
  art: Texture;
  empty: Texture;
  focused: boolean;
  reducedMotion: boolean;
  onSelect: (id: LayerStationId) => void;
}) {
  const artMat = useRef<MeshBasicMaterial>(null);
  const emptyMat = useRef<MeshBasicMaterial>(null);
  const k = useRef(0);
  useFrame((_, dt) => {
    const goal = focused ? 1 : 0;
    k.current = reducedMotion ? goal : k.current + (goal - k.current) * (1 - Math.exp(-dt * 6));
    if (artMat.current) artMat.current.opacity = 1 - k.current;
    if (emptyMat.current) emptyMat.current.opacity = k.current;
  });
  return (
    <group position={[p.cx, p.cy, p.z]}>
      <mesh renderOrder={order * 2}>
        <planeGeometry args={[p.w, p.h]} />
        <meshBasicMaterial ref={emptyMat} map={empty} transparent opacity={0} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh
        renderOrder={order * 2 + 1}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(p.id);
        }}
        onPointerOver={() => (document.body.style.cursor = "pointer")}
        onPointerOut={() => (document.body.style.cursor = "")}
      >
        <planeGeometry args={[p.w, p.h]} />
        <meshBasicMaterial ref={artMat} map={art} transparent depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
}

function hazeTexture() {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 256;
  const ctx = c.getContext("2d")!;
  const probe = getComputedStyle(document.documentElement);
  const emerald = probe.getPropertyValue("--brand-emerald").trim();
  const g = ctx.createRadialGradient(256, 150, 10, 256, 150, 250);
  g.addColorStop(0, emerald);
  g.addColorStop(1, "transparent");
  ctx.globalAlpha = 0.16;
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 256);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/**
 * The camera: eases from wherever it is to the view's pose (a new choice mid-move starts from where it is — no jump);
 * the visitor's drag tilts it and the wheel zooms it, inside the view's limits; a new view resets both.
 */
function Rig({
  view,
  placed,
  bounds,
  reducedMotion,
  panel,
  onCamera,
}: {
  view: CameraView;
  placed: Placed[];
  bounds: ReturnType<typeof sceneBounds>;
  reducedMotion: boolean;
  panel: RefObject<HTMLDivElement | null>;
  onCamera: (r: CameraReport) => void;
}) {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const size = useThree((s) => s.size);
  const gl = useThree((s) => s.gl);
  const aspect = size.width / Math.max(1, size.height);
  const chosen = view.mode === "station" ? placed.find((p) => p.id === view.id) ?? null : null;
  const goal = useMemo<Pose>(
    () => (chosen ? stationPose(chosen.content, chosen.z, aspect) : overviewPose(bounds.all, bounds.stations, aspect)),
    [chosen, aspect, bounds],
  );
  const pose = useRef<Pose | null>(null);
  const move = useRef<{ from: Pose; start: number; dur: number } | null>(null);
  const offsets = useRef({ yaw: 0, pitch: 0, zoom: 1 });
  const settled = useRef(false);
  const viewKey = view.mode === "station" ? view.id : "overview";
  const lastKey = useRef<string | null>(null);
  const report = useRef(onCamera);
  useEffect(() => {
    report.current = onCamera;
  }, [onCamera]);

  // a new screen size while still: the frame loop keeps the framing (it follows the goal); report it as moving
  // until that frame has run, so nothing reads a stale place in between
  useEffect(() => {
    settled.current = false;
  }, [goal]);

  // the visitor's hand: drag to tilt, wheel to zoom (both limited)
  useEffect(() => {
    const el = gl.domElement;
    let drag: { x: number; y: number; yaw: number; pitch: number } | null = null;
    const lim = () => (lastKey.current === "overview" ? "overview" : "station");
    const down = (e: PointerEvent) => {
      drag = { x: e.clientX, y: e.clientY, yaw: offsets.current.yaw, pitch: offsets.current.pitch };
      el.setPointerCapture?.(e.pointerId);
    };
    const moveH = (e: PointerEvent) => {
      if (!drag) return;
      const k = 0.0035;
      offsets.current = clampOffsets(lim(), {
        ...offsets.current,
        yaw: drag.yaw - (e.clientX - drag.x) * k,
        pitch: drag.pitch + (e.clientY - drag.y) * k,
      });
    };
    const up = () => (drag = null);
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      offsets.current = clampOffsets(lim(), { ...offsets.current, zoom: offsets.current.zoom * Math.exp(e.deltaY * 0.0012) });
    };
    el.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", moveH);
    window.addEventListener("pointerup", up);
    el.addEventListener("wheel", wheel, { passive: false });
    return () => {
      el.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", moveH);
      window.removeEventListener("pointerup", up);
      el.removeEventListener("wheel", wheel);
    };
  }, [gl]);

  useEffect(() => {
    window.__layered = {
      pose: () => ({ ...(pose.current ?? goal), offsets: { ...offsets.current } }),
      goal: () => goal,
    };
  }, [goal]);

  const corner = useMemo(() => new Vector3(), []);
  useFrame(() => {
    // a new view is noticed here, in the frame loop itself (not in an effect, which can run a frame late — that
    // frame would jump straight to the goal): the move starts where the camera really is, the visitor's tilt and
    // zoom included, and those are then cleared
    if (!pose.current) {
      pose.current = goal; // the very first frame: placed at once
      lastKey.current = viewKey;
    } else if (lastKey.current !== viewKey) {
      lastKey.current = viewKey;
      const o = offsets.current;
      const cur = pose.current;
      const from = { ...cur, yaw: cur.yaw + o.yaw, pitch: cur.pitch + o.pitch, dist: cur.dist * o.zoom };
      offsets.current = { yaw: 0, pitch: 0, zoom: 1 };
      move.current = { from, start: performance.now(), dur: reducedMotion ? 0 : MOVE_S * 1000 };
      settled.current = false;
      report.current({ mode: view.mode, id: view.mode === "station" ? view.id : null, settled: false });
    }
    let p = pose.current;
    const m = move.current;
    if (m) {
      const t = m.dur <= 0 ? 1 : Math.min(1, (performance.now() - m.start) / m.dur);
      p = mixPose(m.from, goal, ease(t));
      if (t >= 1) move.current = null;
    } else {
      p = goal;
    }
    pose.current = p;
    // the visitor's tilt and zoom on top of the pose (cleared when a new view is chosen)
    const o = offsets.current;
    const eff: Pose = { ...p, yaw: p.yaw + o.yaw, pitch: p.pitch + o.pitch, dist: p.dist * o.zoom };
    const c = cameraPosition(eff);
    camera.position.set(c.x, c.y, c.z);
    camera.lookAt(eff.tx, eff.ty, eff.tz);
    camera.updateMatrixWorld();
    if (!move.current && !settled.current) {
      settled.current = true;
      report.current({ mode: view.mode, id: view.mode === "station" ? view.id : null, settled: true });
    }
    // the content panel over the chosen station's content area, as the camera sees it now
    const el = panel.current;
    if (el && chosen) {
      const r = chosen.content;
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const [x, y] of [
        [r.x0, r.y0],
        [r.x1, r.y0],
        [r.x0, r.y1],
        [r.x1, r.y1],
      ] as const) {
        corner.set(x, y, chosen.z).project(camera);
        const sx = ((corner.x + 1) / 2) * size.width;
        const sy = ((1 - corner.y) / 2) * size.height;
        minX = Math.min(minX, sx);
        maxX = Math.max(maxX, sx);
        minY = Math.min(minY, sy);
        maxY = Math.max(maxY, sy);
      }
      el.style.left = `${minX}px`;
      el.style.top = `${minY}px`;
      el.style.width = `${maxX - minX}px`;
      el.style.height = `${maxY - minY}px`;
    }
  });
  return null;
}
