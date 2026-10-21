"use client";

import { useEffect, useRef } from "react";
import {
  ALPHA_LEVELS,
  LINK_DISTANCE,
  PARTICLE_PARALLAX_PX,
  type Particle,
  alphaLevel,
  createParticles,
  dotAlpha,
  levelAlpha,
  linkAlpha,
  parallaxOffset,
  particleCount,
  stepParticles,
} from "@/lib/particles";
import { currentParallax, subscribeParallax } from "@/lib/pointer-parallax";
import styles from "./AmbientBackground.module.css";

const GLOW_PARALLAX_PX = 8;
const LINK_MAX = linkAlpha(0, 1, 1);
const DOT_MAX = dotAlpha(1);

/** Fixed, decorative background: light glows + particle network. Pointer = parallax only. */
export function AmbientBackground() {
  const rootRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const glow = glowRef.current;
    const ctx = canvas?.getContext("2d");
    if (!root || !canvas || !glow || !ctx) return;

    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const color = getComputedStyle(root).getPropertyValue("--brand-particle").trim();
    let width = 0;
    let height = 0;
    let particles: Particle[] = [];
    let raf = 0;
    let last = 0;
    // reused every frame: flat [x1, y1, x2, y2, …] segments and [x, y, r, …] dots per opacity level
    const lines = Array.from({ length: ALPHA_LEVELS }, () => [] as number[]);
    const dots = Array.from({ length: ALPHA_LEVELS }, () => [] as number[]);

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      particles = createParticles(particleCount(width, height), width, height);
    };

    const draw = () => {
      const pointer = motion.matches ? { x: 0, y: 0 } : currentParallax();
      ctx.clearRect(0, 0, width, height);
      if (!color) return;
      ctx.fillStyle = color;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      for (const bucket of lines) bucket.length = 0;
      for (const bucket of dots) bucket.length = 0;
      const pos = particles.map((p) => {
        const o = parallaxOffset(pointer, p.depth, PARTICLE_PARALLAX_PX);
        return { x: p.x + o.x, y: p.y + o.y, p };
      });
      for (let i = 0; i < pos.length; i++) {
        const a = pos[i]!;
        for (let j = i + 1; j < pos.length; j++) {
          const b = pos[j]!;
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          if (Math.abs(dx) > LINK_DISTANCE || Math.abs(dy) > LINK_DISTANCE) continue;
          const level = alphaLevel(linkAlpha(Math.hypot(dx, dy), a.p.depth, b.p.depth), LINK_MAX);
          if (level >= 0) lines[level]!.push(a.x, a.y, b.x, b.y);
        }
        const level = alphaLevel(dotAlpha(a.p.depth), DOT_MAX);
        if (level >= 0) dots[level]!.push(a.x, a.y, a.p.r);
      }
      for (let level = 0; level < ALPHA_LEVELS; level++) {
        const segs = lines[level]!;
        if (segs.length) {
          ctx.globalAlpha = levelAlpha(level, LINK_MAX);
          ctx.beginPath();
          for (let k = 0; k < segs.length; k += 4) {
            ctx.moveTo(segs[k]!, segs[k + 1]!);
            ctx.lineTo(segs[k + 2]!, segs[k + 3]!);
          }
          ctx.stroke();
        }
        const pts = dots[level]!;
        if (pts.length) {
          ctx.globalAlpha = levelAlpha(level, DOT_MAX);
          ctx.beginPath();
          for (let k = 0; k < pts.length; k += 3) {
            ctx.moveTo(pts[k]! + pts[k + 2]!, pts[k + 1]!);
            ctx.arc(pts[k]!, pts[k + 1]!, pts[k + 2]!, 0, Math.PI * 2);
          }
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    };

    const tick = (now: number) => {
      const frames = last ? Math.min(4, (now - last) / 16.67) : 1;
      last = now;
      particles = stepParticles(particles, frames, width, height);
      draw();
      raf = requestAnimationFrame(tick);
    };

    const start = () => {
      cancelAnimationFrame(raf);
      last = 0;
      root.dataset.ambientMotion = motion.matches ? "reduced" : "full";
      if (motion.matches || document.hidden) {
        draw();
        return;
      }
      raf = requestAnimationFrame(tick);
    };

    const unsubscribe = subscribeParallax((p) => {
      if (motion.matches) return;
      glow.style.transform = `translate3d(${(-p.x * GLOW_PARALLAX_PX).toFixed(2)}px, ${(-p.y * GLOW_PARALLAX_PX * 0.6).toFixed(2)}px, 0)`;
    });

    const onResize = () => {
      resize();
      draw();
    };
    const onMotion = () => {
      glow.style.transform = "";
      start();
    };

    resize();
    start();
    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", start);
    motion.addEventListener("change", onMotion);
    return () => {
      cancelAnimationFrame(raf);
      unsubscribe();
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", start);
      motion.removeEventListener("change", onMotion);
    };
  }, []);

  return (
    <div ref={rootRef} className={styles.root} aria-hidden="true" data-ambient-background="">
      <div ref={glowRef} className={styles.glows} data-parallax-layer="glow" />
      <canvas ref={canvasRef} className={styles.canvas} />
    </div>
  );
}
