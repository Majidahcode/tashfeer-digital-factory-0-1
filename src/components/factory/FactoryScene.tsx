"use client";
/* eslint-disable react-hooks/immutability, react-hooks/refs -- three.js objects (camera, meshes, materials) are
   changed every frame inside useFrame, outside React's rendering: that is how React Three Fiber animates */

/**
 * The factory in 3D (React Three Fiber): one continuous scene — a black production line bending across a very dark
 * floor, lit from below its edges; the stations beside it; the visitor's one product travelling on it, its screen
 * showing the approved model as it is built.
 *
 * The camera is directed, never handled: a short opening shot, then the tour beside the product (it moves with the
 * product and holds still while the product is worked on), or one station the visitor chose. No drag, turn or zoom.
 * The shots are framed in the part of the screen the information card leaves free (a view offset), so the card never
 * covers the product or the station.
 */
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  BoxGeometry,
  EdgesGeometry,
  Frustum,
  Matrix4,
  type Group,
  type PerspectiveCamera,
  type Mesh,
  type MeshStandardMaterial,
  Vector3,
} from "three";
import type { IconName } from "@/components/icons/Icon";
import type { StationId, StationStatus } from "@/domain/factory";
import type { ModelId } from "@/lib/project-store";
import type { CameraStore } from "./camera-store";
import {
  ENTRY_U,
  FOLLOW_HALF,
  STATION_HALF,
  type Frame,
  type Pose,
  fitPose,
  followPose,
  introPose,
  productPlace,
  stationPlace,
  stationPose,
} from "./scene/layout";
import { type ScenePalette, readPalette } from "./scene/palette";
import {
  Architecture,
  Belt,
  Effects,
  Environment,
  PRODUCT,
  ProductCase,
  type Quality,
  QualityContext,
  ReflectiveFloor,
  SampleStation,
  lit,
} from "./scene/Showcase";
import {
  drawProductScreen,
  iconTexture,
  productScreenTexture,
  stationLabel,
} from "./scene/textures";

export type SceneStation = { id: StationId; name: string; status: StationStatus; icon: IconName };

export type FactorySceneProps = {
  stations: readonly SceneStation[];
  selected: StationId | null;
  /** the product: index of the station it travels to (−1: waiting at the entry) and how far it has travelled */
  travel: { to: number; t: number };
  /** how much of the product is built, 0..1 */
  build: number;
  /** production has not started: the screen shows the approved model, waiting */
  waiting: boolean;
  /** the quality station is checking the product */
  checking: boolean;
  delivered: boolean;
  model: ModelId;
  camera: CameraStore;
  reducedMotion: boolean;
  onSelect: (id: StationId) => void;
  /** the tour's camera motion paused by the visitor: shots change at once, nothing moves by itself (production goes on) */
  tourPaused: boolean;
  /** the screen covered by the controls around the scene (px): the shots are framed in the rest */
  covered: { top: number; bottom: number; start: number };
};

export default function FactoryScene(props: FactorySceneProps) {
  return (
    <Canvas
      dpr={[1, 1.5]}
      camera={{ fov: 40, near: 0.1, far: 140, position: introPose(ENTRY_U, "wide").pos.toArray() }}
      gl={{ antialias: true, powerPreference: "high-performance", toneMappingExposure: 1.05 }}
      data-factory-canvas=""
    >
      <World {...props} />
    </Canvas>
  );
}

/** ?quality=high|low forces a level (for reviews and weak devices); otherwise it is chosen from the frame rate */
function forcedQuality(): Quality | null {
  const q = new URLSearchParams(window.location.search).get("quality");
  return q === "high" || q === "low" ? q : null;
}

/** Measures the frame rate for about 1.5 s after the first frames; under 24 fps it asks for the lighter level. */
function QualityProbe({ onLow }: { onLow: () => void }) {
  const t = useRef({ frames: 0, time: 0, warm: 0, done: false });
  useFrame((_, dt) => {
    const s = t.current;
    if (s.done) return;
    if (s.warm < 3) {
      s.warm += 1; // the first frames compile shaders and upload textures: not a measure
      return;
    }
    s.frames += 1;
    s.time += dt;
    // decide after 1.5 s, or at once if even a few frames are this slow
    if (s.time >= 1.5 || (s.frames >= 3 && s.time / s.frames > 0.2)) {
      s.done = true;
      if (s.frames / s.time < 24) onLow();
    }
  });
  return null;
}

