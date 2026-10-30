"use client";
/* eslint-disable react-hooks/immutability, react-hooks/refs -- three.js objects (camera, meshes, materials) are
   changed every frame inside useFrame, outside React's rendering: that is how React Three Fiber animates */

/**
 * The factory in 3D (React Three Fiber): one continuous scene — a smooth black production line that bends across a very
 * dark floor, lit from below its edges; the stations beside it; the visitor's one product travelling on it, its screen
 * showing the approved model as it is built; Tashfeer at the start of the line.
 *
 * Built geometry: the reflective floor, the belt and its neon, the stations, the product in its glass case, the sign.
 * The first station and the product follow the visual sample under review (scene/Showcase.tsx); the other stations keep
 * the earlier design until the sample is approved.
 * Temporary asset: Tashfeer is his approved 2D image on a plane that turns to face the camera — there is no 3D model of
 * him yet (no rigged GLB in the project or the reference package), so none is invented.
 *
 * The camera follows the camera store (camera-store.ts): eased moves along a gentle arc between poses, the tracking
 * shot beside the product, and OrbitControls for the visitor's own looking, zooming and moving, inside the factory.
 */
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  BoxGeometry,
  EdgesGeometry,
  Frustum,
  Matrix4,
  type Group,
  type Mesh,
  type MeshStandardMaterial,
  SRGBColorSpace,
  type Texture,
  TextureLoader,
  Vector3,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { IconName } from "@/components/icons/Icon";
import type { StationId, StationStatus } from "@/domain/factory";
import type { ModelId } from "@/lib/project-store";
import type { CameraStore } from "./camera-store";
import {
  BOUNDS,
  ENTRY_U,
  type Pose,
  clampTarget,
  followPose,
  frameAt,
  introStartPose,
  overviewPose,
  productPlace,
  samplePose,
  SAMPLE,
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
  tashfeerSrc: string;
};

