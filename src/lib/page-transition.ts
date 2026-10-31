/**
 * Moving between screens. Three kinds, chosen by where the visitor goes:
 *
 *   crossing   home → agents, after «ادخل»: Tashfeer walks to the portal, passes behind its ring into the opening, the
 *              camera follows him through, and he arrives on the agents screen — no portal there — in his place.
 *              Built from the parts that stand alone: TashfeerCharacter (data-tashfeer), PortalFrame (its ring art,
 *              data-portal-ring) and ChatShell. Tashfeer is his approved still image: there is no walk cycle or turn
 *              in the assets, so he glides (see the hand-off note in the delivery).
 *   forward    agents → team → prototypes → factory: a thin sheet of frosted glass settles over the screen, the next
 *              one appears under it, the glass clears (≈ 620 ms in all).
 *   back       any screen to an earlier one: the same glass, shorter (≈ 360 ms), never the crossing in reverse.
 *
 * With reduced motion: plain navigation. A transition never runs twice at once (repeated presses are ignored while
 * one plays), its layer always leaves (also when the next screen does not come: it gives up after 3 s and the
 * visitor stays where they were, their data untouched — it lives in the project store, not here). The current step
 * is written to <html data-scene-transition> so styles and tests can follow it.
 */
import { CONTENT_BOX, GLASS_BOX } from "./portal-geometry";
import { record } from "./diagnostics";
import { sendTashfeer } from "./tashfeer-controller";

export type TransitionStep = "idle" | "leaving" | "approachingPortal" | "behindFrame" | "cameraFollow" | "arriving";
export type TransitionKind = "crossing" | "forward" | "back";

type Navigate = (href: string) => void;

/** the journey's order: further along is forward */
const ORDER = ["/", "/agents", "/team", "/prototypes", "/factory"];

export function setTransitionStep(step: TransitionStep) {
  if (step === "idle") document.documentElement.removeAttribute("data-scene-transition");
  else document.documentElement.setAttribute("data-scene-transition", step);
}

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

const path = (href: string) => new URL(href, location.href).pathname.replace(/\/$/, "") || "/";

let busy = false;
let arrival: "portal" | null = null;

/** For the agents screen: whether Tashfeer has just come through the portal (asked once: the answer is then spent). */
export function consumeArrival(): "portal" | null {
  const a = arrival;
  arrival = null;
  return a;
}

/** Whether Tashfeer is on his way through the portal (without spending it). */
export function arrivalPending(): boolean {
  return arrival !== null;
}

/** Which transition goes from `from` to `to` (paths). */
export function kindOf(from: string, to: string): TransitionKind {
  if (from === "/" && to === "/agents") return "crossing";
  const a = ORDER.indexOf(from);
  const b = ORDER.indexOf(to);
  return a >= 0 && b >= 0 && b < a ? "back" : "forward";
}

/** Go to another screen with its transition; at once with reduced motion. */
export function transitionTo(href: string, navigate: Navigate) {
  if (busy) return;
  if (prefersReducedMotion()) {
    navigate(href);
    return;
  }
  const from = path(location.href);
  const to = path(href);
  let kind = kindOf(from, to);
  if (kind === "crossing" && !crossingParts()) kind = "forward";
  busy = true;
  document.documentElement.setAttribute("data-transition-kind", kind);
  const run = kind === "crossing" ? cross : kind === "forward" ? lightTo : dimTo;
  run(href, navigate)
    .catch(() => {})
    .finally(() => {
      busy = false;
      setTransitionStep("idle");
      document.documentElement.removeAttribute("data-transition-kind");
    });
}

// ── helpers ──────────────────────────────────────────────────────────────────────────────────────────────────────

const frames = (n = 2) =>
  new Promise<void>((r) => {
    const step = (k: number) => (k <= 0 ? r() : requestAnimationFrame(() => step(k - 1)));
    step(n);
  });
const ease = {
  inOut: "cubic-bezier(0.45, 0, 0.25, 1)",
  out: "cubic-bezier(0.2, 0.8, 0.2, 1)",
  in: "cubic-bezier(0.55, 0, 0.8, 0.2)",
};

/** Resolves true once the address is `href`'s, false after `ms`. */
function arrived(href: string, ms = 3000) {
  const target = path(href);
  const started = performance.now();
  return new Promise<boolean>((resolve) => {
    const check = () => {
      if (path(location.href) === target) resolve(true);
      else if (performance.now() - started > ms) resolve(false);
      else window.setTimeout(check, 16);
    };
    check();
  });
}

