"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { prefersReducedMotion } from "@/lib/page-transition";
import type { Clip } from "@/lib/tashfeer-state";
import styles from "./TashfeerVideo.module.css";

const DIR = "/media/tashfeer-test";
export type ThinkingVariant = "original" | "preview";
type Source = "listening" | "thinking-original" | "thinking-preview";

/**
 * Where the robot stands in each clip (pixels of the 1920 × 1080 frame, measured on its first and last frames:
 * centre line, top of the head, bottom of the feet). The clips do not frame him alike — in «thinking» he stands
 * ≈ 180 px further right and ≈ 5 % smaller than in «listening» — so, when `aligned`, each clip is scaled and moved so
 * that he fills the same box; otherwise every clip is placed with the listening clip's numbers (what a plain swap shows).
 */
const ROBOT: Record<Source, { cx: number; top: number; bottom: number }> = {
  listening: { cx: 932, top: 130, bottom: 1019 },
  "thinking-original": { cx: 1122, top: 206, bottom: 1046 },
  "thinking-preview": { cx: 1125, top: 207, bottom: 1047 },
};
const FRAME = { w: 1920, h: 1080 };
/** room around the character's box for the arms and the mask's soft edge (fractions of the box's width / height) */
const MARGIN = { x: 0.75, y: 0.22 };

const sourceOf = (clip: Clip, variant: ThinkingVariant): Source =>
  clip === "listening" ? "listening" : variant === "original" ? "thinking-original" : "thinking-preview";

/** The video's box and its soft mask, in pixels of the character's box (height h), so the robot fills that box. */
function placement(src: Source, h: number, w: number, aligned: boolean): CSSProperties {
  // coordinates inside the clip layer, which extends the character's box by MARGIN on every side
  const ox = MARGIN.x * w;
  const oy = MARGIN.y * h;
  const r = aligned ? ROBOT[src] : ROBOT.listening;
  const s = h / (r.bottom - r.top);
  // the mask follows the robot where he really is in this clip, so an unaligned swap shows his true offset
  const m = ROBOT[src];
  const left = ox + w / 2 - r.cx * s;
  const top = oy - r.top * s;
  const cy = ((m.top + m.bottom) / 2) * s;
  const cx = m.cx * s;
  const ellipse = `radial-gradient(ellipse ${0.42 * h}px ${0.72 * h}px at ${cx}px ${cy}px, var(--brand-bg) 72%, transparent 100%)`;
  const feetGap = (FRAME.h - m.bottom) * s; // from his feet to the frame's bottom edge, on screen
  const bottomFade = `linear-gradient(180deg, var(--brand-bg) calc(100% - ${feetGap * 0.85}px), transparent)`;
  return {
    width: FRAME.w * s,
    height: FRAME.h * s,
    left,
    top,
    // an ellipse around the robot — whole head, feet and arms opaque — fading to the page: the clip's grey studio
    // background and its corners (with the generator's mark) do not reach the page as a rectangle
    // …and toward the frame's bottom edge, which is only ≈ 60 source pixels under his feet (it would show as a line)
    WebkitMaskImage: `${ellipse}, ${bottomFade}`,
    maskImage: `${ellipse}, ${bottomFade}`,
    WebkitMaskComposite: "source-in",
    maskComposite: "intersect",
  };
}

export type VideoReport = { layer: string; switches: { at: number; to: string; waitedMs: number }[]; failed: string[] };

/**
 * The video test's Tashfeer: three clips preloaded in three <video> elements, only one ever visible. A clip is shown
 * only once its first frame is on screen (requestVideoFrameCallback), so a swap never passes through black or shows
 * the previous clip's first frame; it plays once and stays on its last frame (no loop: the head would turn again).
 * Before anything plays, and if a clip cannot play, a still frame stands in.
 */