/** A GPU drawn in software (no graphics card): slow on any device, so the light level from the start. */
function softwareRenderer(gl: { getContext: () => WebGLRenderingContext | WebGL2RenderingContext }): boolean {
  const ctx = gl.getContext();
  const info = ctx.getExtension("WEBGL_debug_renderer_info");
  const name = String(info ? ctx.getParameter(info.UNMASKED_RENDERER_WEBGL) : ctx.getParameter(ctx.RENDERER));
  return /swiftshader|llvmpipe|software/i.test(name);
}

/** ?off=fx,floor,belt,env,arch — a review aid: leaves parts of the scene out, to see what each one contributes */
function offParts(): Set<string> {
  return new Set((new URLSearchParams(window.location.search).get("off") ?? "").split(",").filter(Boolean));
}

function World(props: FactorySceneProps) {
  const [off] = useState(offParts);
  const pal = useMemo(() => readPalette(), []);
  const gl = useThree((s) => s.gl);
  const [forced] = useState(forcedQuality);
  const [quality, setQuality] = useState<Quality>(() => forced ?? (softwareRenderer(gl) ? "low" : "high"));
  useEffect(() => {
    window.__tashfeerFactoryQuality = quality;
  }, [quality]);
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    scene.background = pal.bg.clone();
    scene.fog = null;
  }, [scene, pal]);
  return (
    <QualityContext value={quality}>
      <fog attach="fog" args={[pal.bg, 18, 52]} />
      {/* the reflections' environment on the high level only (sampled by every glossy pixel) */}
      {quality === "high" && !off.has("env") && <Environment pal={pal} />}
      <ambientLight color={pal.text} intensity={0.08} />
      <hemisphereLight args={[pal.text, pal.bg, 0.18]} />
      {/* the key light: high, from the front left (on Tashfeer, the cases' tops and the belt's rim) */}
      <directionalLight color={pal.text} intensity={0.7} position={[-10, 14, 12]} />

      {!forced && quality === "high" && <QualityProbe onLow={() => setQuality("low")} />}
      {!off.has("floor") && <ReflectiveFloor pal={pal} quality={quality} />}
      {!off.has("arch") && <Architecture pal={pal} />}
      {/* the belt, the stations and the product use the sample's Blender models: shown once they have loaded */}
      <Suspense fallback={null}>
        {!off.has("belt") && <Belt pal={pal} />}
        {props.stations.map((s, i) => (
          <StationMark
            key={s.id}
            index={i}
            station={s}
            selected={props.selected === s.id}
            pal={pal}
            reducedMotion={props.reducedMotion}
            onSelect={props.onSelect}
          />
        ))}
        <Product {...props} pal={pal} />
      </Suspense>
      <CameraRig {...props} />
      {/* the glow (a post-process) on the high level only; the light level renders directly */}
      {quality === "high" && !off.has("fx") && <Effects />}
    </QualityContext>
  );
}

/* ── a station: a low dark plinth on the far side with its label on the front, a glass block with its icon, and a
   ring of light on the floor for its state (dim: waiting, pulsing: working, emerald: done) ── */

