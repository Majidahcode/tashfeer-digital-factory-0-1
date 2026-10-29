"use client";
/* eslint-disable react-hooks/immutability, react-hooks/refs -- three.js objects (camera, meshes, materials) are
   changed every frame inside useFrame, outside React's rendering: that is how React Three Fiber animates */

/**
 * The factory in 3D (React Three Fiber): one continuous scene — a smooth black production line that bends across a very
 * dark floor, lit from below its edges; the stations beside it; the visitor's one product travelling on it, its screen
 * showing the approved model as it is built; Tashfeer at the start of the line.
 *
 * Built geometry: the floor, the line, its underglow, the stations, the product, the sign.
 * Temporary asset: Tashfeer is his approved 2D image on a plane that turns to face the camera — there is no 3D model of
 * him yet (no rigged GLB in the project or the reference package), so none is invented.
 *
 * The camera follows the camera store (camera-store.ts): eased moves along a gentle arc between poses, the tracking
 * shot beside the product, and OrbitControls for the visitor's own looking, zooming and moving, inside the factory.
 */
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
  AdditiveBlending,
  BoxGeometry,
  EdgesGeometry,
  Frustum,
  Matrix4,
  DoubleSide,
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
  TRACK,
  clampTarget,
  followPose,
  frameAt,
  introStartPose,
  overviewPose,
  stationPlace,
  stationPose,
  stripGeometry,
  trackGeometry,
} from "./scene/layout";
import { type ScenePalette, readPalette } from "./scene/palette";
import {
  SCREEN,
  drawProductScreen,
  glowTexture,
  iconTexture,
  productScreenTexture,
  signTexture,
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
      camera={{ fov: 42, near: 0.1, far: 120, position: introStartPose().pos.toArray() }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      data-factory-canvas=""
    >
      <World {...props} />
    </Canvas>
  );
}

function World(props: FactorySceneProps) {
  const pal = useMemo(() => readPalette(), []);
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    scene.background = pal.bg.clone();
    scene.fog = null;
  }, [scene, pal]);
  return (
    <>
      <fog attach="fog" args={[pal.bg, 16, 46]} />
      <ambientLight color={pal.text} intensity={0.22} />
      <hemisphereLight args={[pal.text, pal.bg, 0.35]} />
      <directionalLight color={pal.text} intensity={0.55} position={[-6, 12, 10]} />
      <Floor pal={pal} />
      <Line pal={pal} />
      <Backdrop pal={pal} />
      {props.stations.map((s, i) => (
        <StationMark
          key={s.id}
          index={i}
          count={props.stations.length}
          station={s}
          selected={props.selected === s.id}
          pal={pal}
          reducedMotion={props.reducedMotion}
          onSelect={props.onSelect}
        />
      ))}
      <Product {...props} pal={pal} />
      <Tashfeer src={props.tashfeerSrc} />
      <CameraRig {...props} />
    </>
  );
}

/* ── the floor and the far background: dark, calm ── */

function Floor({ pal }: { pal: ScenePalette }) {
  return (
    <mesh rotation-x={-Math.PI / 2} position-y={-0.001} receiveShadow>
      <planeGeometry args={[90, 90]} />
      <meshStandardMaterial color={pal.glassBase} roughness={0.55} metalness={0.25} />
    </mesh>
  );
}

function Backdrop({ pal }: { pal: ScenePalette }) {
  const sign = useMemo(() => signTexture(pal), [pal]);
  return (
    <group>
      {/* the name, far behind the line, like a lit sign on the factory's back wall */}
      <mesh position={[12, 4.6, -26]} rotation-y={-0.3}>
        <planeGeometry args={[7, 2.05]} />
        <meshBasicMaterial map={sign} transparent opacity={0.45} toneMapped={false} fog={false} />
      </mesh>
    </group>
  );
}

/* ── the production line: smooth black, lit from under its edges ── */

