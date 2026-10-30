"use client";
/* eslint-disable react-hooks/immutability -- three.js objects are set up once in memos */

/**
 * Station 01 alone, for review against the reference image: the Blender model (blender/station01) on a dark reflective
 * floor, in soft neutral light with the reference's neon touches. Nothing of the factory's simulation or camera.
 *
 * The glass can be shown three ways (the review that found what blurred the work: the glow, not the glass):
 *   clear         a faint body, the environment's reflections and lit edges drawn over the scene: what is inside is
 *                 drawn as it is (sharp)
 *   transmission  the physical glass of the GLB (transmission 1): three.js draws the opaque scene to a texture and
 *                 the glass samples it — resampled, so softened, and only opaque things show through
 *   none          no glass: the reference for sharpness
 */
import { Canvas, useLoader, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useMemo } from "react";
import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  Mesh,
  PlaneGeometry,
  SRGBColorSpace,
  MeshBasicMaterial,
  type MeshPhysicalMaterial,
  MeshStandardMaterial,
  type Object3D,
  Vector3,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { type ScenePalette, readPalette } from "../scene/palette";
import { Reflector } from "three/examples/jsm/objects/Reflector.js";
import { Badge, Effects, Environment, Tag, lit, rimMaterial } from "../scene/Showcase";
import { listPanelTexture, numberTexture } from "../scene/textures";

export type ReviewView = "reference" | "side";
export type GlassMode = "clear" | "transmission" | "none";

export const STATION01_MODEL = process.env.NEXT_PUBLIC_STATION01_MODEL || "/models/factory/station01.glb";

/** the model's sizes (blender/station01/build.py), metres */
const SIZE = { base: { w: 2.75, d: 1.45, h: 0.62 }, glass: { w: 2.0, h: 1.42, d: 0.7 } };

/** where the camera stands for each view (the station's front faces +z) */
const VIEWS: Record<ReviewView, { pos: Vector3; target: Vector3 }> = {
  // as the reference sees station 01: a little to its left, a little above the glass's top
  reference: { pos: new Vector3(-2.5, 2.0, 5.6), target: new Vector3(0, 1.1, 0) },
  // from its right side, level with the glass: its depth, the walls' thickness, the work standing inside
  side: { pos: new Vector3(6.2, 1.5, 0.35), target: new Vector3(0, 1.12, 0) },
};

export default function StationReviewScene({
  view,
  glass,
  glow,
  onReady,
}: {
  view: ReviewView;
  glass: GlassMode;
  /** the bloom pass (a review aid: off shows what the glow adds) */
  glow: boolean;
  onReady: () => void;
}) {
  return (
    <Canvas
      dpr={[1, 2]}
      camera={{ fov: 32, near: 0.1, far: 120, position: VIEWS[view].pos.toArray() }}
      gl={{ antialias: true, toneMappingExposure: 1.0 }}
      data-review-canvas=""
    >
      <Stage view={view} glass={glass} glow={glow} onReady={onReady} />
    </Canvas>
  );
}

function Stage({ view, glass, glow, onReady }: { view: ReviewView; glass: GlassMode; glow: boolean; onReady: () => void }) {
  const pal = useMemo(() => readPalette(), []);
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    scene.background = pal.bg.clone();
  }, [scene, pal]);
  const white = useMemo(() => new Color(1, 1, 1), []);
  return (
    <>
      <Environment pal={pal} />
      {/* soft neutral light: a key from the front left, a fill from the right, a rim from behind for the glass's edges */}
      <hemisphereLight args={[white, pal.bg, 0.25]} />
      <directionalLight color={white} intensity={1.0} position={[-4, 6, 5]} />
      <directionalLight color={white} intensity={0.35} position={[5, 3, 4]} />
      <directionalLight color={white} intensity={0.9} position={[1.5, 4, -6]} />
      <StageFloor pal={pal} />
      <Backdrop pal={pal} />
      <Suspense fallback={null}>
        <Station pal={pal} glass={glass} onReady={onReady} />
      </Suspense>
      <Controls view={view} />
      {glow && <Effects />}
    </>
  );
}

