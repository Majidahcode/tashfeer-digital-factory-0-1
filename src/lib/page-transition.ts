/**
 * Moving between screens. Three kinds, chosen by where the visitor goes:
 *
 *   crossing   home → agents, after «ادخل»: Tashfeer walks to the portal, passes behind its ring into the opening, the
 *              camera follows him through, and he arrives on the agents screen — no portal there — in his place.
 *              Built from the parts that stand alone: TashfeerCharacter (data-tashfeer), PortalFrame (its ring art,
 *              data-portal-ring) and ChatShell. Tashfeer is his approved still image: there is no walk cycle or turn
 *              in the assets, so he glides (see the hand-off note in the delivery).
 *   forward    agents → team → prototypes → factory: a soft touch of brand light that rises before the next screen and
 *              melts as it appears (≈ 550 ms in all).
 *   back       any screen to an earlier one: a short dim (≈ 300 ms), never the crossing in reverse.
 *
 * With reduced motion: plain navigation. A transition never runs twice at once (repeated presses are ignored while
 * one plays), its layer always leaves (also when the next screen does not come: it gives up after 3 s and the
 * visitor stays where they were, their data untouched — it lives in the project store, not here). The current step
 * is written to <html data-scene-transition> so styles and tests can follow it.
 */
import { CONTENT_BOX, GLASS_BOX } from "./portal-geometry";

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

// ── forward: a soft touch of light ──────────────────────────────────────────────────────────────────────────────

