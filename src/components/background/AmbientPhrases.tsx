"use client";

import { type CSSProperties, useEffect, useRef, useState } from "react";
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
import {
  type Box,
  EDGE_BOTTOM,
  EDGE_TOP,
  EDGE_X,
  FreeSpace,
  PHRASE_GAP,
  type Rect,
  type Size,
  inflate,
  overlaps,
  pickPosition,
  rectOf,
  regionOf,
  seedFor,
  withAir,
} from "@/lib/phrase-placement";
import { subscribeParallax } from "@/lib/pointer-parallax";
import styles from "./AmbientPhrases.module.css";

const PHRASE_PARALLAX_PX = 6;
/** A phrase moves only once it has faded out completely (--dur-phrase is 900 ms): never in sight. */
const MOVE_AFTER_MS = 1000;
/**
 * What a phrase keeps clear of (each measured only while it shows): the header, the copy, the «كيف نبدأ؟» panel, the
 * portal and its chat, Tashfeer, the customer and his voice pill, the steps, and every control. The «أنا» arrow is
 * added point by point along its line, the ring's glow pixel by pixel (readGlow).
 */
const OBSTACLES = [
  "[data-site-header]",
  "h1[data-hero-headline]",
  "[data-speaker-label]",
  "[data-scene-part=copy] p",
  "[data-disclosure-toggle]",
  "[data-disclosure-panel]",
  "[data-portal]",
  "[data-chat-shell]",
  "[data-tashfeer]",
  "[data-seated-customer]",
  "[data-scene-part=customer] button",
  "[data-feature-card]",
  "button",
  "a[href]",
  "textarea",
].join(", ");
/** Below 900 (--phrase-rows) the copy block and the steps own their whole rows: no phrase beside a line of copy. */
const ROWS = "[data-copy-text], [data-scene-part=features]";
/**
 * The composition's lowest parts: from 900 up (--phrase-floor) the phrases stay above them — no footer strip — unless
 * the space above leaves fewer regions than there are phrases (a short laptop screen), when the strip below counts too.
 */
const FLOOR = "[data-tashfeer], [data-seated-customer], [data-portal], [data-feature-card], [data-copy-text]";
/** A phrase is drawn under the ring: it stays where the ring's pixels are under 25 % opaque (P1-16 allows 30 %). */
const GLOW_LIMIT = 64;
const GLOW_BLOCK = 8;

/** The ring image's opacity, max-pooled over GLOW_BLOCK-px blocks: one pixel read per visit, then cheap lookups. */
type Glow = { alpha: Uint8Array; cols: number; rows: number; width: number; height: number };

function readGlow(img: HTMLImageElement): Glow | null {
  const width = img.naturalWidth;
  const height = img.naturalHeight;
  if (!width || !height) return null;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0);
    const px = ctx.getImageData(0, 0, width, height).data;
    const cols = Math.ceil(width / GLOW_BLOCK);
    const rows = Math.ceil(height / GLOW_BLOCK);
    const alpha = new Uint8Array(cols * rows);
    for (let y = 0; y < height; y++) {
      const row = Math.floor(y / GLOW_BLOCK) * cols;
      for (let x = 0; x < width; x++) {
        const a = px[(y * width + x) * 4 + 3]!;
        const i = row + Math.floor(x / GLOW_BLOCK);
        if (a > alpha[i]!) alpha[i] = a;
      }
    }
    return { alpha, cols, rows, width, height };
  } catch {
    return null; // unreadable pixels: the ring's whole box stays blocked
  }
}

/** The brightest glow under a rectangle of the layer (0–255), given the ring image's box in the layer. */
function glowUnder(glow: Glow, ring: Rect, r: Rect): number {
  const sx = glow.width / (ring.x1 - ring.x0) / GLOW_BLOCK;
  const sy = glow.height / (ring.y1 - ring.y0) / GLOW_BLOCK;
  const c0 = Math.max(0, Math.floor((r.x0 - ring.x0) * sx));
  const c1 = Math.min(glow.cols - 1, Math.floor((r.x1 - ring.x0) * sx));
  const r0 = Math.max(0, Math.floor((r.y0 - ring.y0) * sy));
  const r1 = Math.min(glow.rows - 1, Math.floor((r.y1 - ring.y0) * sy));
  let max = 0;
  for (let y = r0; y <= r1; y++) for (let x = c0; x <= c1; x++) max = Math.max(max, glow.alpha[y * glow.cols + x]!);
  return max;
}

