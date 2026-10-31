/**
 * One place where Tashfeer is drawn: a transparent WebGL canvas (no background, no floor — only a small soft contact
 * shadow), his model, his rig and his poses. Used by the character on every screen (Tashfeer3D.tsx) and by the
 * crossing through the portal (page-transition.ts), which needs him on a canvas over the whole screen.
 *
 * The model is loaded once per page load and shared (each stage draws its own copy). Framing: the stage is told the
 * box (CSS px, relative to its canvas) the character must fill, his whole body from the soles to the top of the head;
 * on a full-screen canvas that box is where he stands on the page, so the hand-off from the page is seamless.
 */
import {
  ACESFilmicToneMapping,
  AmbientLight,
  CanvasTexture,
  Color,
  DirectionalLight,
  Group,
  Mesh,
  type MeshStandardMaterial,
  MathUtils,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  MeshBasicMaterial,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { type Mode, pose, stiffness } from "./poses";
import { forceFullQuality } from "@/lib/diagnostics";
import { type Pose, Rig } from "./rig";

export const MODEL_URL = "/models/tashfeer/tashfeer.glb";
/** his height in the model (metres, soles to the top of the head) and the framing's margins */
export const HEIGHT = 1.905;
const FOV = 18;

let loading: Promise<GLTF> | null = null;
/** the model, loaded once (every stage draws its own copy of it) */
export function loadTashfeer(): Promise<GLTF> {
  if (!loading) {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    loading = loader.loadAsync(MODEL_URL);
    loading.catch(() => {
      loading = null;
    });
  }
  return loading;
}

export type Box = { x: number; y: number; width: number; height: number };

/**
 * A software renderer (no GPU: SwiftShader, llvmpipe — test machines, some locked-down PCs) draws him a few times a
 * second at best: there he is drawn lighter (no reflection studio, fewer frames) so the page stays responsive.
 */
export function rendererName(gl: WebGLRenderingContext | WebGL2RenderingContext): string {
  const ext = gl.getExtension("WEBGL_debug_renderer_info");
  return String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
}

export function softwareRenderer(gl: WebGLRenderingContext | WebGL2RenderingContext): boolean {
  return /swiftshader|llvmpipe|software|basic render/i.test(rendererName(gl));
}

/** the palette, read from the page's tokens (never colour literals here) */
function token(name: string, fallback: readonly [number, number, number]) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v ? new Color(v) : new Color().setRGB(...fallback);
}

