"use client";

import { useEffect, useRef, useState } from "react";
import { type Box, type Drawing, pointer } from "@/lib/speaker-arrow";
import styles from "./SpeakerArrow.module.css";

/*
 * «أنا» → Tashfeer: the headline's first word points at the robot who says it. The path is computed on the live
 * layout (src/lib/speaker-arrow.ts) in the scene's coordinates — the word, the robot and everything the line must
 * not touch are measured here — and redrawn whenever the scene changes size (breakpoints, fonts, the «كيف نبدأ؟»
 * panel opening).
 */

/** What the line must never cross (each measured only while it is visible). */
const GUARDS = [
  "h1 [data-gradient-text]:not([data-speaker-label])",
  "[data-scene-part=copy] p",
  "[data-disclosure-toggle]",
  "[data-portal]",
  "[data-chat-shell]",
  "[data-feature-card]",
  "[data-seated-customer]",
  "[data-scene-part=customer] button",
  "[data-phrase-index]",
].join(", ");

/**
 * The word's visible glyphs, not its box: the gradient lettering is padded beyond its ink (GradientText), and an
 * inline box is as tall as the font's ascent + descent. The baseline is the content area's top + the font's ascent;
 * the glyphs' real extent comes from the canvas, measured at 10× (canvas metrics are whole pixels).
 */
function glyphBox(label: HTMLElement): Box {
  const r = label.getBoundingClientRect();
  const cs = getComputedStyle(label);
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
  ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${Number.parseFloat(cs.fontSize) * 10}px ${cs.fontFamily}`;
  const m = ctx.measureText((label.textContent ?? "").trim());
  const baseline = r.top + Number.parseFloat(cs.paddingTop) + m.fontBoundingBoxAscent / 10;
  return { left: r.left, right: r.right, top: baseline - m.actualBoundingBoxAscent / 10, bottom: baseline + m.actualBoundingBoxDescent / 10 };
}

const visible = (el: Element) => {
  const cs = getComputedStyle(el);
  return cs.visibility !== "hidden" && cs.display !== "none";
};

export function SpeakerArrow() {
  const ref = useRef<SVGSVGElement>(null);
  const [drawing, setDrawing] = useState<Drawing | null>(null);

  useEffect(() => {
    const svg = ref.current;
    const scene = svg?.parentElement;
    const label = scene?.querySelector<HTMLElement>("[data-speaker-label]");
    const robot = scene?.querySelector<HTMLElement>("[data-tashfeer]");
    if (!scene || !label || !robot) return;
    // measured directly (no animation frame): ResizeObserver already reports after layout, and the drawing must not
    // wait on a frame clock
    const draw = () => {
      const r = robot.getBoundingClientRect();
      if (r.width === 0 || label.getBoundingClientRect().width === 0) return setDrawing(null);
      const o = scene.getBoundingClientRect();
      const local = (b: { left: number; right: number; top: number; bottom: number }): Box => ({
        left: b.left - o.left,
        right: b.right - o.left,
        top: b.top - o.top,
        bottom: b.bottom - o.top,
      });
      const guards = [...scene.querySelectorAll(GUARDS)]
        .filter(visible)
        .map((el) => el.getBoundingClientRect())
        .filter((b) => b.width > 0 && b.height > 0)
        .map(local);
      const bounds: Box = { left: 0, top: 0, right: o.width, bottom: o.height };
      setDrawing(pointer(local(glyphBox(label)), local(r), guards, bounds));
    };
    const observer = new ResizeObserver(draw);
    for (const el of [scene, label, robot]) observer.observe(el);
    robot.addEventListener("load", draw);
    void document.fonts?.ready.then(draw);
    draw();
    return () => {
      observer.disconnect();
      robot.removeEventListener("load", draw);
    };
  }, []);

  return (
    <svg ref={ref} className={styles.arrow} aria-hidden="true" focusable="false" data-speaker-arrow="">
      {drawing ? (
        <>
          <path d={drawing.line} data-arrow-line="" />
          <path d={drawing.tip} data-arrow-tip="" />
        </>
      ) : null}
    </svg>
  );
}
