"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { type FactoryEvent, type FactoryState, type Station, type StationId } from "@/domain/factory";
import type { StationStory } from "@/domain/factory-story";
import { cx } from "@/lib/cx";
import { StepIcon, STATION_ICON } from "./StepIcon";
import { checkFor, describe, formatTime, stepStates } from "./StationWindow";
import { Visual } from "./Visual";
import styles from "./Studio.module.css";

/**
 * A glass sheet over the side of the screen (the details of a station, the journey's log): it does not move the camera
 * or touch production; closing it returns to the tour where it was. Escape closes it.
 */
export function Sheet({ title, onClose, children, label }: { title: string; onClose: () => void; children: ReactNode; label: string }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    box.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return createPortal(
    <div className={styles.sheetScrim} onClick={(e) => e.target === e.currentTarget && onClose()} data-sheet={label}>
      <div ref={box} className={styles.sheet} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}>
        <header className={styles.sheetHead}>
          <h2>{title}</h2>
          <button type="button" className={styles.close} onClick={onClose} aria-label="إغلاق" data-sheet-close="">
            ×
          </button>
        </header>
        <div className={styles.sheetBody}>{children}</div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * The journey's log: every update of the production so far, station by station and in time order — what began, each
 * step and what it added, the issues, their fixes and retests, the outputs. Opening an update shows its picture.
 * Reading it changes nothing in the tour.
 */
export function JourneyLog({
  stations,
  stories,
  events,
  elapsed,
  state,
}: {
  stations: readonly Station[];
  stories: Record<string, StationStory>;
  events: readonly FactoryEvent[];
  elapsed: number;
  state: FactoryState;
}) {
  const [open, setOpen] = useState<number | null>(null);
  const past = events.map((e, i) => ({ e, i })).filter(({ e }) => e.at <= elapsed && e.type !== "travel");
  if (past.length === 0) return <p className={styles.muted}>لم يبدأ الإنتاج بعد: سيظهر هنا كل تحديث فور حدوثه.</p>;
  return (
    <div className={styles.log} data-journey-log="">
      {stations.map((s) => {
        const items = past.filter(({ e }) => e.station === s.id);
        if (items.length === 0) return null;
        const story = stories[s.id];
        const st = state.stations[s.id];
        return (
          <section key={s.id} data-log-station={s.id}>
            <h3>
              <StepIcon name={STATION_ICON[s.id] ?? "layers"} size={16} /> {s.name}
            </h3>
            <ol>
              {items.map(({ e, i }) => {
                const step = e.type === "step" ? story?.steps[e.step] : null;
                const k = step && st ? stepStates(st, story!.steps)[(e as { step: number }).step] : null;
                return (
                  <li key={i} className={cx(e.type === "check" && e.result === "fail" && styles.logIssue)}>
                    <button type="button" onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i} data-log-entry={e.type}>
                      <time>{formatTime(e.at)}</time>
                      <span>{describe(e)}</span>
                    </button>
                    {open === i && step && (
                      <div className={styles.logMore}>
                        <p>{k === "done" ? step.result : step.why}</p>
                        <Visual v={step.visual} state={k === "done" ? "made" : "making"} check={s.id === "quality" && st ? (checkFor(st, (e as { step: number }).step)?.state ?? null) : null} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          </section>
        );
      })}
    </div>
  );
}

/** where the product is drawn on the screen (from the scene), read a few times a second */
function useProductOnScreen(active: boolean) {
  const [r, setR] = useState<{ x: number; y: number; left: number; right: number } | null>(null);
  useEffect(() => {
    if (!active) return;
    const read = () => {
      const p = window.__tashfeerFactory?.productOnScreen?.();
      setR((old) =>
        !p ? null : old && Math.abs(old.x - p.x) < 3 && Math.abs(old.y - p.y) < 3 && Math.abs(old.right - p.right) < 3 ? old : p,
      );
    };
    read();
    const t = window.setInterval(read, 160);
    return () => window.clearInterval(t);
  }, [active]);
  return r;
}

/**
 * The step's result beside the product, as in the reference (a calendar, «تم حجز الموعد»…): a small glass card that
 * comes when the step's event arrives and stays while it is read. In a station's own shot (the product may be out of
 * view) it stands in the free space left of the window.
 */
export function ResultCards({
  station,
  state,
  story,
  follow,
  reducedMotion,
  freeRight,
}: {
  station: StationId;
  state: FactoryState;
  story: StationStory;
  follow: boolean;
  reducedMotion: boolean;
  /** the screen's right part covered by the window (px) */
  freeRight: number;
}) {
  const st = state.stations[station];
  const pos = useProductOnScreen(follow);
  if (!st || st.status === "waiting" || st.step < 0) return null;
  const states = stepStates(st, story.steps);
  const i = st.status === "done" ? story.steps.length - 1 : st.step;
  const step = story.steps[i];
  if (!step) return null;
  const made = states[i] === "done";
  const chk = station === "quality" ? (checkFor(st, i)?.state ?? null) : null;
  const vw = typeof window === "undefined" ? 1200 : window.innerWidth;
  // beside the product's right edge, toward the window; above it when there is no room
  const placed =
    follow && pos
      ? { left: Math.min(pos.right + 14, vw - freeRight - 300), top: Math.max(80, pos.y - 150) }
      : { left: Math.max(16, vw - freeRight - 320), top: 120 };
  return (
    <div
      key={`${station}-${i}`}
      className={cx(styles.result, !reducedMotion && styles.resultIn)}
      style={{ insetInlineStart: "auto", left: placed.left, top: placed.top }}
      data-result-card={station}
      data-result-step={i}
      aria-live="polite"
    >
      <span className={styles.resultHead}>{made ? "ظهر في منتجك" : "يتكوّن الآن في منتجك"}</span>
      <Visual v={step.visual} state={made ? "made" : "making"} check={chk} />
      <span className={styles.resultFoot}>{made ? step.result : step.why}</span>
    </div>
  );
}

/**
 * Keeps the window that leaves on screen a moment while the next one comes in: the old one slides back and fades, the
 * new one comes forward — no flash, no jump. With reduced motion the change is immediate.
 */
export function useSwap<T>(key: string, value: T, reducedMotion: boolean): { leaving: T | null } {
  const [leaving, setLeaving] = useState<T | null>(null);
  const prev = useRef<{ key: string; value: T }>({ key, value });
  useEffect(() => {
    if (prev.current.key !== key) {
      if (!reducedMotion) {
        setLeaving(prev.current.value);
        const t = window.setTimeout(() => setLeaving(null), 380);
        prev.current = { key, value };
        return () => window.clearTimeout(t);
      }
    }
    prev.current = { key, value };
  }, [key, value, reducedMotion]);
  return { leaving };
}

/**
 * The factory's depth behind the scene, after the reference: a dark hall seen out of focus — tall columns with soft
 * green and lime light on their edges, long curved light rails high up, distant bokeh, a quiet haze. Only tokens'
 * colours; nothing bright enough to compete with the product.
 */
export function Backdrop() {
  return (
    <div className={styles.backdrop} aria-hidden="true" data-factory-backdrop="">
      <span className={styles.bdHaze} />
      <span className={styles.bdColumns} />
      <span className={styles.bdRails} />
      <span className={styles.bdBokeh} />
      <span className={styles.bdBokeh2} />
      <span className={styles.bdFloorGlow} />
    </div>
  );
}
