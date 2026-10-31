"use client";

/**
 * Tashfeer as his real 3D model, in the box the screen gives him (the same box his picture had, so no layout moves).
 * Transparent: the page shows around him; only a small soft shadow at his feet. The canvas never takes a click.
 *
 * He follows the page's one controller (src/lib/tashfeer-controller.ts) and looks where its state says — at the seated
 * visitor, at the chat — found on the page where they are now (so on every screen size he looks the right way).
 * Until the model is ready, and wherever WebGL is missing or the model fails, a still of the same model stands in
 * (public/assets/characters/tashfeer-3d.webp, rendered from it — never the old picture).
 */
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { consumeArrival, prefersReducedMotion } from "@/lib/page-transition";
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

export function Tashfeer3D({ className, style }: { className?: string; style?: CSSProperties }) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "fallback">("loading");
  const [mood, setMood] = useState(tashfeerState().mood);

  useEffect(() => {
    const el = box.current;
    const cv = canvas.current;
    if (!el || !cv) return;
    if (!webglAvailable()) {
      // no WebGL here: the still stays (decided once, after mounting — the server cannot know)
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStatus("fallback");
      return;
    }
    // a new screen: the controller starts at rest (the crossing that brought him here is over)
    if (tashfeerState().mood === "leaving") sendTashfeer({ type: "reset" });
    const stage = new TashfeerStage(cv);
    // the internal test page may reach the stage, to check joints one by one (never on the visitor's screens)
    if (location.pathname.startsWith("/robot-animation-test")) (window as unknown as { __tashfeerStage?: TashfeerStage }).__tashfeerStage = stage;
    const still = prefersReducedMotion();
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

    stage.onFrame = (dt, s) => {
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
    const unsub = subscribeTashfeer(() => {
      const m = tashfeerState().mood;
      setMood(m);
      // crossing: his twin takes over on its own canvas; this one stops drawing (its last frame stays until hidden)
      if (m === "leaving") stage.stop();
    });

    return () => {
      alive = false;
      ro.disconnect();
      io.disconnect();
      unsub();
      document.removeEventListener("visibilitychange", onVis);
      stage.dispose();
    };
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
        data-visible={status === "ready" ? undefined : ""}
        decoding="async"
      />
      <canvas ref={canvas} className={styles.canvas} data-visible={status === "ready" ? "" : undefined} />
    </div>
  );
}
