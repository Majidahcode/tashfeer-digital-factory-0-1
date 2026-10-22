"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./SpeakerArrow.module.css";

/*
 * «أنا» → Tashfeer: the headline's first word points at the robot who says it.
 *
 * The pointer is drawn on the live layout (the distance between the word and the robot changes with every
 * breakpoint and screen width), in the scene's coordinates:
 *   - the robot below the word (wide screens, and 600–899 where the word sits above his head): the line leaves
 *     the word sideways toward him and descends onto the top of his head;
 *   - the word beside his head (<600): a short hook from the word curving down onto his chest.
 * The arrowhead follows the curve's end tangent, so it always points into the robot.
 *
 * Robot anatomy as fractions of its image box (measured on tashfeer-robot-original.png): head top centre
 * (0.50, 0.004); right edge of the upper chest (0.93, 0.28).
 */
const HEAD = { x: 0.5, y: 0.004 };
const CHEST = { x: 0.93, y: 0.28 }; // the right edge of his upper chest, beside the crossed arm
const HEAD_GAP = 10; // the arrowhead stops this far above the head
const TIP = 9; // arrowhead arm length
const TIP_ANGLE = (28 * Math.PI) / 180;

type Pt = { x: number; y: number };
type Box = { left: number; right: number; top: number; bottom: number };
type Drawing = { line: string; tip: string };

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

function compute(scene: DOMRect, label: Box, robot: DOMRect): Drawing {
  const L = { left: label.left - scene.left, right: label.right - scene.left, top: label.top - scene.top, h: label.bottom - label.top };
  const R = { left: robot.left - scene.left, top: robot.top - scene.top, w: robot.width, h: robot.height };
  const head = { x: R.left + HEAD.x * R.w, y: R.top + HEAD.y * R.h };
  const midY = L.top + 0.58 * L.h;
  let S: Pt;
  let E: Pt;
  let C1: Pt;
  let C2: Pt;
  if (head.y > L.top + L.h + 12) {
    // descend onto the head, leaving the word on the side facing the robot (or from below it when above him)
    E = { x: head.x, y: head.y - HEAD_GAP };
    if (head.x > L.right + 24) S = { x: L.right + 8, y: midY };
    else if (head.x < L.left - 24) S = { x: L.left - 8, y: midY };
    else S = { x: (L.left + L.right) / 2, y: L.top + L.h + 6 };
    const sideways = S.y === midY;
    C1 = sideways ? { x: S.x + 0.62 * (E.x - S.x), y: S.y } : { x: S.x, y: S.y + 0.45 * (E.y - S.y) };
    C2 = { x: E.x, y: E.y - 0.5 * (E.y - S.y) };
  } else {
    // beside the head: hook down onto his chest, on the side facing the word
    const toLeft = head.x < L.left;
    E = { x: R.left + (toLeft ? CHEST.x : 1 - CHEST.x) * R.w + (toLeft ? 4 : -4), y: R.top + CHEST.y * R.h };
    S = { x: toLeft ? L.left - 6 : L.right + 6, y: midY };
    C1 = { x: S.x + 0.55 * (E.x - S.x), y: S.y };
    C2 = { x: E.x + 0.15 * (S.x - E.x), y: E.y - 0.7 * (E.y - S.y) };
  }
  // arrowhead along the end tangent (E − C2)
  const len = Math.hypot(E.x - C2.x, E.y - C2.y) || 1;
  const ux = (E.x - C2.x) / len;
  const uy = (E.y - C2.y) / len;
  const arm = (sign: number) => {
    const c = Math.cos(sign * TIP_ANGLE);
    const s = Math.sin(sign * TIP_ANGLE);
    return { x: E.x - TIP * (ux * c - uy * s), y: E.y - TIP * (ux * s + uy * c) };
  };
  const a = arm(1);
  const b = arm(-1);
  const f = (p: Pt) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
  return { line: `M${f(S)} C${f(C1)} ${f(C2)} ${f(E)}`, tip: `M${f(a)} L${f(E)} L${f(b)}` };
}

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
      setDrawing(compute(scene.getBoundingClientRect(), glyphBox(label), r));
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
