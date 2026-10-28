"use client";

import Image from "next/image";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { Icon } from "@/components/icons/Icon";
import { type Agent, agentImage } from "@/domain/agents";
import { cx } from "@/lib/cx";
import styles from "./AgentCarousel.module.css";

const DRAG_THRESHOLD = 6; // px of movement before a press becomes a drag (and stops being a click)
const VISIBLE = 3.4; // cards further than this from the centre are hidden

/**
 * The agents on a curved strip: the centre card faces the visitor at full size; the others shrink, recede and turn
 * toward the centre the further they are from it, and fade into black at the strip's edges. Right-to-left: the first
 * agent is on the right, the next ones to its left.
 *
 * Moved by dragging (mouse or touch), by the arrows, and by the keyboard (← next, → previous, Home / End; Tab to a card
 * centres it). Pressing a card toggles it — a press that turned into a drag never does.
 */
export function AgentCarousel({
  agents,
  selected,
  suggested,
  onToggle,
  start = 0,
}: {
  agents: readonly Agent[];
  selected: ReadonlySet<string>;
  suggested: ReadonlySet<string>;
  onToggle: (id: string) => void;
  /** the agent at the centre at first */
  start?: number;
}) {
  const n = agents.length;
  const [pos, setPos] = useState(start); // fractional index at the centre
  const [dragging, setDragging] = useState(false);
  const track = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    x0: number;
    pos0: number;
    moved: boolean;
    id: number;
    t: number;
    lastX: number;
    lastT: number;
  } | null>(null);
  const suppressClick = useRef(false);
  const [step, setStep] = useState(220); // px between neighbouring cards at the centre (from the card's width)

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const measure = () => {
      const card = el.querySelector<HTMLElement>("[data-agent-card]");
      if (card) setStep(card.offsetWidth * 0.97);
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, []);

  const clamp = useCallback(
    (p: number) => Math.max(0, Math.min(n - 1, p)),
    [n],
  );
  const go = (i: number) => setPos(clamp(Math.round(i)));
  const center = Math.round(pos);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    drag.current = {
      x0: e.clientX,
      pos0: pos,
      moved: false,
      id: e.pointerId,
      t: performance.now(),
      lastX: e.clientX,
      lastT: performance.now(),
    };
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x0;
    if (!d.moved && Math.abs(dx) < DRAG_THRESHOLD) return;
    if (!d.moved) {
      d.moved = true;
      setDragging(true);
      track.current?.setPointerCapture(e.pointerId);
    }
    // right-to-left: pulling the strip rightwards brings the next agents (on the left) to the centre
    setPos(Math.max(-0.35, Math.min(n - 0.65, d.pos0 + dx / step)));
    d.lastX = e.clientX;
    d.lastT = performance.now();
  };
  const endDrag = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d || !d.moved) return;
    suppressClick.current = true;
    window.setTimeout(() => (suppressClick.current = false), 0);
    setDragging(false);
    const v = (e.clientX - d.lastX) / Math.max(1, performance.now() - d.lastT); // px/ms at release
    const p =
      d.pos0 +
      (e.clientX - d.x0) / step +
      Math.max(-1, Math.min(1, (v * 120) / step));
    setPos(clamp(Math.round(p)));
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const keys: Record<string, number> = {
      ArrowLeft: center + 1,
      ArrowRight: center - 1,
      Home: 0,
      End: n - 1,
    };
    if (!(e.key in keys)) return;
    e.preventDefault();
    const i = clamp(keys[e.key]!);
    go(i);
    track.current
      ?.querySelectorAll<HTMLElement>("[data-agent-card]")
      [i]?.focus({ preventScroll: true });
  };

  return (
    <div className={styles.wrap} data-agent-carousel="" data-center={center}>
      <button
        type="button"
        className={cx(styles.nav, styles.prev)}
        aria-label="الوكيل السابق"
        onClick={() => go(center - 1)}
        disabled={center <= 0}
      >
        <Icon name="chevron" size={20} />
      </button>

      <div
        ref={track}
        className={cx(styles.track, dragging && styles.dragging)}
        role="group"
        aria-roledescription="شريط متحرك"
        aria-label="الوكلاء المتخصصون — اسحب أو استخدم الأسهم"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
        onClickCapture={(e) => {
          if (suppressClick.current) {
            e.preventDefault();
            e.stopPropagation();
          }
        }}
      >
        {agents.map((a, i) => {
          const d = i - pos;
          const ad = Math.min(Math.abs(d), VISIBLE + 0.6);
          const sign = Math.sign(d);
          const img = agentImage(a);
          const isSel = selected.has(a.id);
          const style = {
            // right-to-left: later agents sit to the left (negative x)
            "--x": `${-sign * (ad * step - Math.max(0, ad - 1) * ad * step * 0.08)}px`,
            "--z": `${-ad * 70}px`,
            "--r": `${sign * Math.min(ad, 3) * 11}deg`,
            "--s": (1 - Math.min(ad, 3) * 0.1).toFixed(3),
            // full strength everywhere: only the strip's edges fade (its mask), so every visible card keeps its colours
            "--o": Math.abs(d) > VISIBLE ? 0 : 1,
            // the light behind the figure: brightest at the centre
            "--spot": Math.max(0, 1 - ad).toFixed(3),
            zIndex: 100 - Math.round(ad * 10),
          } as CSSProperties;
          return (
            <button
              key={a.id}
              type="button"
              className={cx(
                styles.card,
                isSel && styles.selected,
                Math.abs(d) > VISIBLE && styles.hidden,
              )}
              style={style}
              aria-pressed={isSel}
              aria-label={`${a.ar} — ${a.en}${suggested.has(a.id) ? " — مقترح من تشفير" : ""}`}
              tabIndex={Math.abs(d) > VISIBLE ? -1 : 0}
              data-agent-card={a.id}
              data-selected={isSel ? "" : undefined}
              data-suggested={suggested.has(a.id) ? "" : undefined}
              data-offset={d.toFixed(2)}
              onFocus={() => {
                if (!drag.current) setPos(i);
              }}
              onClick={() => onToggle(a.id)}
            >
              <span className={styles.art}>
                {img ? (
                  <Image
                    src={img.src}
                    width={img.width}
                    height={img.height}
                    alt=""
                    sizes="(max-width: 899px) 60vw, 300px"
                    loading="eager"
                    draggable={false}
                  />
                ) : (
                  // no image supplied yet: the role's icon and specialty — not a stand-in character
                  <span className={styles.slot} data-agent-placeholder="">
                    <span className={styles.slotIcon}>
                      <Icon name={a.icon ?? "doc"} size={44} />
                    </span>
                    <span className={styles.slotSpec}>{a.spec}</span>
                    <span className={styles.slotNote}>
                      صورة الوكيل قيد الإعداد
                    </span>
                  </span>
                )}
              </span>
              <span className={styles.names}>
                <b>{a.ar}</b>
                <small dir="ltr">{a.en}</small>
              </span>
              {suggested.has(a.id) && (
                <i className={styles.suggested}>مقترح من تشفير</i>
              )}
              <i className={styles.check} aria-hidden="true">
                {isSel ? "✓" : ""}
              </i>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        className={cx(styles.nav, styles.next)}
        aria-label="الوكيل التالي"
        onClick={() => go(center + 1)}
        disabled={center >= n - 1}
      >
        <Icon name="chevron" size={20} />
      </button>

      <div className={styles.dots} aria-hidden="true">
        {agents.map((a, i) => (
          <i key={a.id} data-on={i === center ? "" : undefined} />
        ))}
      </div>
      <p className="sr-only" aria-live="polite">
        {`${agents[center]?.ar ?? ""} — ${center + 1} من ${n}`}
      </p>
    </div>
  );
}