export class TashfeerStage {
  readonly canvas: HTMLCanvasElement;
  readonly root = new Group(); // the character: placed and turned in the world
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera = new PerspectiveCamera(FOV, 1, 0.1, 100);
  private rig: Rig | null = null;
  private model: Object3D | null = null;
  private emissive: MeshStandardMaterial[] = [];
  private shadow: Mesh;
  private box: Box = { x: 0, y: 0, width: 1, height: 1 };
  private size = { w: 1, h: 1 };
  private raf = 0;
  private last = 0;
  private t0 = performance.now();
  private modeStart = 0;
  private first = true;
  /** a software renderer: lighter drawing (see softwareRenderer) */
  readonly lite: boolean;
  readonly rendererName: string;
  /** frame times (ms) of the last drawn frames, for the diagnostics */
  readonly frameTimes: number[] = [];
  /** how long drawing one frame took (ms), the last ones */
  readonly drawCosts: number[] = [];
  private lastDraw = 0;
  /** what he is doing and where he looks; set from outside */
  mode: Mode = "idle";
  look: { yaw: number; pitch: number } | null = null;
  phase = 0;
  voice = 0;
  still = false;
  /** something moves him across the screen (the crossing, the arrival): lite drawing never pauses then */
  moving = false;
  /** reviews only (the test page): rotations added on top of the pose, to check each joint */
  extra: Pose["rot"] | null = null;
  /** called every frame before the pose (the crossing moves him from here) */
  onFrame: ((dt: number, stage: TashfeerStage) => void) | null = null;
  ready: Promise<void>;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true, premultipliedAlpha: true });
    this.renderer.setClearColor(0x000000, 0); // fully transparent: the page shows through
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    const gl = this.renderer.getContext();
    this.lite = softwareRenderer(gl) && !forceFullQuality();
    // the page's transitions read this: without a GPU, a full-screen blur would stall the screen (they skip it)
    if (softwareRenderer(gl)) document.documentElement.setAttribute("data-software-render", "");
    this.rendererName = rendererName(gl);
    this.renderer.setPixelRatio(this.lite ? 1 : Math.min(window.devicePixelRatio || 1, 1.75));
    if (!this.lite) {
      const pmrem = new PMREMGenerator(this.renderer);
      // a soft studio for the armour's reflections, kept low: the plates stay black (it was what made them silvery)
      this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.08).texture;
      this.scene.environmentIntensity = 0.18;
      pmrem.dispose();
    }
    const warm = token("--brand-text-silver", [0.79, 0.81, 0.79]);
    this.scene.add(new AmbientLight(warm, this.lite ? 0.55 : 0.3));
    // a soft key from the front, a faint fill: the black reads as black, the plates as shapes
    const key = new DirectionalLight(warm, 1.8);
    key.position.set(1.2, 2.6, 4);
    const fill = new DirectionalLight(warm, 0.35);
    fill.position.set(-2.5, 1.2, 2.5);
    this.scene.add(fill);
    // a neutral edge from behind (no green on the armour: a coloured light read as patches on the plates)
    const rim = new DirectionalLight(warm, 0.5);
    rim.position.set(-2.5, 2.2, -3);
    const rim2 = new DirectionalLight(warm, 0.25);
    rim2.position.set(2.8, 1.5, -2);
    this.scene.add(key, rim, rim2);
    // a small soft contact shadow under the feet — no floor, no dark slab
    this.shadow = new Mesh(new PlaneGeometry(0.95, 0.42), new MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false, opacity: 0.55 }));
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.002;
    this.root.add(this.shadow);
    this.scene.add(this.root);
    this.ready = loadTashfeer().then((gltf) => {
      const m = cloneSkinned(gltf.scene);
      // the model's middle is at its origin: stand him on the ground
      m.position.y = HEIGHT / 2;
      m.traverse((o) => {
        const mesh = o as Mesh;
        if (!mesh.isMesh) return;
        mesh.frustumCulled = false; // skinned: the bounds of the rest pose would cull a raised arm
        const mat = mesh.material as MeshStandardMaterial;
        if (mat.map) {
          // the armour, as in the owner's Meshy image: matte black with soft highlights. The scan's roughness map
          // (≈0.34, glossy) mirrored the room as silver streaks and its noise; a calmer even roughness instead
          mat.roughnessMap = null;
          mat.metalnessMap = null;
          mat.metalness = 0;
          mat.roughness = 0.58;
          mat.map.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
          mat.needsUpdate = true;
        }
        if (mat.emissiveMap) {
          // his lines glow in his own orange (the map only says where they are)
          mat.emissive = token("--tashfeer-glow", [1, 0.54, 0.1]);
          mat.emissiveIntensity = 0.8;
          this.emissive.push(mat);
        }
      });
      this.root.add(m);
      this.model = m;
      this.rig = new Rig(m);
    });
  }

  setMode(mode: Mode) {
    if (mode === this.mode) return;
    this.mode = mode;
    this.modeStart = this.now();
    this.dirtyUntil = performance.now() + 2500;
  }

  /** lite: drawing continues only this long after something changed (a new state, a new look) */
  private dirtyUntil = 0;
  private lastLook = "";

  private now() {
    return (performance.now() - this.t0) / 1000;
  }

  /** the canvas size (CSS px) and the box his whole body fills in it */
  frame(width: number, height: number, box?: Box) {
    this.size = { w: Math.max(1, width), h: Math.max(1, height) };
    this.box = box ?? { x: 0, y: 0, width: this.size.w, height: this.size.h };
    this.renderer.setSize(this.size.w, this.size.h, false);
    this.updateCamera();
  }

  /**
   * The camera that shows his body exactly in `box`: a camera made for the box (his height filling it), widened to
   * the whole canvas and shifted so the box lands where it is. World units: metres; he stands at the origin.
   */
  private updateCamera() {
    const { w, h } = this.size;
    const b = this.box;
    const margin = 1.02;
    const tanHalf = Math.tan(MathUtils.degToRad(FOV / 2));
    const dist = (HEIGHT * margin) / 2 / tanHalf;
    // the box camera has vertical fov FOV over b.height px; the canvas spans h px: widen accordingly
    const fullFov = MathUtils.radToDeg(2 * Math.atan((tanHalf * h) / b.height));
    const cam = this.camera;
    cam.fov = fullFov;
    cam.aspect = w / h;
    cam.position.set(0, HEIGHT / 2, dist);
    cam.lookAt(0, HEIGHT / 2, 0);
    // shift: the optical axis at the box's centre
    cam.setViewOffset(w, h, w / 2 - (b.x + b.width / 2), h / 2 - (b.y + b.height / 2), w, h);
    cam.updateProjectionMatrix();
  }

  /** world units per CSS px at his depth (at rest): to turn screen distances into steps */
  metresPerPx() {
    return (HEIGHT * 1.02) / this.box.height;
  }

  /** where a point of the world is drawn on the canvas (CSS px) */
  toScreen(p: Vector3) {
    const v = p.clone().project(this.camera);
    return { x: ((v.x + 1) / 2) * this.size.w, y: ((1 - v.y) / 2) * this.size.h };
  }

  /** look toward a point of the screen (CSS px on this canvas): a point in front of him at that place */
  lookAtScreen(x: number | null, y?: number) {
    if (x === null || y === undefined) {
      this.look = null;
      return;
    }
    const m = this.metresPerPx();
    const b = this.box;
    // the point, in the world at his depth, brought a metre toward the viewer (he faces the page, not into it)
    const tx = (x - (b.x + b.width / 2)) * m - this.root.position.x;
    const ty = HEIGHT - (y - b.y) * m;
    const head = new Vector3(0, HEIGHT * 0.9, 0);
    const dx = tx;
    const dz = 1.0;
    const yaw = MathUtils.clamp(Math.atan2(dx, dz), -1.0, 1.0);
    const pitch = MathUtils.clamp(Math.atan2(head.y - ty, Math.hypot(dx, dz)), -0.35, 0.45);
    this.look = { yaw, pitch };
  }

  start() {
    if (this.raf) return;
    this.last = performance.now();
    const loop = (now: number) => {
      this.raf = requestAnimationFrame(loop);
      // what he does and where he looks is updated every frame (cheap); drawing may be skipped below
      const raw = Math.max(0, (now - this.last) / 1000);
      this.last = now;
      this.onFrame?.(raw, this);
      // lite: about 6 frames a second at most (each one is expensive without a GPU), and none while nothing changes
      // (a moving crossing or arrival always draws)
      if (this.lite) {
        // without a GPU each drawn frame costs a quarter of a second of the page's time (the work happens when the
        // frame is handed over, so it cannot be timed here): a few frames a second while he moves across the screen,
        // about one a second otherwise — the page must stay responsive
        if (now - this.lastDraw < (this.moving ? 260 : 900)) return;
        const look = this.look ? `${this.look.yaw.toFixed(2)},${this.look.pitch.toFixed(2)}` : "";
        if (look !== this.lastLook) {
          this.lastLook = look;
          this.dirtyUntil = now + 1400;
        }
        if (!this.first && now > this.dirtyUntil && !this.moving) return;
      }
      const dt = Math.min(0.1, (now - (this.lastDraw || now)) / 1000);
      if (this.lastDraw) push(this.frameTimes, now - this.lastDraw);
      this.lastDraw = now;
      const t = performance.now();
      this.render(dt);
      push(this.drawCosts, performance.now() - t);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  /**
   * One frame: move, pose, draw. `real` is the true time since the last frame — movements across the screen follow it
   * (a slow device takes fewer, larger steps but arrives on time); the pose blending uses the capped `dt`.
   */
  tick(dt: number, real = dt) {
    this.onFrame?.(real, this);
    this.render(dt);
  }

  /** pose and draw (no movement) */
  private render(dt: number) {
    if (this.rig) {
      const target = pose({
        mode: this.mode,
        t: this.now(),
        since: this.now() - this.modeStart,
        look: this.look,
        phase: this.phase,
        voice: this.voice,
        still: this.still,
      });
      if (this.extra)
        for (const [k, v] of Object.entries(this.extra)) {
          const b = k as keyof Pose["rot"];
          const r = target.rot[b] ?? [0, 0, 0];
          target.rot[b] = [r[0] + v![0], r[1] + v![1], r[2] + v![2]];
        }
      this.rig.apply(target, dt, stiffness(this.mode), this.first || (this.still && this.mode !== "walking"));
      this.first = false;
      // the visor and lines glow a little more with the voice
      for (const m of this.emissive) m.emissiveIntensity = 0.8 + this.voice * 0.6;
    }
    this.renderer.render(this.scene, this.camera);
  }

  /** a still of him as he stands now, `w`×`h` px with a transparent background (PNG data URL) — for the stand-in */
  snapshot(w: number, h: number) {
    const keep = { ...this.size, box: this.box };
    this.renderer.setPixelRatio(1);
    this.frame(w, h);
    this.tick(0);
    const url = this.canvas.toDataURL("image/png");
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    this.frame(keep.w, keep.h, keep.box);
    return url;
  }

  /** draws once now (for a still frame) */
  draw() {
    this.tick(0);
  }

  get loaded() {
    return this.rig !== null;
  }

  dispose() {
    this.stop();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}

const push = (list: number[], v: number) => {
  list.push(v);
  if (list.length > 120) list.shift();
};

/** a soft round shadow (alpha only), drawn once */
let shadowTex: CanvasTexture | null = null;
function shadowTexture() {
  if (shadowTex) return shadowTex;
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 128;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(128, 64, 4, 128, 64, 120);
  // the page's own near-black, at falling strengths
  const bg = token("--brand-bg", [0.01, 0.02, 0.016]);
  const shade = (a: number) => `rgb(${Math.round(bg.r * 255)} ${Math.round(bg.g * 255)} ${Math.round(bg.b * 255)} / ${a})`;
  grad.addColorStop(0, shade(0.75));
  grad.addColorStop(0.5, shade(0.3));
  grad.addColorStop(1, shade(0));
  g.fillStyle = grad;
  g.setTransform(1, 0, 0, 0.5, 0, 32);
  g.fillRect(0, 0, 256, 256);
  shadowTex = new CanvasTexture(c);
  return shadowTex;
}