/** One line, or two balanced lines (--stack-w breaks it) for a narrow space — only where --phrase-stack allows. */
type Shape = "line" | "stack";
type ShapeSize = Size & { stackW?: number };
/** A phrase's place: its box in the layer, and the shape it takes there. */
type Slot = Box & { shape: Shape; stackW?: number };
/**
 * Why a phrase needs a place: `strict` — the layout is new or changed (clear of every other phrase); `reveal` — it is
 * about to appear; `move` — it has just faded out where the waiting phrases are drawn, and waits elsewhere.
 */
type Mode = "strict" | "reveal" | "move";
/** A new place, the waiting phrases in its way (they move as well), and whether they must fade out first. */
type Plan = { slot: Slot; blocking: number[]; fade: boolean };

/** The measured layout, in the layer's coordinates (its top-left corner is the scene's). */
type Geometry = {
  width: number;
  height: number;
  obstacles: Rect[];
  ring: Rect | null;
  /** where the composition ends (--phrase-floor), in layer px; null where the page's end is the limit */
  floor: number | null;
  /** each phrase's size in each shape this layout allows */
  shapes: Partial<Record<Shape, ShapeSize>>[];
  /** the waiting phrases are drawn (--phrase-ghosts): each keeps a place clear of the others even while it waits */
  ghosts: boolean;
  free: FreeSpace | null;
  /** each phrase's places in the free space, before the floor rule (candidatesFor applies it) */
  places: (Slot[] | null)[];
  candidates: (Slot[] | null)[];
};

/** A layout rule from the stylesheet (AmbientPhrases.module.css: --phrase-*), so the breakpoints live in CSS only. */
const knob = (el: Element, name: string) => getComputedStyle(el).getPropertyValue(name).trim() === "1";

/**
 * A phrase's size as one line and, when allowed, as two balanced lines — measured on a hidden copy with the same
 * class in the same layer, so the font, its size and the wrapping are exactly the rendered ones.
 */
function measureShapes(layer: HTMLElement, className: string, text: string, stack: boolean) {
  const probe = document.createElement("span");
  probe.className = className;
  probe.dataset.phraseProbe = "";
  probe.style.visibility = "hidden";
  probe.textContent = text;
  layer.appendChild(probe);
  const line = { w: probe.offsetWidth, h: probe.offsetHeight };
  const out: Partial<Record<Shape, ShapeSize>> = { line };
  if (stack && line.w && line.h) {
    probe.dataset.shape = "stack";
    // the narrowest width (from half the line) that still breaks it into two lines, not three
    for (let f = 0.5; f <= 0.8; f += 0.05) {
      const w = Math.ceil(line.w * f);
      probe.style.setProperty("--stack-w", `${w}px`);
      if (probe.offsetHeight <= 2 * line.h) {
        out.stack = { w: probe.offsetWidth, h: probe.offsetHeight, stackW: w };
        break;
      }
    }
  }
  probe.remove();
  return out;
}

type Props = { phrases: readonly string[]; className?: string };

/**
 * Environmental typography (master prompt R5; owner's correction of 2026-10-23).
 * - A: the auto cycle advances every 5 s on its own clock — pointer activity never resets it.
 * - B: pointer near a phrase reveals it early; leaving fades it after a short hold.
 * - Touch: tap reveals (no hover dependency). The layer never intercepts clicks.
 * - Where: each phrase has a place in the page's free space (src/lib/phrase-placement.ts), drawn from a seeded PRNG,
 *   preferring the visible part of the page and a region other than where the last phrases were seen. The places
 *   follow the layout: measured again whenever it changes, and a phrase whose place is no longer clear moves at once.
 * - Where the waiting phrases are drawn, faintly (--phrase-ghosts, from 1440 up, where there is room for it), each
 *   keeps a place of its own: after each appearance it fades out completely and moves, unseen, to where it will
 *   appear next; a faint phrase in the way fades out and moves too. Below 1440 waiting phrases are not drawn, so at
 *   each turn they first take places of their own (the most constrained first) and the appearing phrase takes a new
 *   place among those left — that is how a laptop's few free spaces, or a phone's bays, take every phrase in turn
 *   without leaving one without room.
 * - Each appearance lands in the farther half of its region from where the last one was seen, so it visibly travels.
 */
