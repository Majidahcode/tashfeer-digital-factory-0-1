"use client";

import { useEffect, useRef } from "react";
import {
  LINK_DISTANCE,
  PARTICLE_PARALLAX_PX,
  type Particle,
  createParticles,
  dotAlpha,
  linkAlpha,
  parallaxOffset,
  particleCount,
  stepParticles,
} from "@/lib/particles";
import { currentParallax, subscribeParallax } from "@/lib/pointer-parallax";
import styles from "./AmbientBackground.module.css";

const GLOW_PARALLAX_PX = 8;

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
          const alpha = linkAlpha(Math.hypot(dx, dy), a.p.depth, b.p.depth);
          if (alpha <= 0) continue;
          ctx.globalAlpha = alpha;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
      for (const { x, y, p } of pos) {
        ctx.globalAlpha = dotAlpha(p.depth);
        ctx.beginPath();
        ctx.arc(x, y, p.r, 0, Math.PI * 2);
        ctx.fill();
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
