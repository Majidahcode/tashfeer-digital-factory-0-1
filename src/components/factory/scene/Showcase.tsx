"use client";
/* eslint-disable react-hooks/immutability -- three.js objects are changed every frame inside useFrame */

/**
 * The factory's look, rebuilt after the owner's reference image (2026-10-30), element by element — real geometry and
 * materials, not pictures:
 *   Environment     what glossy surfaces reflect: a dark space with neon strips, soft overhead light, warm lamps
 *   Effects         the renderer's output: a glow (bloom) that only the neon is bright enough to reach
 *   ReflectiveFloor polished dark floor tiles that really reflect the scene, softly (a low-resolution mirror under a film)
 *   Belt            the production platform (Blender model): 4.6 m wide, a perforated steel plate, rounded black rims,
 *                   a neon line along its outer faces; its light on the floor (code)
 *   Architecture    the calm background: a large curved gallery with a neon band, pillars with light strips, lamps
 *   SampleStation   station 01 in the reference's design: base, neon round its top and hollow glass case from the
 *                   Blender model; the work in its case (a lit block structure, side panels) in code
 *   ProductCase     the client's one product: base, neon, the largest glass case and the screen device (Blender
 *                   model); the approved page on the screen (drawn by the site)
 *
 * The Blender models: blender/factory-sample/build.py → public/models/factory/sample.glb.
 *
 * Only the first station uses SampleStation for now; the others keep the earlier design until the sample is approved.
 */
import { useFrame, useLoader, useThree } from "@react-three/fiber";
import { type ComponentProps, createContext, useContext, useEffect, useMemo, useRef } from "react";
import {
  AdditiveBlending,
  BoxGeometry,
  Color,
  DoubleSide,
  EdgesGeometry,
  type Group,
  Mesh,
  MeshBasicMaterial,
  type MeshPhysicalMaterial,
  MeshStandardMaterial,
  type Object3D,
  PMREMGenerator,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  TorusGeometry,
  Vector2,
} from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { Reflector } from "three/examples/jsm/objects/Reflector.js";
import type { StationStatus } from "@/domain/factory";
import { TRACK, ribbonGeometry } from "./layout";
import type { ScenePalette } from "./palette";
import {
  fadeTexture,
  numberTexture,
  plusTexture,
  rowsTexture,
  setupPanelTexture,
  tagTexture,
  tileTexture,
} from "./textures";

/** the product's screen: a touch above 1 so it reads as lit, below the glow's threshold so it stays crisp */
const SCREEN_LIGHT = new Color(1, 1, 1).multiplyScalar(1.06);

/**
 * Rendering quality. "high": the real (soft) floor reflection, transmissive glass, the glow, the reflections'
 * environment and the belt's relief; "low": a glossy floor without the mirror, transparent glass without transmission,
 * standard materials, no glow pass, no environment, a flat belt — for devices that cannot keep up (a software
 * renderer, or a measured frame rate under 24 fps; or forced with ?quality=high|low).
 */
export type Quality = "high" | "low";

/** The level in use, for every surface of the scene (provided by the scene's root). */
export const QualityContext = createContext<Quality>("high");

type PhysicalProps = ComponentProps<"meshPhysicalMaterial">;
/**
 * A glossy surface: the physical material (clearcoat, transmission) on the high level; on the light level the standard
 * material with the same colour, roughness and metalness — far cheaper per pixel.
 */
function Gloss({
  clearcoat: _clearcoat,
  clearcoatRoughness: _clearcoatRoughness,
  transmission: _transmission,
  thickness: _thickness,
  ior: _ior,
  attenuationColor: _attenuationColor,
  attenuationDistance: _attenuationDistance,
  specularIntensity: _specularIntensity,
  ...rest
}: PhysicalProps) {
  const quality = useContext(QualityContext);
  if (quality === "high")
    return (
      <meshPhysicalMaterial
        {...rest}
        clearcoat={_clearcoat}
        clearcoatRoughness={_clearcoatRoughness}
        transmission={_transmission}
        thickness={_thickness}
        ior={_ior}
        attenuationColor={_attenuationColor}
        attenuationDistance={_attenuationDistance}
        specularIntensity={_specularIntensity}
      />
    );
  return <meshStandardMaterial {...(rest as ComponentProps<"meshStandardMaterial">)} />;
}

