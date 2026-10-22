"use client";

import { useEffect, useRef, useState } from "react";
import { cx } from "@/lib/cx";
import {
  AUTO_VISIBLE_MS,
  CYCLE_MS,
  POINTER_HOLD_MS,
  TOUCH_HOLD_MS,
  hitTest,
  nextIndex,
  revealSource,
  touchTarget,
} from "@/lib/phrase-cycle";
import { subscribeParallax } from "@/lib/pointer-parallax";
import styles from "./AmbientPhrases.module.css";

const PHRASE_PARALLAX_PX = 6;
/** ≥1280 slots, one per phrase, in AMBIENT_PHRASES order (the top-left slot went with the removed tagline). */
const SLOTS = [styles.s1, styles.s2, styles.s3, styles.s4];

type Props = { phrases: readonly string[]; className?: string };

/**
 * Environmental typography (master prompt R5).
 * - A: the auto cycle advances every 5 s on its own clock — pointer activity never resets it.
 * - B: pointer near a phrase reveals it early; leaving fades it after a short hold.
 * - Touch: tap reveals (no hover dependency). The layer never intercepts clicks.
 */
export function AmbientPhrases({ phrases, className }: Props) {
  const layerRef = useRef<HTMLDivElement>(null);
  const count = phrases.length;
  const [autoIndex, setAutoIndex] = useState(0);
  const [autoVisible, setAutoVisible] = useState(true);
  const [pointerIndex, setPointerIndex] = useState<number | null>(null);
  const [touchIndex, setTouchIndex] = useState<number | null>(null);
  const autoRef = useRef(0);

  // A — independent automatic cycle
  useEffect(() => {
    let hide = 0;
    const reveal = () => {
      setAutoVisible(true);
      window.clearTimeout(hide);
      hide = window.setTimeout(() => setAutoVisible(false), AUTO_VISIBLE_MS);
    };
    reveal();
    const iv = window.setInterval(() => {
      autoRef.current = nextIndex(autoRef.current, count);
      setAutoIndex(autoRef.current);
      reveal();
    }, CYCLE_MS);
    return () => {
      window.clearInterval(iv);
      window.clearTimeout(hide);
    };
  }, [count]);

  // B — pointer proximity + touch taps (hit-tested, so the layer stays pointer-events: none)
  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    const nodes = () => Array.from(layer.querySelectorAll<HTMLElement>("[data-phrase-index]"));
    let rects: DOMRect[] = [];
    const measure = () => {
      rects = nodes().map((n) => n.getBoundingClientRect());
    };
    let raf = 0;
    let leave = 0;
    let touchTimer = 0;
    let lastX = -1;
    let lastY = -1;

    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      lastX = e.clientX;
      lastY = e.clientY;
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        measure();
        const i = hitTest(rects, lastX, lastY);
        if (i >= 0) {
          window.clearTimeout(leave);
          leave = 0;
          setPointerIndex(i);
        } else if (!leave) {
          leave = window.setTimeout(() => {
            setPointerIndex(null);
            leave = 0;
          }, POINTER_HOLD_MS);
        }
      });
    };

    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== "touch") return;
      measure();
      const hits = rects
        .map((r, i) => (hitTest([r], e.clientX, e.clientY) === 0 ? i : -1))
        .filter((i) => i >= 0);
      const visible = nodes().findIndex((n) => n.dataset.state === "revealed");
      const i = touchTarget(hits, visible >= 0 ? visible : autoRef.current, count);
      if (i < 0) return;
      setTouchIndex(i);
      window.clearTimeout(touchTimer);
      touchTimer = window.setTimeout(() => setTouchIndex(null), TOUCH_HOLD_MS);
    };

    const unsubscribe = subscribeParallax((p) => {
      layer.style.transform = `translate3d(${(-p.x * PHRASE_PARALLAX_PX).toFixed(2)}px, ${(-p.y * PHRASE_PARALLAX_PX * 0.6).toFixed(2)}px, 0)`;
    });

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    return () => {
      unsubscribe();
      cancelAnimationFrame(raf);
      window.clearTimeout(leave);
      window.clearTimeout(touchTimer);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [count]);

  return (
    <div
      ref={layerRef}
      className={cx(styles.layer, className)}
      aria-hidden="true"
      data-ambient-phrases=""
      data-auto-index={autoIndex}
      data-parallax-layer="phrases"
    >
      {phrases.map((text, index) => {
        const source = revealSource({ index, autoIndex, autoVisible, pointerIndex, touchIndex });
        return (
          <span
            key={text}
            className={cx(styles.phrase, SLOTS[index % SLOTS.length])}
            data-phrase-index={index}
            data-state={source ? "revealed" : "ghost"}
            data-reveal-source={source ?? undefined}
          >
            {text}
          </span>
        );
      })}
    </div>
  );
}