export function TashfeerVideo({
  play,
  playKey,
  variant,
  aligned,
  dimBackground,
  onClipEnd,
  onReport,
}: {
  /** the clip to start whenever playKey changes (null: nothing has played yet) */
  play: Clip | null;
  playKey: number;
  variant: ThinkingVariant;
  aligned: boolean;
  dimBackground: boolean;
  onClipEnd: (clip: Clip) => void;
  onReport?: (r: VideoReport) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const vids = useRef<Partial<Record<Source, HTMLVideoElement | null>>>({});
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [layer, setLayer] = useState<Source | "still-idle" | `still-${Source}`>("still-idle");
  const [failed, setFailed] = useState<string[]>([]);
  const report = useRef<VideoReport>({ layer: "still-idle", switches: [], failed: [] });
  const ended = useRef(onClipEnd);
  const variantNow = useRef(variant); // a clip starts with the variant chosen then; switching does not replay
  useEffect(() => {
    ended.current = onClipEnd;
    variantNow.current = variant;
  }, [onClipEnd, variant]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    report.current.layer = layer;
    report.current.failed = failed;
    box.current?.setAttribute("data-video-layer", layer);
    onReport?.({ ...report.current, switches: [...report.current.switches] });
  }, [layer, failed, onReport]);

  useEffect(() => {
    if (!play) return; // hold: the visible layer stays (a reset remounts this component)
    const src = sourceOf(play, variantNow.current);
    const v = vids.current[src];
    if (!v) return;
    let cancelled = false;
    const asked = performance.now();
    const show = () => {
      if (cancelled) return;
      report.current.switches.push({ at: Math.round(asked), to: src, waitedMs: Math.round(performance.now() - asked) });
      setLayer(src);
    };
    const fail = (why: string) => {
      if (cancelled) return;
      setFailed((f) => [...f, `${src}: ${why}`]);
      setLayer(`still-${src}`);
      window.setTimeout(() => !cancelled && ended.current(play), 700);
    };
    for (const [k, other] of Object.entries(vids.current)) if (k !== src && other) other.pause();
    if (prefersReducedMotion()) {
      // reduced motion: no movement — the clip's end pose as a still, and the conversation goes on
      setLayer(`still-${src}`);
      const t = window.setTimeout(() => !cancelled && ended.current(play), 400);
      return () => {
        cancelled = true;
        window.clearTimeout(t);
      };
    }
    v.currentTime = 0;
    const onEnded = () => !cancelled && ended.current(play);
    v.addEventListener("ended", onEnded, { once: true });
    v.play()
      .then(() => {
        type RVFC = HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number };
        const rv = v as RVFC;
        if (typeof rv.requestVideoFrameCallback === "function") rv.requestVideoFrameCallback(show);
        else {
          const tick = () => (v.currentTime > 0 ? show() : requestAnimationFrame(tick));
          tick();
        }
      })
      .catch((e: unknown) => fail(e instanceof Error ? e.name : "play() refused"));
    return () => {
      cancelled = true;
      v.removeEventListener("ended", onEnded);
    };
    // playKey restarts the same clip on purpose
  }, [play, playKey]);

  const sources: Source[] = ["listening", "thinking-original", "thinking-preview"];
  const stillSrc =
    layer === "still-idle" ? `${DIR}/tashfeer-listening-first.webp` : layer.startsWith("still-") ? `${DIR}/tashfeer-${layer.slice(6)}-last.webp` : null;
  const stillPlace = layer.startsWith("still-") && layer !== "still-idle" ? (layer.slice(6) as Source) : "listening";

  return (
    <div ref={box} className={styles.box} data-dim={dimBackground ? "" : undefined} data-video-layer={layer}>
      {size.h > 0 && (
        <div className={styles.clip} style={{ inset: `-${MARGIN.y * 100}% -${MARGIN.x * 100}%` }}>
          {sources.map((s) => (
            <video
              key={s}
              ref={(el) => {
                vids.current[s] = el;
              }}
              className={styles.video}
              src={`${DIR}/tashfeer-${s}.mp4`}
              poster={`${DIR}/tashfeer-${s}-first.webp`}
              preload="auto"
              muted
              playsInline
              disablePictureInPicture
              data-visible={layer === s ? "" : undefined}
              data-clip={s}
              style={placement(s, size.h, size.w, aligned)}
              onError={() => setFailed((f) => (f.includes(`${s}: load error`) ? f : [...f, `${s}: load error`]))}
            />
          ))}
          {stillSrc && (
            // eslint-disable-next-line @next/next/no-img-element -- a still frame of the clip, placed like the video
            <img
              className={styles.video}
              src={stillSrc}
              alt=""
              data-visible=""
              data-still=""
              style={placement(stillPlace, size.h, size.w, aligned)}
            />
          )}
        </div>
      )}
    </div>
  );
}