/** A colour pushed above 1 (HDR): bright enough for the glow to pick it up. Ordinary surfaces stay below. */
export const lit = (c: Color, k = 3) => c.clone().multiplyScalar(k);

/* ── the renderer's output ── */

export function Effects({ strength = 0.32 }: { strength?: number }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const composer = useMemo(() => {
    const c = new EffectComposer(gl);
    c.addPass(new RenderPass(scene, camera));
    // threshold above 1: only the HDR neon glows; the product's screen and the labels (≤ 1) stay crisp
    c.addPass(new UnrealBloomPass(new Vector2(256, 256), strength, 0.2, 1.1));
    c.addPass(new OutputPass());
    return c;
  }, [gl, scene, camera, strength]);
  useEffect(() => {
    composer.setPixelRatio(gl.getPixelRatio());
    composer.setSize(size.width, size.height);
  }, [composer, gl, size]);
  useEffect(() => () => composer.dispose(), [composer]);
  // priority 1: this frame callback renders the scene (through the composer) instead of React Three Fiber
  useFrame(() => composer.render(), 1);
  return null;
}

/**
 * What glossy surfaces reflect: a dark factory of light, built in code — black all round, soft silver panels overhead,
 * lime strips round about, just below the horizon (the line's light) and a few warm lamps. So glass, bases and the belt catch neon and
 * soft highlights, never a bright room.
 */
function darkEnvironmentScene(pal: ScenePalette) {
  const sc = new Scene();
  sc.background = pal.bg.clone();
  const panel = (color: Color, size: [number, number, number], pos: [number, number, number], rotY = 0) => {
    const m = new Mesh(new BoxGeometry(...size), new MeshBasicMaterial({ color }));
    m.position.set(...pos);
    m.rotation.y = rotY;
    sc.add(m);
  };
  panel(pal.text.clone().multiplyScalar(0.9), [12, 0.2, 2], [0, 9, 2]);
  panel(pal.text.clone().multiplyScalar(1.1), [0.2, 6, 2], [-10, 4, 4]);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    // below the horizon: the sides of glass and bases catch them; the floor and the belt's top do not
    panel(lit(pal.neon, 1.2), [3, 0.12, 0.12], [Math.cos(a) * 9, -1.6, Math.sin(a) * 9], -a + Math.PI / 2);
  }
  for (const [x, z] of [
    [6, -8],
    [-7, -9],
    [9, 5],
  ] as const)
    panel(lit(pal.highlight, 2), [0.4, 0.4, 0.4], [x, 5, z]);
  return sc;
}

export function Environment({ pal, intensity = 1 }: { pal: ScenePalette; intensity?: number }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    const pm = new PMREMGenerator(gl);
    const env = pm.fromScene(darkEnvironmentScene(pal), 0.03).texture;
    scene.environment = env;
    scene.environmentIntensity = intensity;
    return () => {
      scene.environment = null;
      env.dispose();
      pm.dispose();
    };
  }, [gl, scene, pal, intensity]);
  return null;
}

/* ── the floor: polished tiles; a soft real reflection under them ── */

export function ReflectiveFloor({ pal, quality }: { pal: ScenePalette; quality: Quality }) {
  const tiles = useMemo(() => {
    const t = tileTexture(pal);
    t.repeat.set(30, 30); // 90 m ÷ 3 m tiles
    return t;
  }, [pal]);
  if (quality === "low")
    return (
      <mesh rotation-x={-Math.PI / 2} position-y={0.001}>
        <planeGeometry args={[90, 90]} />
        <Gloss map={tiles} color={pal.text} roughness={0.35} metalness={0.3} envMapIntensity={0.2} />
      </mesh>
    );
  return <MirrorFloor pal={pal} tiles={tiles} />;
}

