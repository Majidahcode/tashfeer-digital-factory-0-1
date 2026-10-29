"use client";
/* eslint-disable react-hooks/immutability -- three.js objects are changed every frame inside useFrame */

/**
 * The visual sample (the owner's reference image of 2026-10-29), built in code — real geometry and materials, not
 * pictures:
 *   Environment    what glossy surfaces reflect: a dark space with neon strips and one soft overhead light
 *   Effects        the renderer's output: a glow (bloom) that only the neon is bright enough to reach
 *   ReflectiveFloor a glossy black floor that really reflects the scene (a planar mirror under a dark film)
 *   Belt           the production line: a thick black belt, a perforated running surface, raised lips, a neon band
 *                  along its outer face and its light on the floor
 *   GlassCase      a glass box with rounded edges, its rim lit like the reference's cases
 *   SampleStation  one complete station: a rounded black base with its number, a glass case, the work inside it, its
 *                  name tag and ⊕ badge
 *   ProductCase    the client's one product: a base, a large glass case, the screen inside it at a readable size
 *
 * Only the first station uses SampleStation for now; the others keep the earlier design until the sample is approved.
 */
import { useFrame, useThree } from "@react-three/fiber";
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
  PMREMGenerator,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  Vector2,
} from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { Reflector } from "three/examples/jsm/objects/Reflector.js";
import type { StationStatus } from "@/domain/factory";
import { TRACK, ribbonGeometry } from "./layout";
import type { ScenePalette } from "./palette";
import {
  fadeTexture,
  numberTexture,
  perforatedTexture,
  plusTexture,
  setupPanelTexture,
  tagTexture,
} from "./textures";

/** the product's screen: a touch above 1 so it reads as lit, below the glow's threshold so it stays crisp */
const SCREEN_LIGHT = new Color(1, 1, 1).multiplyScalar(1.06);

/**
 * Rendering quality. "high": the real planar reflection, transmissive glass, the glow, the reflections' environment and
 * the belt's relief; "low": a glossy floor without the mirror, transparent glass without transmission, standard
 * materials, no glow pass, no environment, a flat belt — for devices that cannot keep up (a software
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

export function Effects({ strength = 0.55 }: { strength?: number }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const composer = useMemo(() => {
    const c = new EffectComposer(gl);
    c.addPass(new RenderPass(scene, camera));
    // threshold above 1: only the HDR neon glows; the product's screen and the labels (≤ 1) stay crisp
    c.addPass(new UnrealBloomPass(new Vector2(256, 256), strength, 0.4, 1.2));
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
 * What glossy surfaces reflect: a dark factory of light, built in code — black all round, one soft silver panel
 * overhead, lime strips low around the floor (the line's light). So glass, bases
 * and the belt catch neon and soft highlights, never a bright room.
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
  panel(pal.text.clone().multiplyScalar(1.6), [10, 0.2, 3], [0, 9, 0]);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    panel(lit(pal.neon, 2.2), [5, 0.18, 0.18], [Math.cos(a) * 9, 0.4, Math.sin(a) * 9], -a + Math.PI / 2);
  }
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

/* ── the floor: a real reflection under a dark, slightly glossy film ── */

export function ReflectiveFloor({ pal, quality }: { pal: ScenePalette; quality: Quality }) {
  if (quality === "low")
    return (
      <mesh rotation-x={-Math.PI / 2} position-y={0.001}>
        <planeGeometry args={[90, 90]} />
        <Gloss
          color={pal.bg}
          roughness={0.3}
          metalness={0.4}
          clearcoat={1}
          clearcoatRoughness={0.25}
          envMapIntensity={0.15}
        />
      </mesh>
    );
  return <MirrorFloor pal={pal} />;
}

