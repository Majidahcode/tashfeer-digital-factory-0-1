"use client";
/* eslint-disable react-hooks/immutability -- three.js objects are changed every frame inside useFrame */

/**
 * The factory's look, rebuilt after the owner's reference image (2026-10-30), element by element — real geometry and
 * materials, not pictures:
 *   Environment     what glossy surfaces reflect: a dark space with neon strips, soft overhead light, warm lamps
 *   Effects         the renderer's output: a glow (bloom) that only the neon is bright enough to reach
 *   ReflectiveFloor polished dark floor tiles that really reflect the scene, softly (a low-resolution mirror under a film)
 *   Belt            the production platform: 4.6 m wide, a perforated running surface, rounded black rims, a neon line
 *                   along its outer edge and its light on the floor
 *   Architecture    the calm background: a large curved gallery with a neon band, pillars with light strips, lamps
 *   GlassCase       clear, thick glass with rounded edges; its edges catch the light
 *   StadiumBase     a station's black base: a rounded slab, its number, the neon line at the glass's foot
 *   SampleStation   station 01 in the reference's design (the work in its case: a lit block structure, side panels)
 *   ProductCase     the client's one product: an oval base, the largest glass case, the screen inside it
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
  ExtrudeGeometry,
  type Group,
  Mesh,
  MeshBasicMaterial,
  Path,
  PMREMGenerator,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  Shape,
  ShapeGeometry,
  TorusGeometry,
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

/* ── the belt: a wide platform, rounded black rims, a neon line along its outer edge ── */