export default function FactoryScene(props: FactorySceneProps) {
  return (
    <Canvas
      dpr={[1, 1.5]}
      camera={{ fov: SAMPLE.fov, near: 0.1, far: 140, position: introStartPose().pos.toArray() }}
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
      <Tashfeer src={props.tashfeerSrc} />
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

/* ── Tashfeer: his approved image, standing at the start of the line (temporary: no 3D model of him exists yet) ── */

function Tashfeer({ src }: { src: string }) {
  const mesh = useRef<Mesh>(null);
  const tex = useMemo(() => {
    const t: Texture = new TextureLoader().load(src);
    t.colorSpace = SRGBColorSpace;
    return t;
  }, [src]);
  const place = useMemo(() => {
    // behind the product, on the far side of the line, presenting it (as in the reference)
    const { p, n, t } = frameAt(ENTRY_U);
    // behind the product, beyond the belt's far edge, between the product and the first station (as in the reference)
    return p.clone().addScaledVector(n, -3.9).addScaledVector(t, 1.9);
  }, []);
  // his size in the reference: he towers over the product, about two and a half times its case's height
  const h = 6.4;
  useFrame(({ camera }) => {
    const m = mesh.current;
    if (!m) return;
    // turn about the vertical axis only, to face the camera
    m.rotation.y = Math.atan2(camera.position.x - place.x, camera.position.z - place.z);
  });
  return (
    <mesh ref={mesh} position={[place.x, h / 2, place.z]}>
      <planeGeometry args={[(h * 346) / 900, h]} />
      <meshBasicMaterial map={tex} transparent alphaTest={0.02} toneMapped={false} />
    </mesh>
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
    };
    __tashfeerFactoryProductU?: number;
    /** the rendering level in use */
    __tashfeerFactoryQuality?: string;
  }
}

/** sine in-out: a slow start, a gentle top speed, a slow stop — the camera eases out before it halts */
const ease = (x: number) => -(Math.cos(Math.PI * x) - 1) / 2;

function CameraRig({ camera: store, stations, travel, reducedMotion }: FactorySceneProps) {
  const camera = useThree((s) => s.camera);
  const width = useThree((s) => s.size.width);
  const height = useThree((s) => s.size.height);
  const panelShift = width >= 720 ? 1.8 : 0;
  // a tall screen (a phone) sees less across: every pose steps back, in proportion, so the product and the stations
  // stay whole in the frame
  const aspect = width / Math.max(1, height);
  const fit = aspect >= 1.2 ? 1 : Math.min(2.4, 1.2 / aspect);
  // on a phone the panel is a sheet over the lower half
  const panelBelow = width < 720 ? 1.4 * fit : 0;
  const gl = useThree((s) => s.gl);
  const controls = useMemo(() => new OrbitControls(camera, gl.domElement), [camera, gl]);
  const move = useRef<{ from: Pose; start: number; dur: number; request: number } | null>(null);
  const lastRequest = useRef(-1);
  const travelRef = useRef(travel);
  travelRef.current = travel;
  const stationsRef = useRef(stations);
  stationsRef.current = stations;

  useEffect(() => {
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.minDistance = BOUNDS.minDistance;
    controls.maxDistance = BOUNDS.maxDistance;
    controls.maxPolarAngle = 1.42;
    controls.screenSpacePanning = false;
    controls.zoomToCursor = true;
    const start = introStartPose();
    camera.position.copy(start.pos);
    controls.target.copy(start.target);
    controls.update();
    // the visitor's hand on the camera ends any automatic move
    const take = () => store.release();
    controls.addEventListener("start", take);
    window.__tashfeerFactory = {
      pose: () => ({ pos: camera.position.toArray(), target: controls.target.toArray() }),
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
    };
    return () => {
      controls.removeEventListener("start", take);
      controls.dispose();
      delete window.__tashfeerFactory;
    };
  }, [controls, camera, store]);

  useEffect(() => {
    // the visitor's own camera may step back as far as the automatic poses do: no jump when they take it
    controls.maxDistance = BOUNDS.maxDistance * fit;
  }, [controls, fit]);
  const fitted = (p: Pose): Pose =>
    fit === 1 ? p : { pos: p.target.clone().add(p.pos.clone().sub(p.target).multiplyScalar(fit)), target: p.target };
  const desired = (): Pose => fitted(rawDesired());
  const rawDesired = (): Pose => {
    const s = store.get();
    const count = stations.length;
    if (s.mode === "station" && s.station) {
      const i = stations.findIndex((x) => x.id === s.station);
      // on a wide screen the panel covers the right part: the station is framed left of the middle
      if (i >= 0) return stationPose(i, count, panelShift, panelBelow);
    }
    if (s.mode === "overview") return overviewPose();
    if (s.mode === "sample") return samplePose();
    return followPose(window.__tashfeerFactoryProductU ?? productU(count, travelRef.current));
  };

  useFrame(({ clock }, dt) => {
    const s = store.get();
    if (s.mode === "free") {
      move.current = null;
      controls.update();
      clampTarget(controls.target);
      if (camera.position.y < 0.6) camera.position.y = 0.6;
      return;
    }
    if (s.request !== lastRequest.current || (s.mode === "intro" && !move.current && !s.settled)) {
      lastRequest.current = s.request;
      const from = { pos: camera.position.clone(), target: controls.target.clone() };
      const to = desired();
      const dist = from.pos.distanceTo(to.pos);
      const dur = reducedMotion ? 0 : s.mode === "intro" ? 5.5 : Math.min(3, Math.max(1.6, dist / 7));
      move.current = { from, start: clock.elapsedTime, dur, request: s.request };
    }
    const to = desired();
    const m = move.current;
    if (m) {
      const k = m.dur === 0 ? 1 : Math.min(1, (clock.elapsedTime - m.start) / m.dur);
      const e = ease(k);
      // a gentle arc: up and a little to the side of the straight path, most at the middle of the move
      const mid = m.from.pos.clone().lerp(to.pos, 0.5);
      const d = to.pos.clone().sub(m.from.pos);
      const side = new Vector3(-d.z, 0, d.x).normalize().multiplyScalar(d.length() * 0.12);
      mid.add(side).add(new Vector3(0, d.length() * 0.1, 0));
      const a = m.from.pos.clone().lerp(mid, e);
      const b = mid.clone().lerp(to.pos, e);
      camera.position.copy(a.lerp(b, e));
      controls.target.copy(m.from.target.clone().lerp(to.target, e));
      if (k >= 1) {
        move.current = null;
        if (s.mode === "intro") store.go("follow");
        store.settle();
      }
    } else if (s.mode === "follow") {
      // the tracking shot: stay beside the product as it moves, smoothly
      const f = reducedMotion ? 1 : 1 - Math.exp(-dt * 2.5);
      camera.position.lerp(to.pos, f);
      controls.target.lerp(to.target, f);
    }
    camera.lookAt(controls.target);
  });
  return null;
}
