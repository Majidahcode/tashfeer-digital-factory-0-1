"use client";

import { useEffect, useRef } from "react";
import {
  LIGHT_PARALLAX_PX,
  LIGHT_SCALE,
  type Light,
  type Rect,
  type Spark,
  type Tone,
  anchorLights,
  cellHeight,
  cellRange,
  depthOffset,
  hexToRgb,
  lightAt,
  lightFalloff,
  lightsForCell,
  quietFactor,
  scrollLag,
  sparkAt,
  sparksForCell,
} from "@/lib/atmosphere";
import { LINK_DISTANCE, PARTICLE_PARALLAX_PX, dotAlpha, linkAlpha } from "@/lib/particles";
import { currentParallax, subscribeParallax } from "@/lib/pointer-parallax";
import styles from "./AmbientBackground.module.css";

const TONE_TOKENS: Record<Tone, string> = {
  emerald: "--brand-emerald",
  bright: "--brand-emerald-bright",
  lime: "--brand-lime",
  highlight: "--brand-highlight",
};
/** Side of the light sprites (px): one smooth disc per tone, stretched to each field's ellipse. */
const SPRITE = 96;
/** The frame shown when motion is reduced (s). */
const STILL_T = 6;
/** Canvases grow in steps, so a page that grows (an opening panel) does not reallocate them on every frame. */
const ALLOC_STEP = 128;
/** Redraw interval (s): ≈ 30 fps, with a little slack so a 60 Hz display draws every second frame. */
const FRAME_S = 1 / 30 - 0.004;
/** Device pixels allowed for the spark canvas (≈ 17 MB); its resolution drops on very tall pages instead. */
const SPARK_BUDGET = 4_200_000;

type RGB = readonly [number, number, number];