export function Belt({ pal }: { pal: ScenePalette }) {
  const w = TRACK.width / 2;
  const h = TRACK.top;
  const r = TRACK.rim;
  const parts = useMemo(() => {
    // each rim: a quarter round from the outer face up to the running surface, in 6 facets
    const rim = (side: 1 | -1) => {
      const g: ReturnType<typeof ribbonGeometry>[] = [];
      const cx = side * (w - r);
      const cy = h - r;
      for (let i = 0; i < 6; i++) {
        const a0 = (i / 6) * (Math.PI / 2);
        const a1 = ((i + 1) / 6) * (Math.PI / 2);
        const p0: [number, number] = [cx + side * r * Math.cos(a0), cy + r * Math.sin(a0)];
        const p1: [number, number] = [cx + side * r * Math.cos(a1), cy + r * Math.sin(a1)];
        g.push(side > 0 ? ribbonGeometry(p0[0], p0[1], p1[0], p1[1]) : ribbonGeometry(p1[0], p1[1], p0[0], p0[1]));
      }
      return g;
    };
    return {
      surface: ribbonGeometry(w - r, h, -w + r, h, 0.9),
      rims: [...rim(1), ...rim(-1)],
      outerNear: ribbonGeometry(w, 0, w, h - r),
      outerFar: ribbonGeometry(-w, h - r, -w, 0),
      // the neon line along the outer edge, where the rim meets the face (both sides; the near one brighter)
      lineNear: ribbonGeometry(w + 0.006, h - r - 0.035, w + 0.006, h - r + 0.015),
      lineFar: ribbonGeometry(-w - 0.006, h - r + 0.015, -w - 0.006, h - r - 0.035),
      // a fainter band low on the face, and the light the belt throws on the floor
      skirtNear: ribbonGeometry(w + 0.004, 0.03, w + 0.004, 0.06),
      glowNear: ribbonGeometry(w + 0.05, 0.004, w + 1.1, 0.004),
      glowFar: ribbonGeometry(-w - 0.9, 0.004, -w - 0.05, 0.004),
    };
  }, [w, h, r]);
  const plate = useMemo(() => perforatedTexture(pal), [pal]);
  // the perforated plate (texture and relief) on the high level only: the belt's costliest detail per pixel
  const relief = useContext(QualityContext) === "high";
  const glows = useMemo(() => [fadeTexture(pal), fadeTexture(pal, true)], [pal]);
  return (
    <group>
      <mesh geometry={parts.surface}>
        <Gloss
          map={relief ? plate : null}
          bumpMap={relief ? plate : null}
          bumpScale={relief ? 1.2 : 0}
          color={relief ? pal.text : pal.glassBase}
          roughness={0.55}
          metalness={0.2}
          clearcoat={0.25}
          side={DoubleSide}
        />
      </mesh>
      {[...parts.rims, parts.outerNear, parts.outerFar].map((g, i) => (
        <mesh key={i} geometry={g}>
          <Gloss color={pal.bg} roughness={0.16} metalness={0.55} clearcoat={1} clearcoatRoughness={0.1} side={DoubleSide} />
        </mesh>
      ))}
      <mesh geometry={parts.lineNear}>
        <meshBasicMaterial color={lit(pal.neon, 1.7)} side={DoubleSide} />
      </mesh>
      <mesh geometry={parts.lineFar}>
        <meshBasicMaterial color={lit(pal.neon, 1.35)} side={DoubleSide} />
      </mesh>
      <mesh geometry={parts.skirtNear}>
        <meshBasicMaterial color={lit(pal.emerald, 1.4)} side={DoubleSide} />
      </mesh>
      {[parts.glowNear, parts.glowFar].map((g, i) => (
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

export function GlassCase({
  size,
  radius,
  pal,
  glow = 1,
}: {
  size: [number, number, number];
  radius: number;
  pal: ScenePalette;
  glow?: number;
}) {
  const quality = useContext(QualityContext);
  const geo = useMemo(() => new RoundedBoxGeometry(size[0], size[1], size[2], 8, radius), [size, radius]);
  // the edges: mostly white light with a touch of lime, as the reference's glass catches its surroundings
  const rim = useMemo(() => {
    const c = pal.text.clone().lerp(pal.neon, 0.35).multiplyScalar(1.7);
    return rimMaterial(c, 2.6, 0.75 * glow);
  }, [pal, glow]);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <group>
      <mesh geometry={geo} renderOrder={2}>
        <Gloss
          key={quality}
          // clear glass: almost no body of its own; what reads is the reflections and the lit rounded edges (the rim
          // below). No transmission pass: it blurred and greyed what is inside the case.
          color={pal.text.clone().lerp(new Color(1, 1, 1), 0.6)}
          roughness={0.04}
          metalness={0}
          clearcoat={1}
          clearcoatRoughness={0.03}
          specularIntensity={1}
          envMapIntensity={quality === "high" ? 1.3 : 0}
          transparent
          opacity={quality === "high" ? 0.07 : 0.08}
          depthWrite={false}
        />
      </mesh>
      <mesh geometry={geo} material={rim} renderOrder={3} />
    </group>
  );
}

/* ── a base: a rounded black slab, the neon line round the glass's foot, its number on the front ── */

function roundedRect(w: number, d: number, r: number, hole = false) {
  const s = hole ? new Path() : new Shape();
  const x = -w / 2;
  const y = -d / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + d - r);
  s.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
  s.lineTo(x + r, y + d);
  s.quadraticCurveTo(x, y + d, x, y + d - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

export function StadiumBase({
  w,
  d,
  h,
  radius,
  pal,
  color,
  num,
  foot,
}: {
  w: number;
  d: number;
  h: number;
  radius: number;
  pal: ScenePalette;
  color: Color;
  num?: number;
  /** the glass's footprint: the neon line runs round it on the base's top */
  foot: [number, number, number];
}) {
  const body = useMemo(() => {
    const g = new ExtrudeGeometry(roundedRect(w, d, radius) as Shape, {
      depth: h - 0.08,
      bevelEnabled: true,
      bevelThickness: 0.04,
      bevelSize: 0.04,
      bevelSegments: 4,
      curveSegments: 18,
    });
    g.rotateX(-Math.PI / 2);
    g.translate(0, 0.04, 0);
    return g;
  }, [w, d, h, radius]);
  // the neon line round the glass's foot: a thin rounded ring
  const ring = useMemo(() => {
    const [fw, fd, fr] = foot;
    const outer = roundedRect(fw + 0.12, fd + 0.12, fr + 0.06) as Shape;
    outer.holes.push(roundedRect(fw + 0.02, fd + 0.02, fr + 0.01, true) as Path);
    const g = new ShapeGeometry(outer, 18);
    g.rotateX(-Math.PI / 2);
    return g;
  }, [foot]);
  const edge = useMemo(() => {
    const outer = roundedRect(w + 0.08, d + 0.08, radius + 0.04) as Shape;
    outer.holes.push(roundedRect(w + 0.02, d + 0.02, radius + 0.01, true) as Path);
    const g = new ShapeGeometry(outer, 24);
    g.rotateX(-Math.PI / 2);
    return g;
  }, [w, d, radius]);
  const numTex = useMemo(() => (num ? numberTexture(num, pal) : null), [num, pal]);
  return (
    <group>
      <mesh geometry={body}>
        <Gloss
          color={pal.text.clone().multiplyScalar(0.16)}
          roughness={0.3}
          metalness={0.1}
          clearcoat={1}
          clearcoatRoughness={0.1}
          envMapIntensity={1.4}
        />
      </mesh>
      {/* the top edge catches the light: a thin silver line round the slab */}
      <mesh geometry={edge} position-y={h + 0.002}>
        <meshBasicMaterial color={pal.text.clone().multiplyScalar(0.42)} />
      </mesh>
      <mesh geometry={ring} position-y={h + 0.004}>
        <meshBasicMaterial color={lit(color, 2.6)} />
      </mesh>
      {/* a fainter line at the base's foot, on the belt */}
      <mesh position={[0, 0.015, d / 2 + 0.03]}>
        <boxGeometry args={[w - radius * 2, 0.02, 0.01]} />
        <meshBasicMaterial color={lit(color, 1.6)} />
      </mesh>
      {numTex && (
        <mesh position={[0, h * 0.48, d / 2 + 0.045]}>
          <planeGeometry args={[0.8, 0.28]} />
          <meshBasicMaterial map={numTex} transparent color={lit(pal.neon, 1.6)} />
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
      <circleGeometry args={[0.16, 40]} />
      <meshBasicMaterial map={tex} transparent color={lit(pal.text, 1.5)} />
    </mesh>
  );
}

/* ── station 01 in the reference's design ── */

export const STATION = { base: { w: 2.75, d: 1.95, h: 0.5, r: 0.55 }, glass: [2.3, 1.45, 1.3] as [number, number, number] };

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
  const inner = useRef<Group>(null);
  const panel = useMemo(() => setupPanelTexture(pal), [pal]);
  const rows = useMemo(() => rowsTexture(pal), [pal]);
  // the work inside: a lit 2×2×2 block structure — the project's structure being set up
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
      <StadiumBase
        w={base.w}
        d={base.d}
        h={base.h}
        radius={base.r}
        pal={pal}
        color={color}
        num={num}
        foot={[glass[0], glass[2], 0.2]}
      />
      <group position-y={base.h + glass[1] / 2 + 0.01}>
        <GlassCase size={glass} radius={0.2} pal={pal} glow={selected ? 1.5 : 1} />
        {/* the work in the case */}
        <group ref={inner} position={[0, -0.05, 0]}>
          {cubes.map(([x, y, z], i) => (
            <group key={i} position={[x, y, z]}>
              <lineSegments geometry={edges}>
                <lineBasicMaterial color={lit(pal.neon, 2.6)} />
              </lineSegments>
              <mesh>
                <boxGeometry args={[0.31, 0.31, 0.31]} />
                <meshStandardMaterial
                  color={pal.emerald}
                  emissive={pal.emerald}
                  emissiveIntensity={0.9}
                  transparent
                  opacity={0.38}
                  depthWrite={false}
                />
              </mesh>
            </group>
          ))}
        </group>
        {/* thin interface panels inside the case, at its sides, as in the reference */}
        <mesh position={[-0.78, 0, -0.2]} rotation-y={0.25}>
          <planeGeometry args={[0.5, 0.62]} />
          <meshBasicMaterial map={rows} transparent depthWrite={false} />
        </mesh>
        <mesh position={[0.78, 0, -0.2]} rotation-y={-0.25}>
          <planeGeometry args={[0.5, 0.62]} />
          <meshBasicMaterial map={panel} transparent depthWrite={false} />
        </mesh>
        {/* the badge on the case's top corner; the tag above it */}
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

/* ── the client's product: an oval base, the largest glass case, the screen inside ── */

export const PRODUCT = {
  base: { w: 3.8, d: 2.2, h: 0.42, r: 0.95 },
  case: [3.3, 1.95, 1.55] as [number, number, number],
};

export function ProductCase({
  pal,
  screen,
  delivered,
  children,
}: {
  pal: ScenePalette;
  screen: { map: import("three").Texture; w: number; h: number };
  delivered: boolean;
  children?: React.ReactNode;
}) {
  const { base } = PRODUCT;
  const box = PRODUCT.case;
  return (
    <group>
      <StadiumBase
        w={base.w}
        d={base.d}
        h={base.h}
        radius={base.r}
        pal={pal}
        color={delivered ? pal.highlight : pal.neon}
        foot={[box[0], box[2], 0.22]}
      />
      <group position-y={base.h + box[1] / 2 + 0.01}>
        <GlassCase size={box} radius={0.22} pal={pal} glow={delivered ? 1.5 : 1.1} />
        {/* the screen: a thin dark device, the approved model's page on it */}
        <group position-z={-0.12} rotation-x={-0.04}>
          <mesh>
            <boxGeometry args={[screen.w + 0.1, screen.h + 0.1, 0.05]} />
            <Gloss color={pal.bg} roughness={0.2} metalness={0.6} clearcoat={1} />
          </mesh>
          <mesh position-z={0.027}>
            <planeGeometry args={[screen.w, screen.h]} />
            <meshBasicMaterial map={screen.map} color={SCREEN_LIGHT} />
          </mesh>
        </group>
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
