"use client";

/**
 * Tashfeer as his real 3D model, in the box the screen gives him (the same box his picture had, so no layout moves).
 * Transparent: the page shows around him; only a small soft shadow at his feet. The canvas never takes a click.
 *
 * He follows the page's one controller (src/lib/tashfeer-controller.ts) and looks where its state says — at the seated
 * visitor, at the chat — found on the page where they are now (so on every screen size he looks the right way).
 * Until the model is ready, and wherever WebGL is missing or the model fails, a still of the same model stands in
 * (public/characters/tashfeer-3d.webp, rendered from it — never the old picture).
 */
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { diagnosticsOn, record } from "@/lib/diagnostics";
import { arrivalPending, consumeArrival, prefersReducedMotion } from "@/lib/page-transition";
import { focusOf, sendTashfeer, subscribeTashfeer, tashfeerState, voiceLevelNow } from "@/lib/tashfeer-controller";
import type { Mode } from "./poses";
import { TashfeerStage } from "./stage";
import { STILL } from "./still";
import styles from "./Tashfeer3D.module.css";


const FOCUS_SELECTOR = { customer: "[data-seated-customer]", chat: "[data-chat-shell]" } as const;

function webglAvailable() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

/**
 * `attend`: something on the screen he reviews with the visitor when nothing else asks for his attention — he stands
 * three-quarters toward it (his body really turns, in 3D) and his head follows it calmly (the agents' strip: the card
 * at its centre). Small moves of the target (a drag) are ignored; his turn eases.
 */
export type Attend = { selector: string; fallback?: string };