function MirrorFloor({ pal, tiles }: { pal: ScenePalette; tiles: import("three").Texture }) {
  const size = useThree((s) => s.size);
  const mirror = useMemo(() => {
    // a low-resolution mirror: its reflection is soft, like the reference's polished (not glass-smooth) floor
    const r = new Reflector(new PlaneGeometry(90, 90), {
      textureWidth: Math.round(size.width * 0.32),
      textureHeight: Math.round(size.height * 0.32),
      color: pal.text.clone().multiplyScalar(0.4),
      clipBias: 0.003,
    });
    r.rotation.x = -Math.PI / 2;
    r.position.y = -0.002;
    return r;
  }, [pal]); // eslint-disable-line react-hooks/exhaustive-deps -- the mirror's resolution is set once
  useEffect(() => () => mirror.dispose(), [mirror]);
  return (
    <group>
      <primitive object={mirror} />
      {/* the tiles: dark, translucent enough to let the reflection through as a sheen */}
      <mesh rotation-x={-Math.PI / 2} position-y={0.001}>
        <planeGeometry args={[90, 90]} />
        <Gloss
          map={tiles}
          color={pal.text}
          transparent
          opacity={0.7}
          roughness={0.45}
          metalness={0.2}
          clearcoat={0.5}
          clearcoatRoughness={0.35}
          envMapIntensity={0.12}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

/* ── the belt: the Blender model (plate, rims, end caps, neon lines); its light on the floor stays in code ── */

export function Belt({ pal }: { pal: ScenePalette }) {
  const quality = useContext(QualityContext);
  const gltf = useSampleModels();
  const parts = useMemo(() => {
    const out: Object3D[] = [];
    for (const name of ["Belt_Plate", "Belt_Rim", "Belt_Caps", "Belt_NeonNear", "Belt_NeonFar"]) {
      const o = gltf.scene.getObjectByName(name);
      if (!o) continue;
      const c = o.clone(true);
      c.traverse((m) => {
        if (!(m as Mesh).isMesh) return;
        const mesh = m as Mesh;
        if (name === "Belt_NeonNear") mesh.material = new MeshBasicMaterial({ color: lit(pal.neon, 2.4) });
        else if (name === "Belt_NeonFar") mesh.material = new MeshBasicMaterial({ color: lit(pal.neon, 1.6) });
        else mesh.material = forQuality(mesh.material as MeshPhysicalMaterial, quality);
      });
      out.push(c);
    }
    return out;
  }, [gltf, pal, quality]);
  const w = TRACK.width / 2;
  const glow = useMemo(
    () => ({
      skirt: ribbonGeometry(w + 0.004, 0.03, w + 0.004, 0.06),
      near: ribbonGeometry(w + 0.05, 0.004, w + 1.1, 0.004),
      far: ribbonGeometry(-w - 0.9, 0.004, -w - 0.05, 0.004),
    }),
    [w],
  );
  const glows = useMemo(() => [fadeTexture(pal), fadeTexture(pal, true)], [pal]);
  return (
    <group>
      {parts.map((o) => (
        <primitive key={o.name} object={o} />
      ))}
      <mesh geometry={glow.skirt}>
        <meshBasicMaterial color={lit(pal.emerald, 1.4)} side={DoubleSide} />
      </mesh>
      {[glow.near, glow.far].map((g, i) => (
        <mesh key={i} geometry={g}>
          <meshBasicMaterial
            map={glows[i]}
            color={lit(pal.neon, i === 0 ? 0.16 : 0.08)}
            transparent
            blending={AdditiveBlending}
            depthWrite={false}
            side={DoubleSide}
          />
        </mesh>
      ))}
    </group>
  );
}

/* ── the background: calm, dark architecture ── */

export function Architecture({ pal }: { pal: ScenePalette }) {
  // the large curved gallery behind the line (right), its neon band, and the ribs under it
  const ring = useMemo(() => new TorusGeometry(11, 0.32, 10, 120, Math.PI * 1.1), []);
  const band = useMemo(() => new TorusGeometry(10.62, 0.09, 8, 160, Math.PI * 1.1), []);
  const rail = useMemo(() => new TorusGeometry(11.2, 0.12, 8, 120, Math.PI * 1.1), []);
  return (
    <group>
      <group position={[14, 7.4, -15]} rotation={[Math.PI / 2, 0, Math.PI * 0.95]}>
        <mesh geometry={ring}>
          <Gloss color={pal.bg} roughness={0.3} metalness={0.7} clearcoat={0.6} />
        </mesh>
        <mesh geometry={band} position-z={0.18}>
          <meshBasicMaterial color={lit(pal.neon, 0.95)} />
        </mesh>
      </group>
      <group position={[14, 8.4, -15]} rotation={[Math.PI / 2, 0, Math.PI * 0.95]}>
        <mesh geometry={rail}>
          <Gloss color={pal.bg} roughness={0.35} metalness={0.6} />
        </mesh>
      </group>
      {/* the gallery's ribs and the dark wall behind them */}
      {Array.from({ length: 9 }, (_, i) => {
        const a = Math.PI * 0.95 + (i / 8) * Math.PI * 1.1;
        return (
          <mesh key={i} position={[14 + Math.cos(a) * 11.6, 4.2, -15 - Math.sin(a) * 11.6]} rotation-y={-a}>
            <boxGeometry args={[0.3, 8.4, 0.3]} />
            <Gloss color={pal.bg} roughness={0.4} metalness={0.6} />
          </mesh>
        );
      })}
      <mesh position={[4, 6, -28]}>
        <planeGeometry args={[70, 14]} />
        <meshStandardMaterial color={pal.bg} roughness={0.9} />
      </mesh>
      {/* pillars on the left, a light strip on each */}
      {(
        [
          [-19, -16],
          [-12, -20],
        ] as const
      ).map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh position-y={5}>
            <boxGeometry args={[1.2, 10, 1.2]} />
            <Gloss color={pal.bg} roughness={0.35} metalness={0.5} clearcoat={0.5} />
          </mesh>
          <mesh position={[0.61, 5, 0.3]}>
            <boxGeometry args={[0.01, 9, 0.1]} />
            <meshBasicMaterial color={pal.emerald.clone().multiplyScalar(i === 0 ? 0.5 : 0.35)} />
          </mesh>
        </group>
      ))}
      {/* a few warm lamps, high and far */}
      {[
        [2, 6.2, -16],
        [-4, 5.6, -18],
        [15, 4.2, -6],
        [8, 7.5, -20],
      ].map((p, i) => (
        <mesh key={i} position={p as [number, number, number]}>
          <sphereGeometry args={[0.12, 12, 12]} />
          <meshBasicMaterial color={lit(pal.highlight, 2.2)} />
        </mesh>
      ))}
    </group>
  );
}