/** A full-screen layer for a transition (styled in globals.css); it takes pointer input while it plays. */
function layer(kind: string) {
  const el = document.createElement("div");
  el.className = `page-veil page-veil--${kind}`;
  el.setAttribute("data-page-veil", kind);
  el.setAttribute("aria-hidden", "true");
  document.body.appendChild(el);
  return el;
}

const play = (el: Element, frames: Keyframe[], options: KeyframeAnimationOptions) =>
  el.animate(frames, { fill: "forwards", ...options }).finished;

// ── forward: frosted glass ─────────────────────────────────────────────────────────────────────────────────────

/** A sheet of frosted glass settles over the screen, the next screen appears under it, the glass clears (≈620 ms). */
async function lightTo(href: string, navigate: Navigate) {
  const started = performance.now();
  const veil = layer("glass");
  try {
    setTransitionStep("leaving");
    await play(veil, [{ opacity: 0 }, { opacity: 1 }], { duration: 240, easing: ease.out });
    navigate(href);
    await arrived(href);
    await frames();
    setTransitionStep("arriving");
    await play(veil, [{ opacity: 1 }, { opacity: 0 }], { duration: 380, easing: ease.inOut });
  } finally {
    veil.remove();
    record({ transition: { kind: "forward", ms: Math.round(performance.now() - started) } });
  }
}

// ── back: the same glass, shorter ───────────────────────────────────────────────────────────────────────────────

async function dimTo(href: string, navigate: Navigate) {
  const started = performance.now();
  const veil = layer("glass-back");
  try {
    setTransitionStep("leaving");
    await play(veil, [{ opacity: 0 }, { opacity: 1 }], { duration: 140, easing: ease.out });
    navigate(href);
    await arrived(href);
    await frames();
    await play(veil, [{ opacity: 1 }, { opacity: 0 }], { duration: 220, easing: ease.out });
  } finally {
    veil.remove();
    record({ transition: { kind: "back", ms: Math.round(performance.now() - started) } });
  }
}

// ── home → agents: Tashfeer through the portal ─────────────────────────────────────────────────────────────────

function crossingParts() {
  const robot = document.querySelector<HTMLElement>("[data-tashfeer][data-tashfeer-3d=ready]");
  const portal = document.querySelector<HTMLElement>("[data-portal]");
  const ring = document.querySelector<HTMLImageElement>("[data-portal-ring]");
  const chat = document.querySelector<HTMLElement>("[data-chat-shell]");
  if (!robot || !portal || !ring || !ring.parentElement || !chat) return null;
  const r = robot.getBoundingClientRect();
  const p = portal.getBoundingClientRect();
  // both on screen: otherwise (scrolled away) the crossing would happen out of sight
  const visible = (b: DOMRect) => b.bottom > 0 && b.top < innerHeight && b.width > 0;
  if (!visible(r) || !visible(p)) return null;
  return { robot, portal, ring, ringBox: ring.parentElement, chat };
}

/**
 * Tashfeer — his 3D model, on a canvas over the whole screen that first shows him exactly where he stood — turns to
 * the portal and walks to its opening (his steps follow the ground covered: no sliding feet), turns his back to us
 * while still moving and walks in, behind the ring's band (a copy of the ring art is drawn above him; outside the
 * opening he is cut away). One continuous shot: the camera starts following him before he reaches the frame, keeps
 * moving forward with him, and passes through the opening — the frame grows past the screen's edges. Inside, a thin
 * sheet of frosted glass covers the change of page; the agents screen appears from within it, still moving forward,
 * then the camera slows and settles while he walks out of the depth to his place there.
 */