/**
 * Behind the station, a calm dark wall with a faint emerald light in its middle — as the reference's room behind its
 * cases. It is opaque, so the physical glass really shows it (the glass is not tinted to fake it).
 */
function Backdrop({ pal }: { pal: ScenePalette }) {
  const tex = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const ctx = c.getContext("2d")!;
    const g = ctx.createRadialGradient(128, 150, 10, 128, 150, 150);
    g.addColorStop(0, pal.css.forest);
    g.addColorStop(1, pal.css.bg);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
    const t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    return t;
  }, [pal]);
  return (
    <mesh position={[0, 3, -7]}>
      <planeGeometry args={[26, 10]} />
      <meshBasicMaterial map={tex} color={new Color(1, 1, 1).multiplyScalar(0.55)} />
    </mesh>
  );
}

/** the stage's floor: black and glossy, a soft real reflection of the station under a dark film (no tiles, no grid) */
function StageFloor({ pal }: { pal: ScenePalette }) {
  const size = useThree((s) => s.size);
  const mirror = useMemo(() => {
    const r = new Reflector(new PlaneGeometry(40, 40), {
      textureWidth: Math.round(size.width * 0.5),
      textureHeight: Math.round(size.height * 0.5),
      color: pal.text.clone().multiplyScalar(0.35),
      clipBias: 0.003,
    });
    r.rotation.x = -Math.PI / 2;
    r.position.y = -0.002;
    return r;
  }, [pal]); // eslint-disable-line react-hooks/exhaustive-deps -- its resolution is set once
  useEffect(() => () => mirror.dispose(), [mirror]);
  return (
    <group>
      <primitive object={mirror} />
      <mesh rotation-x={-Math.PI / 2} position-y={0.001}>
        <planeGeometry args={[40, 40]} />
        <meshStandardMaterial color={pal.bg} transparent opacity={0.84} roughness={0.85} metalness={0} envMapIntensity={0.05} depthWrite={false} />
      </mesh>
    </group>
  );
}

function Controls({ view }: { view: ReviewView }) {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const controls = useMemo(() => new OrbitControls(camera, gl.domElement), [camera, gl]);
  useEffect(() => {
    controls.enableDamping = false;
    controls.minDistance = 2;
    controls.maxDistance = 14;
    controls.maxPolarAngle = 1.5;
    return () => controls.dispose();
  }, [controls]);
  useEffect(() => {
    const v = VIEWS[view];
    camera.position.copy(v.pos);
    controls.target.copy(v.target);
    controls.update();
    window.__stationReview = { pose: () => ({ pos: camera.position.toArray(), target: controls.target.toArray() }) };
  }, [view, camera, controls]);
  return null;
}

declare global {
  interface Window {
    __stationReview?: { pose: () => { pos: number[]; target: number[] } };
  }
}