/* ── glass ── */

/** The lit edge of glass: bright where the surface turns away from the eye (its rounded edges), clear elsewhere. */
function rimMaterial(color: Color, power = 3, intensity = 1) {
  return new ShaderMaterial({
    uniforms: { color: { value: color }, power: { value: power }, intensity: { value: intensity } },
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vV;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 color; uniform float power; uniform float intensity;
      varying vec3 vN; varying vec3 vV;
      void main() {
        float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), power);
        gl_FragColor = vec4(color * f * intensity, f);
      }`,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
}

/* ── the sample's models: built in Blender (blender/factory-sample/build.py), loaded once ── */

/** the GLB the Blender build exports: the belt, station 01's base, neon and glass, and the product's case and screen */
export const SAMPLE_MODELS = "/models/factory/sample.glb";

export function useSampleModels() {
  return useLoader(GLTFLoader, SAMPLE_MODELS);
}

/**
 * A model from the GLB, ready to place: its own copy (so its materials can be changed per instance), set at the
 * origin (the Blender file places it in the reference shot; the scene places it on the line).
 */
function useModel(name: string, quality: Quality) {
  const gltf = useSampleModels();
  // a fresh copy per level: the level decides the materials
  return useMemo(() => {
    const src = gltf.scene.getObjectByName(name);
    if (!src) throw new Error(`sample.glb: no ${name}`);
    const o = src.clone(true);
    o.position.set(0, 0, 0);
    o.rotation.set(0, 0, 0);
    void quality;
    return o;
  }, [gltf, name, quality]);
}

/**
 * A GLB surface on the level in use. On the high level the physical material as Blender exported it (clearcoat on the
 * dark parts); on the light level its standard equivalent, far cheaper per pixel.
 */
function forQuality(m: MeshPhysicalMaterial | MeshStandardMaterial, quality: Quality) {
  if (quality === "high" || !(m as MeshPhysicalMaterial).isMeshPhysicalMaterial) return m;
  const s = new MeshStandardMaterial();
  MeshStandardMaterial.prototype.copy.call(s, m);
  return s;
}

/**
 * The glass. Blender exports it as transmission 1 with an opaque alpha: on the high level that is kept (the case shows
 * what is behind and inside it — opaque things only, which is why the work inside the cases is opaque), with the
 * environment's reflections. Alpha below 1 would fade the reflections with the body (tested: at 0.15 the case all but
 * vanishes). On the light level, no transmission pass: a faint transparent body instead. Its lit edges come from a
 * fresnel layer on the same walls, inner and outer.
 */
function dressGlass(mesh: Mesh, quality: Quality, rim: ShaderMaterial) {
  const src = mesh.material as MeshPhysicalMaterial;
  const m = src.clone();
  if (quality === "high") {
    m.envMapIntensity = 0.8;
    m.specularIntensity = 1;
    m.thickness = 0; // thin walls: the geometry has its own inner and outer faces
  } else {
    m.transmission = 0;
    m.transparent = true;
    m.opacity = 0.07;
    m.depthWrite = false;
  }
  mesh.material = m;
  mesh.renderOrder = 2;
  const edge = new Mesh(mesh.geometry, rim);
  edge.renderOrder = 3;
  edge.userData.edge = true;
  mesh.add(edge);
}

/** the parts of a sample model, dressed: glass, neon in the given colour, the rest as exported */
function useDressed(name: string, neon: Color, pal: ScenePalette, glow: number) {
  const quality = useContext(QualityContext);
  const model = useModel(name, quality);
  const rim = useMemo(() => {
    const c = pal.text.clone().lerp(pal.neon, 0.35).multiplyScalar(1.7);
    // narrow: only the rounded edges light up, not the faces seen at a slant (the case's top)
    return rimMaterial(c, 4.5, 0.55 * glow);
  }, [pal, glow]);
  const neonMat = useMemo(() => new MeshBasicMaterial({ color: lit(neon, 2.6) }), [neon]);
  useMemo(() => {
    model.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      if (mesh.userData.edge) return; // the glass's fresnel layer
      if (mesh.name.endsWith("_Glass")) {
        if (!mesh.userData.dressed) dressGlass(mesh, quality, rim);
        mesh.userData.dressed = true;
      } else if (mesh.name.endsWith("_Neon")) mesh.material = neonMat;
      else if (mesh.name !== "Product_Screen" && !mesh.userData.dressed) {
        mesh.material = forQuality(mesh.material as MeshPhysicalMaterial, quality);
        mesh.userData.dressed = true;
      }
    });
  }, [model, quality, rim, neonMat]);
  return model;
}

/** a base's number on its front face, in neon */
function NumberPlate({ num, pal, y, z }: { num: number; pal: ScenePalette; y: number; z: number }) {
  const tex = useMemo(() => numberTexture(num, pal), [num, pal]);
  return (
    <mesh position={[0, y, z]}>
      <planeGeometry args={[0.8, 0.28]} />
      <meshBasicMaterial map={tex} transparent color={lit(pal.neon, 1.6)} />
    </mesh>
  );
}

/* ── the tag and the badge ── */

function Tag({ text, pal, width = 1.5 }: { text: string; pal: ScenePalette; width?: number }) {
  const tex = useMemo(() => tagTexture(text, pal), [text, pal]);
  return (
    <mesh>
      <planeGeometry args={[width, width / 4]} />
      <meshBasicMaterial map={tex} transparent depthWrite={false} />
    </mesh>
  );
}

function Badge({ pal }: { pal: ScenePalette }) {
  const tex = useMemo(() => plusTexture(pal), [pal]);
  return (
    <mesh>
      <circleGeometry args={[0.16, 40]} />
      <meshBasicMaterial map={tex} transparent color={lit(pal.text, 1.5)} />
    </mesh>
  );
}

/* ── station 01 in the reference's design ── */

/** station 01's sizes, as built in Blender (metres): its base, and its glass case (width, height, depth) */
export const STATION = { base: { w: 2.75, d: 1.95, h: 0.5 }, glass: [2.3, 1.45, 1.3] as [number, number, number] };

export function SampleStation({
  num,
  name,
  status,
  selected,
  pal,
  reducedMotion,
}: {
  num: number;
  name: string;
  status: StationStatus;
  selected: boolean;
  pal: ScenePalette;
  reducedMotion: boolean;
}) {
  const color = status === "waiting" ? pal.emerald : status === "done" ? pal.highlight : pal.neon;
  const model = useDressed("Station01", color, pal, selected ? 1.5 : 1);
  const inner = useRef<Group>(null);
  const panel = useMemo(() => setupPanelTexture(pal), [pal]);
  const rows = useMemo(() => rowsTexture(pal), [pal]);
  // the work inside: a lit 2×2×2 block structure — the project's structure being set up. Opaque (bright edges, dark
  // emerald faces): only opaque things show through transmissive glass.
  const cubes = useMemo(() => {
    const out: [number, number, number][] = [];
    for (const x of [-0.17, 0.17]) for (const y of [-0.17, 0.17]) for (const z of [-0.17, 0.17]) out.push([x, y, z]);
    return out;
  }, []);
  const edges = useMemo(() => new EdgesGeometry(new BoxGeometry(0.32, 0.32, 0.32)), []);
  useFrame(({ clock }) => {
    if (inner.current && !reducedMotion && status === "active") inner.current.rotation.y = clock.elapsedTime * 0.35;
  });
  const { base, glass } = STATION;
  return (
    <group>
      <primitive object={model} />
      <NumberPlate num={num} pal={pal} y={base.h * 0.48} z={base.d / 2 + 0.012} />
      <group position-y={base.h + glass[1] / 2 + 0.01}>
        <group ref={inner} position={[0, -0.05, 0]}>
          {cubes.map(([x, y, z], i) => (
            <group key={i} position={[x, y, z]}>
              <lineSegments geometry={edges}>
                <lineBasicMaterial color={lit(pal.neon, 2.6)} />
              </lineSegments>
              <mesh>
                <boxGeometry args={[0.3, 0.3, 0.3]} />
                <meshStandardMaterial color={pal.bg} emissive={pal.emerald} emissiveIntensity={0.22} />
              </mesh>
            </group>
          ))}
        </group>
        {/* thin interface panels inside the case, at its sides (cut out, not blended: they show through the glass) */}
        <mesh position={[-0.78, 0, -0.2]} rotation-y={0.25}>
          <planeGeometry args={[0.5, 0.62]} />
          <meshBasicMaterial map={rows} alphaTest={0.4} />
        </mesh>
        <mesh position={[0.78, 0, -0.2]} rotation-y={-0.25}>
          <planeGeometry args={[0.5, 0.62]} />
          <meshBasicMaterial map={panel} alphaTest={0.4} />
        </mesh>
        {/* the badge on the case's front top corner; the tag above it */}
        <group position={[glass[0] / 2 - 0.2, glass[1] / 2 - 0.05, glass[2] / 2 + 0.02]}>
          <Badge pal={pal} />
        </group>
        <group position={[-0.25, glass[1] / 2 + 0.28, glass[2] / 2 - 0.25]}>
          <Tag text={name} pal={pal} width={1.4} />
        </group>
      </group>
      {/* the light inside the case, on the work and the glass */}
      <pointLight color={pal.neon} intensity={selected ? 2 : 0.9} distance={2.4} position={[0, base.h + 0.7, 0]} />
    </group>
  );
}

/* ── the client's product: its base, the largest glass case, the screen device inside ── */

/** the product's sizes, as built in Blender: its base, its case (width, height, depth) and the screen */
export const PRODUCT = {
  base: { h: 0.42 },
  case: [3.3, 1.95, 1.55] as [number, number, number],
  screen: { w: 2.8, h: (2.8 * 640) / 1024 },
};

export function ProductCase({
  pal,
  screen,
  delivered,
  children,
}: {
  pal: ScenePalette;
  screen: import("three").Texture;
  delivered: boolean;
  children?: React.ReactNode;
}) {
  const model = useDressed("Product", delivered ? pal.highlight : pal.neon, pal, delivered ? 1.5 : 1.1);
  // the screen: the approved page, drawn by the site, on the Blender device's face
  useMemo(() => {
    const face = model.getObjectByName("Product_Screen") as Mesh | undefined;
    // glTF UVs run top-down; the canvas texture is flipped for the usual bottom-up UVs: unflip it
    screen.flipY = false;
    screen.needsUpdate = true;
    if (face) face.material = new MeshBasicMaterial({ map: screen, color: SCREEN_LIGHT });
  }, [model, screen]);
  const box = PRODUCT.case;
  return (
    <group>
      <primitive object={model} />
      <group position-y={PRODUCT.base.h + box[1] / 2 + 0.01}>
        <group position={[-box[0] / 2 + 0.2, 0.05, box[2] / 2 + 0.02]}>
          <Badge pal={pal} />
        </group>
        <group position={[-0.45, box[1] / 2 + 0.3, box[2] / 2 - 0.3]}>
          <Tag text="منتجك الرقمي" pal={pal} width={1.6} />
        </group>
        {children}
      </group>
    </group>
  );
}