function Line({ pal }: { pal: ScenePalette }) {
  const track = useMemo(() => trackGeometry(), []);
  const edgeNear = useMemo(() => stripGeometry(TRACK.width / 2 + 0.02, 0.05, 0.03), []);
  const edgeFar = useMemo(() => stripGeometry(-TRACK.width / 2 - 0.02, 0.05, 0.03), []);
  const glowNear = useMemo(() => stripGeometry(TRACK.width / 2 + 0.25, 1.1, 0.006), []);
  const glowFar = useMemo(() => stripGeometry(-TRACK.width / 2 - 0.25, 1.1, 0.006), []);
  const glow = useMemo(() => glowTexture(pal), [pal]);
  return (
    <group>
      <mesh geometry={track}>
        <meshStandardMaterial color={pal.bg} roughness={0.22} metalness={0.35} side={DoubleSide} />
      </mesh>
      {[edgeNear, edgeFar].map((g, i) => (
        <mesh key={i} geometry={g}>
          <meshBasicMaterial color={pal.neon} toneMapped={false} side={DoubleSide} />
        </mesh>
      ))}
      {[glowNear, glowFar].map((g, i) => (
        <mesh key={i} geometry={g}>
          <meshBasicMaterial
            map={glow}
            transparent
            opacity={0.7}
            side={DoubleSide}
            blending={AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  );
}

/* ── a station: a low dark plinth on the far side with its label on the front, a glass block with its icon, and a
   ring of light on the floor for its state (dim: waiting, pulsing: working, emerald: done) ── */

function StationMark({
  index,
  count,
  station,
  selected,
  pal,
  reducedMotion,
  onSelect,
}: {
  index: number;
  count: number;
  station: SceneStation;
  selected: boolean;
  pal: ScenePalette;
  reducedMotion: boolean;
  onSelect: (id: StationId) => void;
}) {
  const place = useMemo(() => stationPlace(index, count), [index, count]);
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
  return (
    <group
      position={place.pos}
      rotation-y={yaw}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(station.id);
      }}
      onPointerOver={() => (document.body.style.cursor = "pointer")}
      onPointerOut={() => (document.body.style.cursor = "")}
    >
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
      {selected && <pointLight color={pal.neon} intensity={8} distance={5} position={[0, 2.6, 1.2]} />}
    </group>
  );
}

/* ── the product: one screen on a carrier, moving along the line, built up as the work advances ── */

function productU(stations: number, travel: { to: number; t: number }) {
  if (travel.to < 0) return ENTRY_U;
  const from = travel.to === 0 ? ENTRY_U : stationPlace(travel.to - 1, stations).u;
  const to = stationPlace(travel.to, stations).u;
  const e = travel.t < 0.5 ? 2 * travel.t * travel.t : 1 - (-2 * travel.t + 2) ** 2 / 2;
  return from + (to - from) * e;
}

function Product({
  stations,
  travel,
  build,
  checking,
  delivered,
  model,
  pal,
  reducedMotion,
}: FactorySceneProps & { pal: ScenePalette }) {
  const group = useRef<Group>(null);
  const scan = useRef<Mesh>(null);
  const screen = useMemo(() => productScreenTexture(model, build, pal), [model, pal]); // eslint-disable-line react-hooks/exhaustive-deps -- redrawn below as `build` changes
  const drawn = useRef(build);
  useEffect(() => {
    if (Math.abs(drawn.current - build) < 0.01 && drawn.current !== 0) return;
    drawn.current = build;
    drawProductScreen(screen.canvas, model, build, pal);
    screen.texture.needsUpdate = true;
  }, [build, model, pal, screen]);
  const u = useRef(productU(stations.length, travel));
  const target = productU(stations.length, travel);
  useFrame(({ clock }, dt) => {
    u.current = reducedMotion ? target : u.current + (target - u.current) * (1 - Math.exp(-dt * 4));
    const { p, n } = frameAt(u.current);
    const g = group.current;
    if (g) {
      g.position.set(p.x, TRACK.top, p.z);
      g.rotation.y = Math.atan2(n.x, n.z);
    }
    if (scan.current) {
      scan.current.visible = checking;
      scan.current.position.y = 0.45 + 1.1 * (0.5 + 0.5 * Math.sin(clock.elapsedTime * (reducedMotion ? 0 : 1.6)));
    }
    window.__tashfeerFactoryProductU = u.current;
  });
  const w = 1.8;
  const h = (w * SCREEN.h) / SCREEN.w;
  return (
    <group ref={group}>
      {/* carrier */}
      <mesh position-y={0.06}>
        <boxGeometry args={[1.5, 0.12, 1]} />
        <meshStandardMaterial color={pal.bg} roughness={0.3} metalness={0.6} />
      </mesh>
      <mesh position={[0, 0.125, 0.51]}>
        <boxGeometry args={[1.4, 0.02, 0.01]} />
        <meshBasicMaterial color={pal.neon} toneMapped={false} />
      </mesh>
      {/* stand */}
      <mesh position={[0, 0.3, -0.1]}>
        <boxGeometry args={[0.14, 0.4, 0.08]} />
        <meshStandardMaterial color={pal.bg} roughness={0.3} metalness={0.6} />
      </mesh>
      {/* the screen, tilted back a little, facing the camera side */}
      <group position={[0, 0.48 + h / 2, -0.05]} rotation-x={-0.08}>
        <mesh>
          <boxGeometry args={[w + 0.08, h + 0.08, 0.06]} />
          <meshStandardMaterial
            color={pal.bg}
            roughness={0.25}
            metalness={0.5}
            emissive={delivered ? pal.highlight : pal.neon}
            emissiveIntensity={delivered ? 0.35 : 0.08}
          />
        </mesh>
        <mesh position-z={0.032}>
          <planeGeometry args={[w, h]} />
          <meshBasicMaterial map={screen.texture} toneMapped={false} />
        </mesh>
      </group>
      {/* the quality station's scan: a thin light passing over the screen */}
      <mesh ref={scan} position={[0, 1, 0.06]} visible={false}>
        <planeGeometry args={[w + 0.2, 0.025]} />
        <meshBasicMaterial color={pal.highlight} toneMapped={false} transparent opacity={0.9} />
      </mesh>
      {/* the light on the product: it is the scene's hero */}
      <spotLight
        color={pal.text}
        intensity={22}
        distance={9}
        angle={0.6}
        penumbra={0.8}
        position={[0, 4, 2.5]}
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
    const { p, n } = frameAt(0.115);
    return p.clone().addScaledVector(n, 2.1);
  }, []);
  const h = 2.6;
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
        const at = stationPlace(i, list.length).pos;
        return [0.1, 1.2].every((y) => f.containsPoint(at.clone().setY(y)));
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