function MirrorFloor({ pal }: { pal: ScenePalette }) {
  const size = useThree((s) => s.size);
  const mirror = useMemo(() => {
    const r = new Reflector(new PlaneGeometry(90, 90), {
      textureWidth: Math.round(size.width * 0.6),
      textureHeight: Math.round(size.height * 0.6),
      color: pal.text.clone().multiplyScalar(0.3),
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
      {/* the film: mostly black, so the reflection reads as a sheen on a dark floor, not a mirror */}
      <mesh rotation-x={-Math.PI / 2} position-y={0.001}>
        <planeGeometry args={[90, 90]} />
        <Gloss
          color={pal.bg}
          transparent
          opacity={0.86}
          roughness={0.4}
          metalness={0.2}
          clearcoat={0.6}
          clearcoatRoughness={0.3}
          envMapIntensity={0.15}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

/* ── the belt ── */

export function Belt({ pal }: { pal: ScenePalette }) {
  const w = TRACK.width / 2;
  const h = TRACK.top;
  const lip = TRACK.lip;
  const lw = TRACK.lipWidth;
  const parts = useMemo(
    () => ({
      surface: ribbonGeometry(w - lw, h, -w + lw, h, 0.9),
      lipNear: ribbonGeometry(w, h + lip, w - lw, h + lip),
      lipFar: ribbonGeometry(-w + lw, h + lip, -w, h + lip),
      innerNear: ribbonGeometry(w - lw, h + lip, w - lw, h),
      innerFar: ribbonGeometry(-w + lw, h, -w + lw, h + lip),
      outerNear: ribbonGeometry(w, 0, w, h + lip),
      outerFar: ribbonGeometry(-w, h + lip, -w, 0),
      // the neon band along the outer face (both sides), a hair outside it
      bandNear: ribbonGeometry(w + 0.004, 0.13, w + 0.004, 0.2),
      bandFar: ribbonGeometry(-w - 0.004, 0.2, -w - 0.004, 0.13),
      // the light it throws on the floor
      glowNear: ribbonGeometry(w + 0.05, 0.004, w + 0.9, 0.004),
      glowFar: ribbonGeometry(-w - 0.9, 0.004, -w - 0.05, 0.004),
    }),
    [w, h, lip, lw],
  );
  const plate = useMemo(() => perforatedTexture(pal), [pal]);
  // the perforated plate (texture and relief) on the high level only: the belt's costliest detail per pixel
  const relief = useContext(QualityContext) === "high";
  // the light at the belt's foot: bright against it, gone 0.9 m out (the far strip runs the other way across)
  const glows = useMemo(() => [fadeTexture(pal), fadeTexture(pal, true)], [pal]);
  return (
    <group>
      <mesh geometry={parts.surface}>
        <Gloss
          map={relief ? plate : null}
          bumpMap={relief ? plate : null}
          bumpScale={relief ? 1.5 : 0}
          color={relief ? pal.text : pal.glassBase}
          roughness={0.42}
          metalness={0.75}
          clearcoat={0.3}
          side={DoubleSide}
        />
      </mesh>
      {[parts.lipNear, parts.lipFar, parts.innerNear, parts.innerFar, parts.outerNear, parts.outerFar].map((g, i) => (
        <mesh key={i} geometry={g}>
          <Gloss color={pal.bg} roughness={0.18} metalness={0.6} clearcoat={1} side={DoubleSide} />
        </mesh>
      ))}
      <mesh geometry={parts.bandNear}>
        <meshBasicMaterial color={lit(pal.neon, 2.2)} side={DoubleSide} />
      </mesh>
      <mesh geometry={parts.bandFar}>
        <meshBasicMaterial color={lit(pal.neon, 2.2)} side={DoubleSide} />
      </mesh>
      {[parts.glowNear, parts.glowFar].map((g, i) => (
        <mesh key={i} geometry={g}>
          <meshBasicMaterial
            map={glows[i]}
            color={lit(pal.neon, i === 0 ? 0.42 : 0.3)}
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

/* ── glass ── */

/** The lit rim of glass: bright where the surface turns away from the eye (its edges), clear where it faces it. */
function rimMaterial(color: Color, power = 2.6, intensity = 1) {
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

export function GlassCase({
  size,
  radius,
  pal,
  glow = 1,
  quality = "high",
}: {
  size: [number, number, number];
  radius: number;
  pal: ScenePalette;
  glow?: number;
  quality?: Quality;
}) {
  const geo = useMemo(() => new RoundedBoxGeometry(size[0], size[1], size[2], 6, radius), [size, radius]);
  const rim = useMemo(() => rimMaterial(lit(pal.neon, 1.6), 3.2, 0.7 * glow), [pal, glow]);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <group>
      <mesh geometry={geo} renderOrder={2}>
        <Gloss
          key={quality}
          color={pal.text}
          transmission={quality === "high" ? 0.94 : 0}
          thickness={0.35}
          ior={1.45}
          roughness={0.06}
          metalness={0}
          clearcoat={1}
          clearcoatRoughness={0.05}
          attenuationColor={pal.emerald}
          attenuationDistance={2.4}
          specularIntensity={1}
          envMapIntensity={1.2}
          transparent
          opacity={quality === "high" ? 1 : 0.16}
          depthWrite={quality === "high"}
        />
      </mesh>
      <mesh geometry={geo} material={rim} renderOrder={3} />
    </group>
  );
}

/* ── a base: rounded black slab, a neon line round its foot and its top ── */

function Base({
  size,
  pal,
  color,
  num,
}: {
  size: [number, number, number];
  pal: ScenePalette;
  color: Color;
  num?: number;
}) {
  const geo = useMemo(() => new RoundedBoxGeometry(size[0], size[1], size[2], 5, 0.12), [size]);
  const foot = useMemo(() => new EdgesGeometry(new BoxGeometry(size[0] - 0.08, 0.001, size[2] - 0.08)), [size]);
  const numTex = useMemo(() => (num ? numberTexture(num, pal) : null), [num, pal]);
  return (
    <group>
      <mesh geometry={geo} position-y={size[1] / 2}>
        <Gloss color={pal.bg} roughness={0.26} metalness={0.55} clearcoat={0.9} clearcoatRoughness={0.15} />
      </mesh>
      {/* the light at its foot and along its top edge */}
      <lineSegments geometry={foot} position-y={0.03}>
        <lineBasicMaterial color={lit(color, 3)} />
      </lineSegments>
      <mesh position={[0, size[1] - 0.004, size[2] / 2 - 0.02]}>
        <boxGeometry args={[size[0] - 0.3, 0.012, 0.012]} />
        <meshBasicMaterial color={lit(color, 2.6)} />
      </mesh>
      {numTex && (
        <mesh position={[-size[0] / 2 + 0.55, size[1] * 0.42, size[2] / 2 + 0.002]}>
          <planeGeometry args={[0.72, 0.25]} />
          <meshBasicMaterial map={numTex} transparent color={lit(pal.text, 1.05)} />
        </mesh>
      )}
    </group>
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
      <circleGeometry args={[0.15, 40]} />
      <meshBasicMaterial map={tex} transparent color={lit(pal.text, 1.3)} />
    </mesh>
  );
}

/* ── the sample station: «تجهيز المشروع» ── */

const BASE: [number, number, number] = [2.5, 0.62, 1.7];
const CASE: [number, number, number] = [2.0, 1.5, 1.3];

export function SampleStation({
  num,
  name,
  status,
  selected,
  pal,
  reducedMotion,
  quality,
}: {
  num: number;
  name: string;
  status: StationStatus;
  selected: boolean;
  pal: ScenePalette;
  reducedMotion: boolean;
  quality: Quality;
}) {
  const color = status === "active" ? pal.neon : status === "done" ? pal.highlight : pal.emerald;
  const inner = useRef<Group>(null);
  const panel = useMemo(() => setupPanelTexture(pal), [pal]);
  // the work inside: a structure of blocks being set up — the frames lit, the faces faint glass-green
  const blocks = useMemo(
    () =>
      [
        [-0.2, 0, 0],
        [0.2, 0, 0],
        [-0.2, 0.4, 0],
        [0.2, 0.4, 0],
        [0, 0.8, 0],
      ] as const,
    [],
  );
  const edges = useMemo(() => new EdgesGeometry(new BoxGeometry(0.36, 0.36, 0.36)), []);
  useFrame(({ clock }) => {
    if (inner.current && !reducedMotion && status === "active") inner.current.rotation.y = clock.elapsedTime * 0.35;
  });
  return (
    <group>
      <Base size={BASE} pal={pal} color={color} num={num} />
      <group position-y={BASE[1] + CASE[1] / 2 + 0.01}>
        <GlassCase size={CASE} radius={0.2} pal={pal} glow={selected ? 1.5 : 1} quality={quality} />
        {/* the work in the case */}
        <group ref={inner} position={[-0.15, -0.5, 0]}>
          {blocks.map(([x, y, z], i) => (
            <group key={i} position={[x, y + 0.18, z]}>
              <lineSegments geometry={edges}>
                <lineBasicMaterial color={lit(pal.neon, i === blocks.length - 1 ? 3.2 : 2.2)} />
              </lineSegments>
              <mesh>
                <boxGeometry args={[0.35, 0.35, 0.35]} />
                <meshStandardMaterial color={pal.emerald} emissive={pal.emerald} emissiveIntensity={0.6} transparent opacity={0.35} />
              </mesh>
            </group>
          ))}
        </group>
        {/* the station's own screen, on the case's back wall */}
        <mesh position={[0.6, 0, -0.45]}>
          <planeGeometry args={[0.62, 0.78]} />
          <meshBasicMaterial map={panel} transparent />
        </mesh>
        {/* the badge on the case's top corner, the tag above it */}
        <group position={[CASE[0] / 2 - 0.16, CASE[1] / 2 - 0.02, CASE[2] / 2 + 0.02]}>
          <Badge pal={pal} />
        </group>
        <group position={[-0.3, CASE[1] / 2 + 0.36, CASE[2] / 2 - 0.2]}>
          <Tag text={name} pal={pal} width={1.5} />
        </group>
      </group>
      {selected && <pointLight color={lit(pal.neon, 1)} intensity={6} distance={5} position={[0, 2.8, 1.4]} />}
    </group>
  );
}

/* ── the client's product: a base, a large glass case, the screen inside ── */

export const PRODUCT = { base: [3.1, 0.42, 1.9] as [number, number, number], case: [3.0, 2.0, 1.45] as [number, number, number] };

export function ProductCase({
  pal,
  screen,
  delivered,
  quality,
  children,
}: {
  pal: ScenePalette;
  screen: { map: import("three").Texture; w: number; h: number };
  delivered: boolean;
  quality: Quality;
  children?: React.ReactNode;
}) {
  const screenRef = useRef<Mesh>(null);
  return (
    <group>
      <Base size={PRODUCT.base} pal={pal} color={delivered ? pal.highlight : pal.neon} />
      <group position-y={PRODUCT.base[1] + PRODUCT.case[1] / 2 + 0.01}>
        <GlassCase size={PRODUCT.case} radius={0.22} pal={pal} glow={delivered ? 1.6 : 1.1} quality={quality} />
        {/* the screen: a thin dark device, the approved model's page on it */}
        <group position-z={-0.05} rotation-x={-0.05}>
          <mesh>
            <boxGeometry args={[screen.w + 0.1, screen.h + 0.1, 0.05]} />
            <Gloss color={pal.bg} roughness={0.2} metalness={0.6} clearcoat={1} />
          </mesh>
          <mesh ref={screenRef} position-z={0.027}>
            <planeGeometry args={[screen.w, screen.h]} />
            {/* a touch above 1 so the screen reads as lit, below the glow's threshold so it stays crisp */}
            <meshBasicMaterial map={screen.map} color={SCREEN_LIGHT} />
          </mesh>
        </group>
        <group position={[-PRODUCT.case[0] / 2 + 0.18, 0.15, PRODUCT.case[2] / 2 + 0.02]}>
          <Badge pal={pal} />
        </group>
        <group position={[-0.55, PRODUCT.case[1] / 2 + 0.34, PRODUCT.case[2] / 2 - 0.25]}>
          <Tag text="منتجك الرقمي" pal={pal} width={1.6} />
        </group>
        {children}
      </group>
    </group>
  );
}