export function Tashfeer3D({ className, style, attend }: { className?: string; style?: CSSProperties; attend?: Attend }) {
  const box = useRef<HTMLDivElement>(null);
  // on his way through the portal: no still at his place meanwhile (he walks there from the depth)
  const [status, setStatus] = useState<"loading" | "arriving" | "ready" | "fallback">(() =>
    typeof window !== "undefined" && arrivalPending() ? "arriving" : "loading",
  );
  const [mood, setMood] = useState(tashfeerState().mood);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    if (!webglAvailable()) {
      // no WebGL here: the still stays (decided once, after mounting — the server cannot know)
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStatus("fallback");
      return;
    }
    // a new screen: the controller starts at rest (the crossing that brought him here is over)
    if (tashfeerState().mood === "leaving") sendTashfeer({ type: "reset" });
    // he is set up once the screen is calm — after the opening and after a transition between screens — so his
    // setting up never holds up either (the still stands in meanwhile)
    let cleanup: (() => void) | null = null;
    let cancelled = false;
    const calm = () =>
      // (arriving through the portal is the exception: he must be ready to walk out of the depth as the glass clears)
      (!document.documentElement.hasAttribute("data-scene-transition") || arrivalPending()) &&
      window.__tashfeerIntro !== "play";
    const begin = () => {
      if (cancelled || cleanup) return;
      // a fresh canvas for each set-up: a canvas whose WebGL context was released (the previous set-up's clean-up,
      // React's development double run) cannot give a new one
      const cv = document.createElement("canvas");
      cv.className = styles.canvas ?? "";
      el.appendChild(cv);
      try {
        const undo = setUp(el, cv);
        cleanup = () => {
          undo();
          cv.remove();
        };
      } catch {
        // WebGL refused here (too many contexts, a driver failure): the still stays
        cv.remove();
        setStatus("fallback");
      }
    };
    const watch = new MutationObserver(() => calm() && begin());
    const onIntro = () => calm() && begin();
    if (calm()) begin();
    else {
      watch.observe(document.documentElement, { attributes: true, attributeFilter: ["data-scene-transition"] });
      window.addEventListener("tashfeer-intro", onIntro);
    }
    return () => {
      cancelled = true;
      watch.disconnect();
      window.removeEventListener("tashfeer-intro", onIntro);
      cleanup?.();
    };

    function setUp(el: HTMLDivElement, cv: HTMLCanvasElement) {
    const stage = new TashfeerStage(cv);
    // the internal test page may reach the stage, to check joints one by one (never on the visitor's screens)
    if (location.pathname.startsWith("/robot-animation-test")) (window as unknown as { __tashfeerStage?: TashfeerStage }).__tashfeerStage = stage;
    const still = prefersReducedMotion();
    // a software renderer: no idle sway (each frame is costly there; he moves only when something happens)
    stage.still = still;
    let alive = true;
    let visible = true;

    const fit = () => {
      const r = el.getBoundingClientRect();
      stage.frame(r.width, r.height);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);

    // just through the portal: he walks out of the depth to his place (not with reduced motion)
    const arriving = consumeArrival() === "portal" && !still;
    let arriveT = 0;
    const ARRIVE = 1.3;
    const FROM_Z = -2.6;
    const STRIDE = 1.4; // metres per step cycle
    if (arriving) stage.root.position.z = FROM_Z;

    const moodToMode = (m: string): Mode =>
      m === "listening" ? "listening" : m === "attending" ? "attending" : m === "thinking" ? "thinking" : m === "replying" ? "replying" : "idle";

    let aim: { x: number; y: number } | null = null;
    stage.onFrame = (dt, s) => {
      s.moving = arriving && arriveT < ARRIVE;
      if (arriving && arriveT < ARRIVE) {
        const before = s.root.position.z;
        arriveT = Math.min(ARRIVE, arriveT + dt);
        const k = arriveT / ARRIVE;
        const e = 1 - (1 - k) * (1 - k); // eases into his place
        s.root.position.z = FROM_Z * (1 - e);
        s.phase = (s.phase + Math.abs(s.root.position.z - before) / STRIDE) % 1;
        s.setMode(k < 0.92 ? "walking" : "idle");
        s.look = null;
        return;
      }
      const st = tashfeerState();
      s.setMode(moodToMode(st.mood));
      s.voice = voiceLevelNow();
      const focus = focusOf(st.mood);
      if (!focus && attend) {
        // reviewing with the visitor: a three-quarter stance toward the target, the head on it
        const t = (document.querySelector<HTMLElement>(attend.selector) ??
          (attend.fallback ? document.querySelector<HTMLElement>(attend.fallback) : null))?.getBoundingClientRect();
        const me = el.getBoundingClientRect();
        if (t && t.width) {
          const x = t.left + t.width / 2 - me.left;
          const y = t.top + t.height * 0.4 - me.top;
          // only a real move of the target re-aims him (no turn with every pixel of a drag)
          if (!aim || Math.hypot(x - aim.x, y - aim.y) > 36) aim = { x, y };
          const side = aim.x > me.width / 2 ? 1 : -1;
          const goal = Math.abs(aim.x - me.width / 2) < me.width * 0.6 ? side * 0.22 : side * 0.5; // ≈ 29° at most: three-quarters
          s.root.rotation.y += (goal - s.root.rotation.y) * (1 - Math.exp(-dt * 2.2));
          s.moving = Math.abs(goal - s.root.rotation.y) > 0.004; // (a software renderer keeps drawing while he turns)
          s.lookAtScreen(aim.x, aim.y);
          // the head's turn is what remains after the body's
          if (s.look) s.look = { yaw: Math.max(-0.7, Math.min(0.7, s.look.yaw - s.root.rotation.y)), pitch: s.look.pitch };
          return;
        }
      }
      // facing the visitor again (a state that turns him to the visitor or the chat), smoothly
      if (s.root.rotation.y !== 0) {
        s.root.rotation.y += (0 - s.root.rotation.y) * (1 - Math.exp(-dt * 2.2));
        if (Math.abs(s.root.rotation.y) < 0.002) s.root.rotation.y = 0;
        s.moving = s.root.rotation.y !== 0;
      }
      const target = focus ? document.querySelector<HTMLElement>(FOCUS_SELECTOR[focus]) : null;
      if (target) {
        const t = target.getBoundingClientRect();
        const me = el.getBoundingClientRect();
        // the visitor's face is near the top of their picture; the chat, at its middle
        const ty = focus === "customer" ? t.top + t.height * 0.25 : t.top + t.height * 0.5;
        s.lookAtScreen(t.left + t.width / 2 - me.left, ty - me.top);
      } else s.lookAtScreen(null);
    };

    stage.ready.then(
      () => {
        if (!alive) return;
        setStatus("ready");
        if (visible) stage.start();
        else stage.draw();
      },
      () => alive && setStatus("fallback"),
    );

    // drawn only while on screen and the tab is visible
    const io = new IntersectionObserver(([entry]) => {
      visible = !!entry?.isIntersecting && !document.hidden;
      if (!stage.loaded) return;
      if (visible) stage.start();
      else stage.stop();
    });
    io.observe(el);
    const onVis = () => {
      if (!stage.loaded) return;
      if (document.hidden) stage.stop();
      else if (visible) stage.start();
    };
    document.addEventListener("visibilitychange", onVis);
    // the hidden diagnostics (?diag=1): this device's real drawing of him, every second
    const diag = diagnosticsOn()
      ? window.setInterval(() => {
          const f = stage.frameTimes.slice(-60);
          const sorted = [...f].sort((a, b) => a - b);
          const avg = f.length ? f.reduce((a, b) => a + b, 0) / f.length : undefined;
          record({
            renderer: stage.rendererName,
            lite: stage.lite,
            fps: avg ? 1000 / avg : 0,
            frameAvg: avg,
            frameP95: sorted.length ? sorted[Math.floor(sorted.length * 0.95)] : undefined,
            drawCost: stage.drawCosts.length ? stage.drawCosts.reduce((a, b) => a + b, 0) / stage.drawCosts.length : undefined,
          });
        }, 1000)
      : 0;
    const unsub = subscribeTashfeer(() => {
      const m = tashfeerState().mood;
      setMood(m);
      // crossing: his twin takes over on its own canvas; this one stops drawing (its last frame stays until hidden)
      if (m === "leaving") stage.stop();
    });

    return () => {
      alive = false;
      window.clearInterval(diag);
      ro.disconnect();
      io.disconnect();
      unsub();
      document.removeEventListener("visibilitychange", onVis);
      stage.dispose();
    };
    }
    // `attend` is read once: a screen does not change what he reviews
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={box}
      className={`${styles.box} ${className ?? ""}`}
      style={style}
      role="img"
      aria-label="تشفير"
      data-tashfeer=""
      data-tashfeer-3d={status}
      data-tashfeer-state={mood}
    >
      {/* the still of the same model: until he is ready, or instead of him where WebGL is missing */}
      {/* eslint-disable-next-line @next/next/no-img-element -- a fixed still, sized by the box */}
      <img
        className={styles.still}
        src={STILL.src}
        width={STILL.width}
        height={STILL.height}
        alt=""
        data-visible={status === "ready" || status === "arriving" ? undefined : ""}
        decoding="async"
      />
    </div>
  );
}