/** A disc of one colour whose opacity follows lightFalloff, written pixel by pixel (no gradient dithering). */
function lightSprite(color: RGB): HTMLCanvasElement | null {
  const canvas = document.createElement("canvas");
  canvas.width = SPRITE;
  canvas.height = SPRITE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const img = ctx.createImageData(SPRITE, SPRITE);
  const c = (SPRITE - 1) / 2;
  for (let y = 0; y < SPRITE; y++) {
    for (let x = 0; x < SPRITE; x++) {
      const i = (y * SPRITE + x) * 4;
      img.data[i] = color[0];
      img.data[i + 1] = color[1];
      img.data[i + 2] = color[2];
      img.data[i + 3] = Math.round(255 * lightFalloff(Math.hypot(x - c, y - c) / (c + 0.5)));
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/**
 * The homepage's one background (owner's correction §8): a single layer behind the whole page — the portal, the
 * characters, the headline, the steps and everything between them — so there is no section boundary to see.
 *
 * Two canvases as long as the page: soft light fields (drawn at 1/8 resolution and scaled up — they have no detail)
 * and a fine network of rising sparks. They keep moving on their own; on a mouse or pen the field shifts by a
 * bounded depth parallax (far light least, near sparks most — never a glow at the cursor); while scrolling, far
 * light lags behind the page. Reduced motion: one still frame. The layer never takes pointer events.
 */
export function AmbientBackground() {
  const rootRef = useRef<HTMLDivElement>(null);
  const lightRef = useRef<HTMLCanvasElement>(null);
  const sparkRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const lightCanvas = lightRef.current;
    const sparkCanvas = sparkRef.current;
    const lightCtx = lightCanvas?.getContext("2d");
    const sparkCtx = sparkCanvas?.getContext("2d");
    if (!root || !lightCanvas || !sparkCanvas || !lightCtx || !sparkCtx) return;

    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const css = getComputedStyle(root);
    const rgb = (token: string): RGB | null => hexToRgb(css.getPropertyValue(token));
    const sprites = {} as Record<Tone, HTMLCanvasElement | null>;
    for (const tone of Object.keys(TONE_TOKENS) as Tone[]) {
      const color = rgb(TONE_TOKENS[tone]);
      sprites[tone] = color ? lightSprite(color) : null;
    }
    const spark = rgb("--brand-particle");
    const sparkColor = spark ? `rgb(${spark[0]}, ${spark[1]}, ${spark[2]})` : "";

    let width = 0;
    let height = 0;
    let allocH = 0;
    let dpr = 1;
    let lattice: Light[] = [];
    let anchors: Light[] = [];
    let sparks: Spark[] = [];
    let quiet: Rect | null = null;
    let raf = 0;
    let reported = "";

    const pageRect = (selector: string): Rect | null => {
      const el = document.querySelector(selector);
      const r = el?.getBoundingClientRect();
      if (!r || r.width === 0) return null;
      const origin = root.getBoundingClientRect();
      return { left: r.left - origin.left, top: r.top - origin.top, width: r.width, height: r.height };
    };

    const layout = () => {
      width = root.clientWidth;
      height = root.clientHeight;
      if (!width || !height) return;
      const cell = cellHeight(width);
      const [first, last] = cellRange(height, cell);
      lattice = [];
      sparks = [];
      for (let k = first; k <= last; k++) {
        lattice.push(...lightsForCell(k, width, cell));
        sparks.push(...sparksForCell(k, width, cell));
      }
      anchors = anchorLights(pageRect("[data-portal]"), pageRect("[data-hero-headline]"), pageRect("[data-scene-part=features]"));
      quiet = pageRect("[data-chat-shell]");

      const need = Math.ceil(height / ALLOC_STEP) * ALLOC_STEP;
      const nextDpr = Math.min(2, window.devicePixelRatio || 1, Math.sqrt(SPARK_BUDGET / (width * need)));
      if (need === allocH && lightCanvas.width === Math.ceil(width / LIGHT_SCALE) && nextDpr === dpr) return;
      allocH = need;
      dpr = nextDpr;
      lightCanvas.width = Math.ceil(width / LIGHT_SCALE);
      lightCanvas.height = Math.ceil(allocH / LIGHT_SCALE);
      sparkCanvas.width = Math.round(width * dpr);
      sparkCanvas.height = Math.round(allocH * dpr);
      for (const c of [lightCanvas, sparkCanvas]) c.style.blockSize = `${allocH}px`;
    };

    const paintLight = (l: Light, t: number, pointer: { x: number; y: number }, scrollY: number) => {
      const sprite = sprites[l.tone];
      if (!sprite) return;
      const p = lightAt(l, t);
      const o = depthOffset(pointer, l.depth, LIGHT_PARALLAX_PX);
      const x = p.x + o.x;
      const y = p.y + o.y + scrollLag(scrollY, l.depth);
      if (y + l.ry < 0 || y - l.ry > allocH || x + l.rx < 0 || x - l.rx > width) return;
      lightCtx.globalAlpha = Math.min(1, p.alpha);
      lightCtx.drawImage(sprite, x - l.rx, y - l.ry, 2 * l.rx, 2 * l.ry);
    };

    const draw = (t: number) => {
      if (!width || !allocH) return;
      const still = motion.matches;
      const pointer = still ? { x: 0, y: 0 } : currentParallax();
      const scrollY = still ? 0 : window.scrollY;

      // light: additive, like light
      lightCtx.setTransform(1, 0, 0, 1, 0, 0);
      lightCtx.globalCompositeOperation = "source-over";
      lightCtx.clearRect(0, 0, lightCanvas.width, lightCanvas.height);
      lightCtx.setTransform(1 / LIGHT_SCALE, 0, 0, 1 / LIGHT_SCALE, 0, 0);
      lightCtx.globalCompositeOperation = "lighter";
      lightCtx.imageSmoothingEnabled = true;
      for (const l of lattice) paintLight(l, t, pointer, scrollY);
      for (const l of anchors) paintLight(l, t, pointer, scrollY);
      lightCtx.globalAlpha = 1;

      // sparks: dots and the faint lines between near neighbours
      sparkCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      sparkCtx.clearRect(0, 0, width, allocH);
      if (sparkColor) {
        const pts: Array<{ x: number; y: number; d: number; f: number; r: number }> = [];
        for (const s of sparks) {
          const p = sparkAt(s, t);
          if (p.fade < 0.02) continue;
          const o = depthOffset(pointer, s.depth, PARTICLE_PARALLAX_PX);
          const x = p.x + o.x;
          const y = p.y + o.y;
          if (y < -LINK_DISTANCE || y > allocH + LINK_DISTANCE) continue;
          const f = p.fade * quietFactor(x, y, quiet);
          if (f < 0.02) continue;
          pts.push({ x, y, d: s.depth, f, r: s.r });
        }
        pts.sort((a, b) => a.y - b.y);
        sparkCtx.strokeStyle = sparkColor;
        sparkCtx.fillStyle = sparkColor;
        sparkCtx.lineWidth = 1;
        for (let i = 0; i < pts.length; i++) {
          const a = pts[i]!;
          for (let j = i + 1; j < pts.length; j++) {
            const b = pts[j]!;
            const dy = b.y - a.y;
            if (dy >= LINK_DISTANCE) break;
            const dx = b.x - a.x;
            if (Math.abs(dx) >= LINK_DISTANCE) continue;
            const alpha = linkAlpha(Math.hypot(dx, dy), a.d, b.d) * Math.min(a.f, b.f);
            if (alpha < 0.004) continue;
            sparkCtx.globalAlpha = alpha;
            sparkCtx.beginPath();
            sparkCtx.moveTo(a.x, a.y);
            sparkCtx.lineTo(b.x, b.y);
            sparkCtx.stroke();
          }
        }
        for (const p of pts) {
          sparkCtx.globalAlpha = dotAlpha(p.d) * p.f;
          sparkCtx.beginPath();
          sparkCtx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          sparkCtx.fill();
        }
        sparkCtx.globalAlpha = 1;
      }

      // the offset applied to the nearest depth, for tests and diagnostics (written only when it changes)
      const near = depthOffset(pointer, 1, LIGHT_PARALLAX_PX);
      const now = `${near.x.toFixed(1)} ${near.y.toFixed(1)}`;
      if (now !== reported) {
        reported = now;
        root.dataset.parallax = now;
      }
    };

    const clock = () => performance.now() / 1000;
    let last = 0;
    const tick = () => {
      // about 30 frames a second: the field moves a few pixels a second, so that is fluid, at half the work
      const t = clock();
      if (t - last >= FRAME_S) {
        last = t;
        draw(t);
      }
      raf = requestAnimationFrame(tick);
    };
    const start = () => {
      cancelAnimationFrame(raf);
      raf = 0;
      root.dataset.ambientMotion = motion.matches ? "reduced" : "full";
      if (motion.matches) {
        draw(STILL_T);
        return;
      }
      draw(clock()); // the first frame now, without waiting for a frame
      if (!document.hidden) raf = requestAnimationFrame(tick);
    };

    const relayout = () => {
      layout();
      draw(motion.matches ? STILL_T : clock());
    };

    const unsubscribe = subscribeParallax(() => {}); // keeps the shared pointer signal live; draw() reads it
    const observer = new ResizeObserver(relayout);
    observer.observe(root);
    const scene = document.querySelector("[data-scene]");
    if (scene) observer.observe(scene);

    layout();
    start();
    document.addEventListener("visibilitychange", start);
    motion.addEventListener("change", start);
    return () => {
      cancelAnimationFrame(raf);
      unsubscribe();
      observer.disconnect();
      document.removeEventListener("visibilitychange", start);
      motion.removeEventListener("change", start);
    };
  }, []);

  return (
    <div ref={rootRef} className={styles.root} aria-hidden="true" data-ambient-background="">
      <canvas ref={lightRef} className={styles.light} data-atmosphere-light="" />
      <canvas ref={sparkRef} className={styles.sparks} data-atmosphere-sparks="" />
    </div>
  );
}