function StationMark({
  index,
  station,
  selected,
  pal,
  reducedMotion,
  onSelect,
}: {
  index: number;
  station: SceneStation;
  selected: boolean;
  pal: ScenePalette;
  reducedMotion: boolean;
  onSelect: (id: StationId) => void;
}) {
  const place = useMemo(() => stationPlace(index), [index]);
  const label = useMemo(() => stationLabel(index + 1, station.name, pal), [index, station.name, pal]);
  const icon = useMemo(() => iconTexture(station.icon, pal), [station.icon, pal]);
  const ring = useRef<MeshStandardMaterial>(null);
  const yaw = Math.atan2(place.n.x, place.n.z);
  const color =
    station.status === "active" ? pal.neon : station.status === "done" ? pal.highlight : pal.emerald;
  const base = station.status === "waiting" ? 0.45 : 1.1;
  useFrame(({ clock }) => {
    if (!ring.current) return;
    const pulse = station.status === "active" && !reducedMotion ? 0.5 + 0.5 * Math.sin(clock.elapsedTime * 3) : 1;
    ring.current.emissiveIntensity = (selected ? 2.4 : base) * (0.55 + 0.45 * pulse);
  });
  const edges = useMemo(() => new EdgesGeometry(new BoxGeometry(1.3, 1.1, 0.9)), []);
  const events = {
    onClick: (e: { stopPropagation: () => void }) => {
      e.stopPropagation();
      onSelect(station.id);
    },
    onPointerOver: () => (document.body.style.cursor = "pointer"),
    onPointerOut: () => (document.body.style.cursor = ""),
  };
  // the visual sample (under review): the first station only, in the reference's design
  if (index === 0)
    return (
      <group position={place.pos} rotation-y={yaw} {...events}>
        <SampleStation
          num={index + 1}
          name={station.name}
          status={station.status}
          selected={selected}
          pal={pal}
          reducedMotion={reducedMotion}
        />
      </group>
    );
  return (
    <group position={place.pos} rotation-y={yaw} {...events}>
      {/* plinth */}
      <mesh position-y={0.3}>
        <boxGeometry args={[2.3, 0.6, 1.5]} />
        <meshStandardMaterial color={pal.bg} roughness={0.3} metalness={0.45} />
      </mesh>
      {/* the plinth's lit lower edge */}
      <mesh position={[0, 0.03, 0.76]}>
        <boxGeometry args={[2.3, 0.04, 0.02]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
      {/* label on its front */}
      <mesh position={[0, 0.32, 0.755]}>
        <planeGeometry args={[1.9, 0.5]} />
        <meshBasicMaterial map={label} transparent toneMapped={false} />
      </mesh>
      {/* glass block with the station's icon */}
      <lineSegments geometry={edges} position-y={1.2}>
        <lineBasicMaterial color={color} transparent opacity={selected ? 0.95 : 0.6} toneMapped={false} />
      </lineSegments>
      <mesh position-y={1.2}>
        <boxGeometry args={[1.3, 1.1, 0.9]} />
        <meshStandardMaterial
          color={pal.forest}
          transparent
          opacity={0.16}
          roughness={0.08}
          metalness={0.2}
          emissive={color}
          emissiveIntensity={selected ? 0.35 : 0.14}
          depthWrite={false}
        />
      </mesh>
      <mesh position={[0, 1.2, 0.02]}>
        <planeGeometry args={[0.8, 0.8]} />
        <meshBasicMaterial map={icon} transparent toneMapped={false} depthWrite={false} />
      </mesh>
      {/* state ring on the floor */}
      <mesh rotation-x={-Math.PI / 2} position-y={0.012}>
        <ringGeometry args={[1.55, selected ? 1.7 : 1.62, 72]} />
        <meshStandardMaterial ref={ring} color={pal.bg} emissive={color} emissiveIntensity={1} toneMapped={false} />
      </mesh>
    </group>
  );
}

/* ── the product: one screen on a carrier, moving along the line, built up as the work advances ── */

function productU(stations: number, travel: { to: number; t: number }) {
  if (travel.to < 0) return ENTRY_U;
  const from = travel.to === 0 ? ENTRY_U : stationPlace(travel.to - 1).u;
  const to = stationPlace(travel.to).u;
  const e = travel.t < 0.5 ? 2 * travel.t * travel.t : 1 - (-2 * travel.t + 2) ** 2 / 2;
  return from + (to - from) * e;
}

function Product({
  stations,
  travel,
  build,
  waiting,
  checking,
  delivered,
  model,
  pal,
  reducedMotion,
}: FactorySceneProps & { pal: ScenePalette }) {
  const group = useRef<Group>(null);
  const scan = useRef<Mesh>(null);
  const screen = useMemo(() => productScreenTexture(model, build, pal, 2, waiting), [model, pal]); // eslint-disable-line react-hooks/exhaustive-deps -- redrawn below as `build` and `waiting` change
  const drawn = useRef({ build, waiting });
  useEffect(() => {
    const d = drawn.current;
    if (Math.abs(d.build - build) < 0.01 && d.build !== 0 && d.waiting === waiting) return;
    drawn.current = { build, waiting };
    drawProductScreen(screen.canvas, model, build, pal, waiting);
    screen.texture.needsUpdate = true;
  }, [build, waiting, model, pal, screen]);
  const u = useRef(productU(stations.length, travel));
  const target = productU(stations.length, travel);
  useFrame(({ clock }, dt) => {
    u.current = reducedMotion ? target : u.current + (target - u.current) * (1 - Math.exp(-dt * 4));
    const { pos, n } = productPlace(u.current);
    const g = group.current;
    if (g) {
      g.position.copy(pos);
      g.rotation.y = Math.atan2(n.x, n.z);
    }
    if (scan.current) {
      scan.current.visible = checking;
      scan.current.position.y = 0.75 * Math.sin(clock.elapsedTime * (reducedMotion ? 0 : 1.6));
    }
    window.__tashfeerFactoryProductU = u.current;
  });
  const w = PRODUCT.screen.w;
  return (
    <group ref={group}>
      <ProductCase pal={pal} screen={screen.texture} delivered={delivered}>
        {/* the quality station's scan: a thin light passing over the screen */}
        <mesh ref={scan} position={[0, 0, 0.04]} visible={false}>
          <planeGeometry args={[w + 0.1, 0.02]} />
          <meshBasicMaterial color={lit(pal.highlight, 2.4)} transparent opacity={0.9} />
        </mesh>
      </ProductCase>
      {/* the light on the product: it is the scene's hero */}
      <spotLight
        color={pal.text}
        intensity={26}
        distance={10}
        angle={0.65}
        penumbra={0.85}
        position={[0, 4.6, 3]}
      />
    </group>
  );
}

/* ── the camera ── */

declare global {
  interface Window {
    /** read-only views of the scene, for tests and reviews */
    __tashfeerFactory?: {
      pose: () => { pos: number[]; target: number[] };
      mode: () => string;
      /** whether a station (its plinth and glass block) is inside the camera's view */
      inView: (id: string) => boolean;
      /** whether the product's case is inside the camera's view */
      productInView: () => boolean;
      /** where the product's case is drawn on the canvas (CSS px from its top left; its middle, its left and right) */
      productOnScreen: () => { x: number; y: number; left: number; right: number };
    };
    __tashfeerFactoryProductU?: number;
    /** the rendering level in use */
    __tashfeerFactoryQuality?: string;
  }
}

/** sine in-out: a slow start, a gentle top speed, a slow stop — the camera eases out before it halts */
const ease = (x: number) => -(Math.cos(Math.PI * x) - 1) / 2;

function CameraRig({ camera: store, stations, travel, reducedMotion, tourPaused, covered }: FactorySceneProps) {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const width = useThree((s) => s.size.width);
  const height = useThree((s) => s.size.height);
  // a phone (a tall screen) has its own shots
  const frame: Frame = width / Math.max(1, height) < 1 ? "tall" : "wide";
  const target = useRef(new Vector3());
  const move = useRef<{ from: Pose; start: number; dur: number } | null>(null);
  const lastRequest = useRef(-1);
  const travelRef = useRef(travel);
  travelRef.current = travel;
  const stationsRef = useRef(stations);
  stationsRef.current = stations;

  // the shots are framed in the part of the screen the controls leave free: the view is offset by half of what they
  // cover (the card at the start side on a wide screen, the bars and the card's sheet at the bottom on a phone)
  useEffect(() => {
    const dx = covered.start / 2;
    const dy = (covered.bottom - covered.top) / 2;
    camera.setViewOffset(width, height, dx, dy, width, height);
    camera.updateProjectionMatrix();
    return () => {
      camera.clearViewOffset();
    };
  }, [camera, width, height, covered.start, covered.top, covered.bottom]);

  useEffect(() => {
    const start = introPose(ENTRY_U, frame);
    camera.position.copy(start.pos);
    target.current.copy(start.target);
    camera.lookAt(target.current);
    window.__tashfeerFactory = {
      pose: () => ({ pos: camera.position.toArray(), target: target.current.toArray() }),
      mode: () => store.get().mode,
      inView: (id) => {
        const list = stationsRef.current;
        const i = list.findIndex((x) => x.id === id);
        if (i < 0) return false;
        camera.updateMatrixWorld();
        const f = new Frustum().setFromProjectionMatrix(
          new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
        );
        const at = stationPlace(i).pos;
        return [0.1, 1.6].every((y) => f.containsPoint(at.clone().setY(at.y + y)));
      },
      productInView: () => {
        camera.updateMatrixWorld();
        const f = new Frustum().setFromProjectionMatrix(
          new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
        );
        const u = window.__tashfeerFactoryProductU ?? ENTRY_U;
        const p = productPlace(u).pos;
        return [0.5, 2.2].every((y) => f.containsPoint(p.clone().setY(p.y + y)));
      },
      productOnScreen: () => {
        camera.updateMatrixWorld();
        const { pos: p, t } = productPlace(window.__tashfeerFactoryProductU ?? ENTRY_U);
        const el = document.querySelector("[data-factory-canvas] canvas");
        const w = el?.clientWidth ?? 1;
        const h = el?.clientHeight ?? 1;
        const at = (v: Vector3) => {
          const q = v.clone().project(camera);
          return { x: ((q.x + 1) / 2) * w, y: ((1 - q.y) / 2) * h };
        };
        const mid = at(p.clone().setY(p.y + 1.3));
        const a = at(p.clone().setY(p.y + 1.3).addScaledVector(t, 1.3));
        const b = at(p.clone().setY(p.y + 1.3).addScaledVector(t, -1.3));
        return { x: mid.x, y: mid.y, left: Math.min(a.x, b.x), right: Math.max(a.x, b.x) };
      },
    };
    return () => {
      delete window.__tashfeerFactory;
    };
    // placed once, at the opening shot's start
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera, store]);

  /** where the product is, for the tour: with reduced motion, only where it stops (no continuous tracking) */
  const productAt = () => {
    const t = travelRef.current;
    if (reducedMotion) return t.to < 0 ? ENTRY_U : stationPlace(t.to).u;
    return window.__tashfeerFactoryProductU ?? productU(stationsRef.current.length, t);
  };
  // the free part of the screen, as half-angles: each shot is pulled back (along its own line) until its subject fits
  const tanHalf = Math.tan((camera.fov * Math.PI) / 360);
  const freeW = Math.max(1, width - covered.start) / Math.max(1, width);
  const freeH = Math.max(1, height - covered.top - covered.bottom) / Math.max(1, height);
  const tanX = tanHalf * (width / Math.max(1, height)) * freeW;
  const tanY = tanHalf * freeH;
  const desired = (): Pose => {
    const s = store.get();
    if (s.mode === "station" && s.station) {
      const i = stationsRef.current.findIndex((x) => x.id === s.station);
      if (i >= 0) return fitPose(stationPose(i, frame), STATION_HALF, tanX, tanY);
    }
    return fitPose(followPose(productAt(), frame), FOLLOW_HALF, tanX, tanY);
  };

  useFrame(({ clock }, dt) => {
    const s = store.get();
    const still = reducedMotion || tourPaused;
    if (s.request !== lastRequest.current) {
      lastRequest.current = s.request;
      const from = { pos: camera.position.clone(), target: target.current.clone() };
      const dist = from.pos.distanceTo(desired().pos);
      // the opening: hold on the wide shot a moment, then a slow approach; other shots: calm, by distance
      const intro = s.mode === "intro";
      const dur = still || dist < 0.05 ? 0 : intro ? 4.2 : Math.min(2.8, Math.max(1.6, dist / 6));
      move.current = { from, start: clock.elapsedTime + (intro && !still ? 1.2 : 0), dur };
    }
    const to = desired();
    const m = move.current;
    if (m) {
      const k = m.dur === 0 ? 1 : Math.max(0, Math.min(1, (clock.elapsedTime - m.start) / m.dur));
      const e = ease(k);
      // a gentle rise over the middle of the move (never sideways into the line or the stations)
      const lift = new Vector3(0, m.from.pos.distanceTo(to.pos) * 0.08 * Math.sin(Math.PI * e), 0);
      camera.position.copy(m.from.pos.clone().lerp(to.pos, e).add(lift));
      target.current.copy(m.from.target.clone().lerp(to.target, e));
      if (k >= 1) {
        move.current = null;
        if (s.mode === "intro") store.go("follow");
        else store.settle();
      }
    } else if (s.mode === "follow" && !tourPaused) {
      // the tour: with the product while it travels (smoothly), still while it is worked on (it does not move then)
      const f = reducedMotion ? 1 : 1 - Math.exp(-dt * 2);
      camera.position.lerp(to.pos, f);
      target.current.lerp(to.target, f);
    }
    camera.lookAt(target.current);
  });
  return null;
}