function Station({ pal, glass, onReady }: { pal: ScenePalette; glass: GlassMode; onReady: () => void }) {
  const gltf = useLoader(GLTFLoader, STATION01_MODEL);
  const panels = useMemo(() => [listPanelTexture(pal, 6, 0), listPanelTexture(pal, 6, 1)], [pal]);
  const model = useMemo(() => {
    const root = gltf.scene.getObjectByName("Station01")!.clone(true);
    root.position.set(0, 0, 0);
    root.rotation.set(0, 0, 0);
    const neon = new MeshBasicMaterial({ color: lit(pal.neon, 2.4) });
    // the work stays below the glow's threshold (1.1): measured, the glow is what blurred it (sharpness 40 with it,
    // 1053 without); the glow is kept for the neon of the base only, as in the reference
    const work = new MeshBasicMaterial({ color: lit(pal.neon, 1.0) });
    const edgeColour = pal.text.clone().lerp(pal.neon, 0.45).multiplyScalar(1.5);
    root.traverse((o: Object3D) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      switch (mesh.name) {
        case "Neon":
        case "Dash":
          mesh.material = neon;
          break;
        case "Work":
          mesh.material = work;
          break;
        case "PanelL":
        case "PanelR":
          mesh.material = new MeshBasicMaterial({
            map: panels[mesh.name === "PanelL" ? 0 : 1],
            color: lit(pal.text, 1.25),
            // through transmissive glass only opaque things show: cut out instead of blended there
            ...(glass === "transmission" ? { alphaTest: 0.25 } : { transparent: true, depthWrite: false }),
          });
          mesh.renderOrder = 1;
          // the panel's texture was drawn for a canvas (top-down); glTF UVs run top-down too
          (mesh.material as MeshBasicMaterial).map!.flipY = false;
          break;
        case "GlassOuter":
        case "GlassInner":
          dressGlass(mesh, glass, mesh.name === "GlassOuter", edgeColour);
          break;
        default: {
          const m = (mesh.material as MeshPhysicalMaterial).clone();
          m.envMapIntensity = 0.45;
          mesh.material = m;
        }
      }
    });
    return root;
  }, [gltf, pal, glass, panels]);
  useEffect(() => onReady(), [model, onReady]);
  const { base, glass: g } = SIZE;
  const num = useMemo(() => numberTexture(1, pal), [pal]);
  return (
    <group>
      <primitive object={model} />
      {/* its number on the base's front, right of the dash */}
      <mesh position={[0.2, base.h * 0.5, base.d / 2 + 0.004]}>
        <planeGeometry args={[0.6, 0.21]} />
        <meshBasicMaterial map={num} transparent color={lit(pal.neon, 1.5)} />
      </mesh>
      {/* the badge on the glass's top right corner; the name tag above, to the left */}
      <group position={[g.w / 2 - 0.14, base.h + g.h - 0.02, g.d / 2 + 0.03]}>
        <Badge pal={pal} />
      </group>
      <group position={[-0.32, base.h + g.h + 0.34, 0.1]}>
        <Tag text="تجهيز المشروع" pal={pal} width={1.3} />
      </group>
    </group>
  );
}

/**
 * The glass, by mode. "clear": a faint body (a few per cent) with its reflections added on top and, on the outer
 * shell, the light along its rounded edges — nothing behind it is resampled. "transmission": the GLB's physical glass.
 */
function dressGlass(mesh: Mesh, mode: GlassMode, outer: boolean, edge: Color) {
  if (mode === "none") {
    mesh.visible = false;
    return;
  }
  const src = mesh.material as MeshPhysicalMaterial;
  if (mode === "transmission") {
    const m = src.clone();
    m.envMapIntensity = 1;
    m.thickness = 0;
    mesh.material = m;
  } else {
    const body = src.clone();
    body.transmission = 0;
    body.transparent = true;
    body.opacity = outer ? 0.035 : 0.02;
    body.depthWrite = false;
    body.roughness = 0.05;
    mesh.material = body;
    // the reflections: the environment (soft panels, neon strips) mirrored by the glass, added on top
    const reflect = new MeshStandardMaterial({
      color: new Color(1, 1, 1),
      metalness: 1,
      roughness: 0.06,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
      envMapIntensity: outer ? 0.06 : 0,
    });
    const r = new Mesh(mesh.geometry, reflect);
    r.renderOrder = 3;
    mesh.add(r);
  }
  mesh.renderOrder = 2;
  if (outer) {
    // the rounded edges catch the light: bright where the surface turns away from the eye
    // narrow: on the thin bevels it draws the edges as lines; the faces seen at a slant stay clear
    const e = new Mesh(mesh.geometry, rimMaterial(edge, 4.0, 1.6));
    e.renderOrder = 4;
    mesh.add(e);
  }
}
