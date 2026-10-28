"use client";

import { useEffect, useRef, useState } from "react";
import { type Box, type Drawing, alongCurve, pointer } from "@/lib/speaker-arrow";
import styles from "./SpeakerArrow.module.css";

/*
 * «أنا» → Tashfeer: the headline's first word points at the robot who says it. The path is computed on the live
 * layout (src/lib/speaker-arrow.ts) in the scene's coordinates — the word, the robot and everything the line must
 * not touch are measured here — and redrawn whenever the scene changes size (breakpoints, fonts, the «كيف نبدأ؟»
 * panel opening).
 */

/**
 * What the line must never cross (each measured only while it is visible). The ambient phrases are not among them:
 * they move, so it is they that keep clear of the line (src/lib/phrase-placement.ts), not the line of them.
 */
const GUARDS = [
  "h1 [data-gradient-text]:not([data-speaker-label])",
  "[data-scene-part=copy] p",
  "[data-disclosure-toggle]",
  "[data-portal]",
  "[data-chat-shell]",
  "[data-feature-card]",
  "[data-seated-customer]",
  "[data-scene-part=customer] button",
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

/**
 * The line's colour along its length (owner's request of 2026-10-29): the page's near-black where it leaves «أنا», so
 * it rises out of the background; forest green; emerald at the middle; lime over the last half; a touch of the
 * yellow-green highlight at the arrowhead. Brand tokens only (src/styles/tokens.css), mixed in OKLab between stops.
 */
const STOPS: readonly (readonly [number, string])[] = [
  [0, "--brand-bg"],
  [0.27, "--brand-digit-low"],
  [0.5, "--brand-emerald"],
  [0.74, "--brand-lime"],
  [1, "--arrow-end"],
];

function colourAt(at: number): string {
  for (let i = 1; i < STOPS.length; i++) {
    const [b, vb] = STOPS[i]!;
    const [a, va] = STOPS[i - 1]!;
    if (at <= b) {
      const p = Math.round(((at - a) / (b - a)) * 1000) / 10;
      return `color-mix(in oklab, var(${vb}) ${p}%, var(${va}))`;
    }
  }
  return `var(${STOPS[STOPS.length - 1]![1]})`;
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
          {/* the whole curve, for its geometry; it is drawn by the pieces below, each in its colour along the way */}
          <path d={drawing.line} className={styles.geometry} data-arrow-line="" />
          {alongCurve(drawing.curve).map(({ d, at }) => (
            <path key={at} d={d} style={{ stroke: colourAt(at) }} data-arrow-piece="" />
          ))}
          <path d={drawing.tip} className={styles.tip} data-arrow-tip="" />
        </>
      ) : null}
    </svg>
  );
}