async function lightTo(href: string, navigate: Navigate) {
  const veil = layer("light");
  try {
    setTransitionStep("leaving");
    await play(veil, [{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: ease.out });
    navigate(href);
    await arrived(href);
    await frames();
    setTransitionStep("arriving");
    await play(veil, [{ opacity: 1 }, { opacity: 0 }], { duration: 340, easing: ease.inOut });
  } finally {
    veil.remove();
  }
}

// ── back: a short dim ───────────────────────────────────────────────────────────────────────────────────────────

async function dimTo(href: string, navigate: Navigate) {
  const veil = layer("dim");
  try {
    setTransitionStep("leaving");
    await play(veil, [{ opacity: 0 }, { opacity: 1 }], { duration: 120, easing: ease.out });
    navigate(href);
    await arrived(href);
    await frames();
    await play(veil, [{ opacity: 1 }, { opacity: 0 }], { duration: 180, easing: ease.out });
  } finally {
    veil.remove();
  }
}

// ── home → agents: Tashfeer through the portal ─────────────────────────────────────────────────────────────────

function crossingParts() {
  const robot = document.querySelector<HTMLImageElement>("img[data-tashfeer]");
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

async function cross(href: string, navigate: Navigate) {
  const parts = crossingParts()!;
  const { robot, portal, ring, ringBox, chat } = parts;
  const main = document.querySelector<HTMLElement>("main");
  const header = document.querySelector<HTMLElement>("[data-site-header]");
  const R = robot.getBoundingClientRect();
  const P = portal.getBoundingClientRect();
  // the opening (the chat's glass, inside the ring) and where Tashfeer stands in it
  const hole = {
    x: P.left + (GLASS_BOX.left + GLASS_BOX.width / 2) * P.width,
    y: P.top + (GLASS_BOX.top + GLASS_BOX.height / 2) * P.height,
    rx: (GLASS_BOX.width / 2) * P.width * 0.94,
    ry: (GLASS_BOX.height / 2) * P.height * 0.94,
  };
  const content = { bottom: P.top + (CONTENT_BOX.top + CONTENT_BOX.height) * P.height };

  // the layer: Tashfeer (a copy of his picture, where he stands), under a copy of the ring art, under the light
  const fx = layer("portal");
  const scene = document.createElement("div");
  scene.className = "page-veil__scene";
  const body = document.createElement("div");
  body.className = "page-veil__clip";
  const twin = robot.cloneNode() as HTMLImageElement;
  twin.removeAttribute("data-tashfeer");
  twin.removeAttribute("class");
  twin.removeAttribute("style");
  twin.className = "page-veil__robot";
  Object.assign(twin.style, { left: `${R.left}px`, top: `${R.top}px`, width: `${R.width}px`, height: `${R.height}px` });
  body.appendChild(twin);
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
  const light = document.createElement("div");
  light.className = "page-veil__light";
  light.style.setProperty("--hx", `${hole.x}px`);
  light.style.setProperty("--hy", `${hole.y}px`);
  fx.append(scene, light);
  robot.style.visibility = "hidden";
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

  const restore = () => {
    robot.style.visibility = "";
    if (main) main.style.transformOrigin = "";
    for (const el of [main, header, chat]) el?.getAnimations().forEach((a) => a.cancel());
  };

  try {
    // 1 — to the portal: he goes to the opening, a little smaller as he goes in, passing behind the ring's band
    setTransitionStep("approachingPortal");
    const s1 = Math.min(1, (hole.ry * 1.25) / R.height);
    const end1 = { x: hole.x - (R.left + R.width / 2), y: content.bottom - hole.ry * 0.15 - (R.top + R.height) };
    const t1 = `translate(${end1.x}px, ${end1.y}px) scale(${s1})`;
    twin.style.transformOrigin = "50% 100%";
    await Promise.all([
      play(twin, [{ transform: "none" }, { transform: t1 }], { duration: 720, easing: ease.inOut }),
      play(chat, [{ opacity: 1 }, { opacity: 0 }], { duration: 560, easing: ease.out }),
    ]);

    // 2 — through: into the depth of the opening; outside it he is hidden behind the frame
    setTransitionStep("behindFrame");
    const s2 = s1 * 0.42;
    const t2 = `translate(${end1.x}px, ${end1.y - hole.ry * 0.25}px) scale(${s2})`;
    const far = Math.hypot(innerWidth, innerHeight);
    await Promise.all([
      play(twin, [{ transform: t1, opacity: 1 }, { transform: t2, opacity: 0.9 }], { duration: 460, easing: ease.in }),
      play(
        body,
        [
          { clipPath: `ellipse(${far}px ${far}px at ${hole.x}px ${hole.y}px)` },
          { clipPath: `ellipse(${hole.rx}px ${hole.ry}px at ${hole.x}px ${hole.y}px)` },
        ],
        { duration: 380, easing: ease.out },
      ),
    ]);

    // 3 — the camera follows him through: the scene comes closer around the opening, its light fills the view
    setTransitionStep("cameraFollow");
    // the same zoom on the page and on the layer, both around the opening's centre (each in its own box)
    if (main) {
      const M = main.getBoundingClientRect();
      main.style.transformOrigin = `${hole.x - M.left}px ${hole.y - M.top}px`;
    }
    scene.style.transformOrigin = `${hole.x}px ${hole.y}px`;
    const zoom: Keyframe[] = [{ transform: "none" }, { transform: "scale(2.6)" }];
    await Promise.all([
      main ? play(main, zoom, { duration: 650, easing: ease.in }) : null,
      play(scene, zoom, { duration: 650, easing: ease.in }),
      header ? play(header, [{ opacity: 1 }, { opacity: 0 }], { duration: 400 }) : null,
      play(light, [{ opacity: 0 }, { opacity: 1 }], { duration: 650, easing: ease.in }),
    ]);

    // 4 — the agents screen: Tashfeer arrives in his place (AgentSelection), the light melts
    arrival = "portal";
    navigate(href);
    release();
    if (!(await arrived(href))) {
      arrival = null;
      restore();
      await play(fx, [{ opacity: 1 }, { opacity: 0 }], { duration: 200 });
      return;
    }
    await frames();
    setTransitionStep("arriving");
    scene.remove();
    await play(fx, [{ opacity: 1 }, { opacity: 0 }], { duration: 480, easing: ease.inOut });
  } catch (e) {
    restore();
    throw e;
  } finally {
    release();
    fx.remove();
  }
}