export function AmbientPhrases({ phrases, className }: Props) {
  const layerRef = useRef<HTMLDivElement>(null);
  const count = phrases.length;
  const [autoIndex, setAutoIndex] = useState(0);
  const [autoVisible, setAutoVisible] = useState(true);
  const [pointerIndex, setPointerIndex] = useState<number | null>(null);
  const [touchIndex, setTouchIndex] = useState<number | null>(null);
  const [slots, setSlots] = useState<(Slot | null)[]>(() => phrases.map(() => null));
  const [moving, setMoving] = useState<number[]>([]);
  const [measured, setMeasured] = useState(false);
  const autoRef = useRef(0);
  const autoVisibleRef = useRef(true);
  const pointerRef = useRef<number | null>(null);
  const touchRef = useRef<number | null>(null);
  useEffect(() => {
    pointerRef.current = pointerIndex;
    touchRef.current = touchIndex;
  }, [pointerIndex, touchIndex]);

  // placement state, shared by the effects below (refs: read and written outside React's render)
  const slotsRef = useRef<(Slot | null)[]>(phrases.map(() => null));
  const geo = useRef<Geometry | null>(null);
  const glowRef = useRef<Glow | null>(null);
  const appearances = useRef<number[]>(phrases.map(() => 0));
  /** regions (regionOf) where the latest phrases were seen, newest first; and the latest one's box */
  const lastSeen = useRef<number[]>([]);
  const lastBox = useRef<Rect | null>(null);
  const beforeRevealRef = useRef<(i: number) => void>(() => {});
  const planRef = useRef<(i: number) => Plan | null>(() => null);
  const applyRef = useRef<(i: number, plan: Plan | null) => void>(() => {});
  const drawnRef = useRef<() => boolean>(() => false);

  // Where — measure the layout, keep every phrase in a clear place
  useEffect(() => {
    const layer = layerRef.current;
    const scene = layer?.parentElement;
    if (!layer || !scene) return;
    const nodes = () => Array.from(layer.querySelectorAll<HTMLElement>("[data-phrase-index]"));
    const phraseClass = styles.phrase ?? "";
    let shapes: { key: string; sizes: Geometry["shapes"] } = { key: "", sizes: [] };

    const setSlot = (i: number, s: Slot | null) => {
      slotsRef.current[i] = s;
      setSlots([...slotsRef.current]);
    };

    /** Shown right now (appearing, or revealed by the pointer or a tap) — as opposed to waiting. */
    const isShown = (j: number) =>
      (autoVisibleRef.current && autoRef.current === j) || pointerRef.current === j || touchRef.current === j;

    const freeSpace = (g: Geometry): FreeSpace => {
      if (g.free) return g.free;
      const f = new FreeSpace(g.width, g.height);
      for (const r of g.obstacles) f.block(r);
      const ring = g.ring;
      const glow = glowRef.current;
      if (ring && glow) {
        // every block of the ring's image brighter than the limit, mapped onto the layer
        const sx = ((ring.x1 - ring.x0) / glow.width) * GLOW_BLOCK;
        const sy = ((ring.y1 - ring.y0) / glow.height) * GLOW_BLOCK;
        for (let r = 0; r < glow.rows; r++)
          for (let c = 0; c < glow.cols; c++)
            if (glow.alpha[r * glow.cols + c]! > GLOW_LIMIT)
              f.block({ x0: ring.x0 + c * sx, y0: ring.y0 + r * sy, x1: ring.x0 + (c + 1) * sx, y1: ring.y0 + (r + 1) * sy });
      } else if (ring) f.block(ring); // until the ring's pixels are read: its whole box
      g.free = f;
      return f;
    };

    /**
     * Every place the free space allows this phrase, in each shape this layout allows — on a coarser lattice on wide
     * screens, where the free space is large and a few pixels change nothing.
     */
    const placesFor = (g: Geometry, i: number): Slot[] =>
      (g.places[i] ??= (() => {
        const free = freeSpace(g);
        const wide = g.width >= 1280;
        const out: Slot[] = [];
        for (const shape of ["line", "stack"] as const) {
          const size = g.shapes[i]?.[shape];
          if (!size?.w) continue;
          for (const p of free.positions(size, wide ? 8 : 4, wide ? 4 : 2))
            out.push({ x: p.x, y: p.y, w: size.w, h: size.h, shape, stackW: size.stackW });
        }
        return out;
      })());

    /**
     * Where this phrase may go: its places above the floor while that space leaves room — as many regions as there are
     * phrases among them all, and two for this one, so that it still moves from one appearance to the next — and
     * otherwise every place, the strip below too (a short screen).
     */
    const candidatesFor = (g: Geometry, i: number): Slot[] => {
      const out = placesFor(g, i);
      const floor = g.floor;
      if (floor === null) return out;
      const aboveOf = (list: Slot[]) => list.filter((c) => withAir(rectOf(c)).y1 <= floor);
      const regions = (list: Slot[]) => new Set(list.map((c) => regionOf(c, g.width)));
      const all = new Set<number>();
      for (let j = 0; j < count; j++) for (const k of regions(aboveOf(placesFor(g, j)))) all.add(k);
      const above = aboveOf(out);
      return all.size >= count && regions(above).size >= 2 ? above : out;
    };

    /**
     * Is this place (with its air) still clear — of the layout, and of the other phrases but those in `ignore`? Exact
     * rectangles here, so a lattice-picked place always passes.
     */
    const fits = (g: Geometry, i: number, s: Slot, ignore: readonly number[] = []) => {
      if (s.x < EDGE_X || s.y < EDGE_TOP || s.x + s.w > g.width - EDGE_X || s.y + s.h > g.height - EDGE_BOTTOM) return false;
      const r = withAir(rectOf(s));
      if (r.x0 < 0 || r.y0 < 0 || r.x1 > g.width || r.y1 > g.height) return false;
      if (g.obstacles.some((o) => overlaps(r, o))) return false;
      if (g.ring && overlaps(r, g.ring)) {
        const glow = glowRef.current;
        if (!glow || glowUnder(glow, g.ring, r) > GLOW_LIMIT) return false;
      }
      return slotsRef.current.every((q, j) => j === i || ignore.includes(j) || !q || !overlaps(rectOf(s), rectOf(q)));
    };

    const view = () => {
      const top = scene.getBoundingClientRect().top;
      return { y0: Math.max(0, -top), y1: window.innerHeight - top };
    };

    const inView = (i: number) => {
      const s = slotsRef.current[i];
      if (!s) return false;
      const v = view();
      return s.y >= v.y0 && s.y + s.h <= v.y1;
    };

    /**
     * Must a new place for phrase i keep clear of phrase j (rather than make it move)? Strict: of every one. Always of
     * a shown one. Where the waiting phrases are drawn none may jump in sight: a phrase about to appear keeps clear of
     * all of them, and one that has just faded out keeps clear of the next to appear (the others in its way fade out
     * and move). Below that, waiting phrases are not drawn: one in the way simply moves elsewhere.
     */
    const keeps = (g: Geometry, i: number, j: number, mode: Mode) =>
      j !== i &&
      (mode === "strict" ||
        isShown(j) ||
        (g.ghosts && (mode === "reveal" || j === nextIndex(autoRef.current, count))));

    const choose = (i: number, mode: Mode): Plan | null => {
      const g = geo.current;
      if (!g) return null;
      const candidates = (g.candidates[i] ??= candidatesFor(g, i));
      const current = slotsRef.current;
      const others: Rect[] = [];
      const soft: Rect[] = [];
      current.forEach((q, j) => {
        if (q && j !== i) (keeps(g, i, j, mode) ? others : soft).push(rectOf(q));
      });
      const n = (appearances.current[i] = (appearances.current[i] ?? 0) + 1);
      const slot = pickPosition(candidates, {
        width: g.width,
        others,
        // waiting phrases are left in peace when possible — drawn ones, so that nothing moves in sight; undrawn ones, so
        // that a place one of them needs is not taken while another would do (a laptop or tablet has few places);
        // where there is no other place, they make way
        soft,
        view: view(),
        // a new layout spreads the phrases out; an appearance goes somewhere other than where the last ones were seen
        avoidRegions: mode === "strict" ? current.flatMap((q) => (q ? [regionOf(q, g.width)] : [])) : lastSeen.current,
        // one line wherever one line fits; two lines only for a space too narrow for it
        prefer: (c) => c.shape === "line",
        // an appearance lands well away from where the last one was seen
        from: mode === "strict" ? undefined : (lastBox.current ?? undefined),
        seed: seedFor(g.width, g.height, i, n),
      });
      if (!slot) return null;
      const near = inflate(rectOf(slot), PHRASE_GAP, PHRASE_GAP);
      const blocking = current.flatMap((q, j) =>
        j !== i && q && !keeps(g, i, j, mode) && overlaps(near, rectOf(q)) ? [j] : [],
      );
      return { slot, blocking, fade: g.ghosts && blocking.length > 0 };
    };

    /** Takes a plan: phrase i to its new place (if still clear), the phrases in its way to new places of their own. */
    const apply = (i: number, plan: Plan | null) => {
      const g = geo.current;
      if (!g || !plan) return; // no room anywhere: it stays where it is
      const movable = plan.blocking.filter((j) => !isShown(j)); // one revealed meanwhile stays put
      if (movable.length === plan.blocking.length && fits(g, i, plan.slot, movable)) setSlot(i, plan.slot);
      else setSlot(i, choose(i, "strict")?.slot ?? slotsRef.current[i] ?? null);
      for (const j of movable) setSlot(j, choose(j, "strict")?.slot ?? null);
    };

    const measure = () => {
      const o = scene.getBoundingClientRect();
      const local = (r: DOMRect): Rect => ({ x0: r.left - o.left, y0: r.top - o.top, x1: r.right - o.left, y1: r.bottom - o.top });
      const width = scene.clientWidth;
      const height = scene.clientHeight;
      const obstacles: Rect[] = [];
      for (const el of document.querySelectorAll(OBSTACLES)) {
        if (layer.contains(el)) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === "hidden" || cs.display === "none") continue;
        const r = el.getBoundingClientRect();
        if (r.width && r.height) obstacles.push(local(r));
      }
      if (knob(layer, "--phrase-rows")) {
        for (const el of scene.querySelectorAll(ROWS)) {
          const r = el.getBoundingClientRect();
          if (r.height) obstacles.push({ x0: 0, y0: r.top - o.top, x1: width, y1: r.bottom - o.top });
        }
      }
      let floor: number | null = null;
      if (knob(layer, "--phrase-floor")) {
        for (const el of scene.querySelectorAll(FLOOR)) {
          const r = el.getBoundingClientRect();
          if (r.height) floor = Math.max(floor ?? 0, r.bottom - o.top);
        }
      }
      // the «أنا» arrow: points along its line, every 6 px
      for (const path of scene.querySelectorAll<SVGPathElement>("[data-speaker-arrow] path")) {
        const m = path.getScreenCTM();
        if (!m) continue;
        const len = path.getTotalLength();
        const n = Math.max(2, Math.ceil(len / 6));
        for (let k = 0; k <= n; k++) {
          const q = path.getPointAtLength((len * k) / n);
          const x = m.a * q.x + m.c * q.y + m.e - o.left;
          const y = m.b * q.x + m.d * q.y + m.f - o.top;
          obstacles.push({ x0: x - 3, y0: y - 3, x1: x + 3, y1: y + 3 });
        }
      }
      const ringEl = scene.querySelector("img[data-portal-ring]");
      const ringBox = ringEl?.getBoundingClientRect();
      // the phrases' sizes depend on the screen's width (their font size does) and the fonts: measured again only then
      const stack = knob(layer, "--phrase-stack");
      const key = `${window.innerWidth}:${stack}:${document.fonts?.status}`;
      if (shapes.key !== key) shapes = { key, sizes: phrases.map((text) => measureShapes(layer, phraseClass, text, stack)) };
      const g: Geometry = {
        width,
        height,
        obstacles,
        ring: ringBox && ringBox.width ? local(ringBox) : null,
        floor,
        shapes: shapes.sizes,
        ghosts: knob(layer, "--phrase-ghosts"),
        free: null,
        places: phrases.map(() => null),
        candidates: phrases.map(() => null),
      };
      geo.current = g;
      setMeasured(true);
      // a phrase keeps its place while that place stays clear (resized to its new measure); the others move now — the
      // one with the fewest places first, so that a phrase that fits almost anywhere does not take another's only room
      const homeless: number[] = [];
      for (let i = 0; i < count; i++) {
        const s = slotsRef.current[i];
        const size = s ? g.shapes[i]?.[s.shape] : undefined;
        const next = s && size ? { ...s, w: size.w, h: size.h, stackW: size.stackW } : null;
        if (!s || !next || !fits(g, i, next)) {
          homeless.push(i);
          slotsRef.current[i] = null; // its old place no longer holds anyone back
        } else if (next.w !== s.w || next.h !== s.h || next.stackW !== s.stackW) setSlot(i, next);
      }
      const room = (i: number) => (g.candidates[i] ??= candidatesFor(g, i)).length;
      homeless.sort((a, b) => room(a) - room(b) || a - b);
      for (const i of homeless) setSlot(i, choose(i, "strict")?.slot ?? null);
      // one still without a place (the places the others kept leave it none): start afresh — the phrase in sight stays
      // where it is, the most constrained go first — and keep that only if it places more phrases
      if (slotsRef.current.some((s) => !s)) {
        const before = slotsRef.current.slice();
        const order = [...Array(count).keys()]
          .filter((i) => !(isShown(i) && before[i]))
          .sort((a, b) => room(a) - room(b) || a - b);
        for (const i of order) slotsRef.current[i] = null;
        for (const i of order) slotsRef.current[i] = choose(i, "strict")?.slot ?? null;
        if (slotsRef.current.filter(Boolean).length <= before.filter(Boolean).length) slotsRef.current = before;
        setSlots([...slotsRef.current]);
      }
    };

    // at its turn a phrase takes a new place — where waiting phrases are drawn, only if its own is out of sight
    beforeRevealRef.current = (i) => {
      const g = geo.current;
      if (!g) return;
      if (!g.ghosts) {
        // the waiting phrases are not drawn here: they take places first — the most constrained first, as on a new
        // layout — and the phrase whose turn it is then takes a new place among those left, so that a layout with few
        // places (a laptop's, a tablet's) never leaves one of them without room
        const room = (j: number) => (g.candidates[j] ??= candidatesFor(g, j)).length;
        const order = [...Array(count).keys()]
          .filter((j) => j !== i && !isShown(j))
          .sort((a, b) => room(a) - room(b) || a - b);
        const saved = slotsRef.current.slice();
        const placed = (list: (Slot | null)[]) => order.filter((j) => list[j]).length;
        slotsRef.current[i] = null; // the place it leaves is free for the others
        for (const j of order) slotsRef.current[j] = null;
        for (const j of order) slotsRef.current[j] = choose(j, "strict")?.slot ?? null;
        if (placed(slotsRef.current) < placed(saved)) for (const j of order) slotsRef.current[j] = saved[j] ?? null;
        const plan = choose(i, "reveal");
        slotsRef.current[i] = saved[i] ?? null; // until the plan is applied: stays where it was if there is no room
        setSlots([...slotsRef.current]);
        apply(i, plan);
      } else if (!inView(i)) apply(i, choose(i, "reveal"));
      const s = slotsRef.current[i];
      if (s) {
        lastSeen.current = [regionOf(s, g.width), ...lastSeen.current].slice(0, 2);
        lastBox.current = rectOf(s);
      }
    };
    // after it: where waiting phrases are drawn, it moves (unseen) to where it will appear next
    planRef.current = (i) => (geo.current?.ghosts ? choose(i, "move") : null);
    applyRef.current = apply;
    drawnRef.current = () => geo.current?.ghosts ?? false;

    // the ring's pixels, once it has loaded
    const ringImg = scene.querySelector<HTMLImageElement>("img[data-portal-ring]");
    const onRing = () => {
      if (!ringImg || glowRef.current) return;
      glowRef.current = readGlow(ringImg);
      measure();
    };
    if (ringImg?.complete) onRing();
    else ringImg?.addEventListener("load", onRing);

    measure();
    const resize = new ResizeObserver(() => measure());
    resize.observe(scene);
    for (const el of scene.querySelectorAll(OBSTACLES)) if (!layer.contains(el)) resize.observe(el);
    for (const el of nodes()) resize.observe(el);
    const arrow = scene.querySelector("[data-speaker-arrow]");
    const redrawn = new MutationObserver(() => measure());
    if (arrow) redrawn.observe(arrow, { subtree: true, childList: true, attributes: true });
    void document.fonts?.ready.then(() => {
      shapes = { key: "", sizes: [] };
      measure();
    });
    return () => {
      resize.disconnect();
      redrawn.disconnect();
      ringImg?.removeEventListener("load", onRing);
    };
  }, [count, phrases]);

  // A — independent automatic cycle; where waiting phrases are drawn, each fades out after its turn and moves, unseen
  useEffect(() => {
    let hide = 0;
    let move = 0;
    let swap = 0;
    const show = (visible: boolean) => {
      autoVisibleRef.current = visible;
      setAutoVisible(visible);
    };
    const reveal = (i: number) => {
      beforeRevealRef.current(i);
      show(true);
      window.clearTimeout(hide);
      window.clearTimeout(move);
      hide = window.setTimeout(() => {
        show(false);
        const held = () => pointerRef.current === i || touchRef.current === i; // the visitor's: it stays put
        if (!drawnRef.current() || held()) return;
        setMoving((m) => [...m, i]);
        move = window.setTimeout(() => {
          const plan = planRef.current(i);
          const others = plan?.blocking ?? [];
          const finish = () => {
            if (!held()) applyRef.current(i, plan);
            setMoving((m) => m.filter((k) => k !== i && !others.includes(k)));
          };
          if (!plan?.fade) return finish();
          // the waiting phrases in its way are drawn: they fade out first, so nothing ever moves in sight
          setMoving((m) => [...m, ...others]);
          window.clearTimeout(swap);
          swap = window.setTimeout(finish, MOVE_AFTER_MS);
        }, MOVE_AFTER_MS);
      }, AUTO_VISIBLE_MS);
    };
    reveal(0);
    const iv = window.setInterval(() => {
      autoRef.current = nextIndex(autoRef.current, count);
      setAutoIndex(autoRef.current);
      reveal(autoRef.current);
    }, CYCLE_MS);
    return () => {
      window.clearInterval(iv);
      window.clearTimeout(hide);
      window.clearTimeout(move);
      window.clearTimeout(swap);
    };
  }, [count]);

  // B — pointer proximity + touch taps (hit-tested, so the layer stays pointer-events: none)
  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    const nodes = () => Array.from(layer.querySelectorAll<HTMLElement>("[data-phrase-index]"));
    const ZERO = { left: 0, top: 0, right: 0, bottom: 0 };
    let rects: Array<{ left: number; top: number; right: number; bottom: number }> = [];
    const measure = () => {
      rects = nodes().map((n) => (n.dataset.slot === "none" ? ZERO : n.getBoundingClientRect()));
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

  // pending until the layout is measured; then ready, or partial where this layout has no room for every phrase
  const placement = !measured ? "pending" : slots.every(Boolean) ? "ready" : "partial";
  return (
    <div
      ref={layerRef}
      className={cx(styles.layer, className)}
      aria-hidden="true"
      data-ambient-phrases=""
      data-auto-index={autoIndex}
      data-placement={placement}
      data-parallax-layer="phrases"
    >
      {phrases.map((text, index) => {
        const source = revealSource({ index, autoIndex, autoVisible, pointerIndex, touchIndex });
        const slot = slots[index];
        const style = slot
          ? ({ left: slot.x, top: slot.y, "--stack-w": slot.stackW ? `${slot.stackW}px` : undefined } as CSSProperties)
          : undefined;
        return (
          <span
            key={text}
            className={styles.phrase}
            data-phrase-index={index}
            data-state={source ? "revealed" : "ghost"}
            data-reveal-source={source ?? undefined}
            data-slot={slot ? `${Math.round(slot.x)},${Math.round(slot.y)}` : "none"}
            data-shape={slot?.shape === "stack" ? "stack" : undefined}
            data-relocating={moving.includes(index) ? "" : undefined}
            style={style}
          >
            {text}
          </span>
        );
      })}
    </div>
  );
}