async function cross(href: string, navigate: Navigate) {
  const parts = crossingParts()!;
  const { robot, portal, ring, ringBox, chat } = parts;
  const main = document.querySelector<HTMLElement>("main");
  const header = document.querySelector<HTMLElement>("[data-site-header]");
  const R = robot.getBoundingClientRect();
  const P = portal.getBoundingClientRect();
  const t0 = performance.now();
  const steps: [string, number][] = [];
  const step = (name: TransitionStep) => {
    setTransitionStep(name);
    steps.push([name, Math.round(performance.now() - t0)]);
  };
  sendTashfeer({ type: "leave" });
  // the opening (the chat's glass, inside the ring)
  const hole = {
    x: P.left + (GLASS_BOX.left + GLASS_BOX.width / 2) * P.width,
    y: P.top + (GLASS_BOX.top + GLASS_BOX.height / 2) * P.height,
    rx: (GLASS_BOX.width / 2) * P.width * 0.94,
    ry: (GLASS_BOX.height / 2) * P.height * 0.94,
  };
  const floor = P.top + (CONTENT_BOX.top + CONTENT_BOX.height) * P.height; // where his feet go: the opening's lower part

  // the layer: Tashfeer's canvas, under a copy of the ring art; over them, the glass inside the opening
  const fx = layer("portal");
  const scene = document.createElement("div");
  scene.className = "page-veil__scene";
  const body = document.createElement("div");
  body.className = "page-veil__clip";
  const canvas = document.createElement("canvas");
  canvas.className = "page-veil__canvas";
  body.appendChild(canvas);
  const B = ringBox.getBoundingClientRect();
  const I = ring.getBoundingClientRect();
  const ringWrap = document.createElement("div");
  ringWrap.className = "page-veil__ring";
  Object.assign(ringWrap.style, { left: `${B.left}px`, top: `${B.top}px`, width: `${B.width}px`, height: `${B.height}px` });
  const ringCopy = ring.cloneNode() as HTMLImageElement;
  ringCopy.removeAttribute("data-portal-ring");
  ringCopy.removeAttribute("class");
  Object.assign(ringCopy.style, {
    position: "absolute",
    left: `${I.left - B.left}px`,
    top: `${I.top - B.top}px`,
    width: `${I.width}px`,
    height: `${I.height}px`,
    maxWidth: "none",
  });
  ringWrap.appendChild(ringCopy);
  scene.append(body, ringWrap);
  const glass = document.createElement("div");
  glass.className = "page-veil__glass";
  fx.append(scene, glass);

  // the copies are placed where the originals are now: the page must not scroll under them while it plays (input is
  // held, and any scroll that still happens — a focus, a script — is put back)
  const x0 = scrollX;
  const y0 = scrollY;
  const hold = (e: Event) => e.preventDefault();
  const pin = () => {
    if (scrollX !== x0 || scrollY !== y0) scrollTo(x0, y0);
  };
  addEventListener("wheel", hold, { passive: false });
  addEventListener("touchmove", hold, { passive: false });
  addEventListener("scroll", pin);
  const release = () => {
    removeEventListener("wheel", hold);
    removeEventListener("touchmove", hold);
    removeEventListener("scroll", pin);
  };

  let stage: import("@/components/characters/tashfeer3d/stage").TashfeerStage | null = null;
  const restore = () => {
    robot.style.visibility = "";
    for (const el of [main, header]) if (el) Object.assign(el.style, { transform: "", transformOrigin: "", opacity: "" });
    chat.getAnimations().forEach((a) => a.cancel());
    sendTashfeer({ type: "reset" });
  };

  try {
    // his stage over the whole screen, framed so he stands exactly in his box (the model is already loaded: shared)
    const { TashfeerStage } = await import("@/components/characters/tashfeer3d/stage");
    stage = new TashfeerStage(canvas);
    const W = innerWidth;
    const H = innerHeight;
    stage.frame(W, H, { x: R.left, y: R.top, width: R.width, height: R.height });
    await Promise.race([stage.ready, wait(2500).then(() => Promise.reject(new Error("model")))]);
    stage.draw();
    await frames(1);
    robot.style.visibility = "hidden"; // the page's Tashfeer gives way to his twin, in the same place and pose

    const m = stage.metresPerPx();
    const dx = (hole.x - (R.left + R.width / 2)) * m; // metres to walk across
    const side = Math.sign(dx) || 1;
    const STRIDE = 1.4; // metres per step cycle (two steps)
    const DEPTH = 3.4;
    // the shot (seconds): turning toward the portal, the walk across (it eases in and out: no sudden start or stop),
    // the turn into the portal begins while he still walks, the walk in, the camera through the opening
    const turnA = 0.55;
    const walkA = Math.max(0.7, Math.abs(dx) / 1.3);
    const turnB0 = turnA + walkA - 0.3;
    const turnB = 0.6;
    const walkB0 = turnA + walkA + 0.1;
    const walkB = 1.7;
    const through0 = walkB0 + walkB * 0.55;
    const through = 1.05;
    const end = through0 + through;
    // the camera's push (a scale around the opening), the same for the page and for his layer
    const camera = (t: number) =>
      t < walkB0
        ? 1 + 0.07 * smooth(t / walkB0)
        : t < through0
          ? 1.07 + 0.55 * smooth((t - walkB0) / (through0 - walkB0))
          : 1.62 * Math.pow(5.2, Math.pow(Math.min(1, (t - through0) / through), 1.6)); // accelerating through
    // the vertical offset that brings his feet to the opening's floor (a camera tilt: on a phone the portal is above)
    const lift = floor - hole.ry * 0.1 - R.bottom;
    if (main) {
      const M = main.getBoundingClientRect();
      main.style.transformOrigin = `${hole.x - M.left}px ${hole.y - M.top}px`;
    }
    scene.style.transformOrigin = `${hole.x}px ${hole.y}px`;

    let t = 0;
    let done: () => void = () => {};
    const finished = new Promise<void>((r) => (done = r));
    const st = stage;
    st.lookAtScreen(null);
    st.moving = true;
    let stepped = 0;
    let clipped = false;
    let x = 0;
    let z = 0;
    st.onFrame = (dt, s) => {
      t = Math.min(end, t + dt);
      const root = s.root;
      // where he is: across (eased), then in (a gentle start, then a steady pace)
      const nx = dx * smooth(Math.min(1, Math.max(0, (t - turnA * 0.6) / walkA)));
      const kz = Math.min(1, Math.max(0, (t - walkB0) / walkB));
      const nz = -DEPTH * (kz < 0.25 ? 2 * kz * kz : kz - 0.125) / 0.875;
      stepped += Math.abs(nx - x) + Math.abs(nz - z);
      x = nx;
      z = nz;
      root.position.x = x;
      root.position.z = z;
      s.phase = (stepped / STRIDE) % 1;
      // which way he faces: toward the portal, then away from us (into it)
      const faceA = side * (Math.PI / 2) * smooth(t / turnA);
      const faceB = side * (Math.PI / 2) * smooth((t - turnB0) / turnB);
      root.rotation.y = faceA + faceB;
      s.setMode(t < turnA * 0.6 ? "turning" : "walking");
      // the camera: forward with him, then through the opening
      const c = camera(t);
      const tilt = lift * smooth(Math.min(1, t / walkB0));
      canvas.style.transform = `translateY(${tilt}px)`;
      const zoom = `scale(${c})`;
      scene.style.transform = zoom;
      if (main) main.style.transform = zoom;
      if (header) header.style.opacity = String(1 - smooth((t - walkB0) / 0.6));
      // he passes behind the frame: outside the opening he is cut away
      if (!clipped && t >= turnB0) {
        clipped = true;
        const far = Math.hypot(W, H);
        play(
          body,
          [
            { clipPath: `ellipse(${far}px ${far}px at ${hole.x}px ${hole.y}px)` },
            { clipPath: `ellipse(${hole.rx}px ${hole.ry}px at ${hole.x}px ${hole.y}px)` },
          ],
          { duration: 700, easing: ease.out },
        );
      }
      // inside the opening, the frosted glass comes as the camera passes through (it hides the change of page)
      glass.style.opacity = String(smooth((t - through0 - through * 0.35) / (through * 0.65)));
      if (t >= walkB0 && steps.at(-1)?.[0] === "approachingPortal") step("behindFrame");
      if (t >= through0 && steps.at(-1)?.[0] === "behindFrame") step("cameraFollow");
      if (t >= end) done();
    };
    step("approachingPortal");
    st.start();
    play(chat, [{ opacity: 1 }, { opacity: 0 }], { duration: 500, easing: ease.out });
    await Promise.race([finished, wait(end * 1000 + 3000)]);

    // the agents screen, from within the glass: still moving forward, then settling, while he walks out of the depth
    stage.stop();
    arrival = "portal";
    navigate(href);
    release();
    const toNext = performance.now() - t0;
    if (!(await arrived(href))) {
      arrival = null;
      restore();
      await play(fx, [{ opacity: 1 }, { opacity: 0 }], { duration: 200 });
      return;
    }
    await frames();
    step("arriving");
    scene.remove();
    const next = document.querySelector<HTMLElement>("main");
    await Promise.all([
      next ? play(next, [{ transform: "scale(1.08)" }, { transform: "none" }], { duration: 760, easing: ease.out, fill: "none" }) : null,
      play(fx, [{ opacity: 1 }, { opacity: 0 }], { duration: 620, easing: ease.inOut }),
    ]);
    record({
      crossing: { toNext: Math.round(toNext), settled: Math.round(performance.now() - t0), steps, at: new Date().toISOString() },
    });
  } catch (e) {
    restore();
    throw e;
  } finally {
    release();
    stage?.dispose();
    fx.remove();
  }
}

const smooth = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const wait = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));
