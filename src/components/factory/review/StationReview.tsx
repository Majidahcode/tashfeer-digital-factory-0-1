"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import type { GlassMode, ReviewView } from "./StationReviewScene";
import styles from "./StationReview.module.css";

const Scene = dynamic(() => import("./StationReviewScene"), {
  ssr: false,
  loading: () => <div className={styles.loading}>تُجهَّز المحطة…</div>,
});

const VIEWS: { id: ReviewView; label: string }[] = [
  { id: "reference", label: "زاوية المرجع" },
  { id: "side", label: "جانبية" },
];
const GLASS: { id: GlassMode; label: string }[] = [
  { id: "transmission", label: "زجاج فيزيائي" },
  { id: "clear", label: "زجاج بطبقات" },
  { id: "none", label: "بدون زجاج" },
];

/**
 * A review page for station 01 alone: the station and a calm stage, the tools in a bar above the scene (never over
 * it). ?view=reference|side and ?glass=clear|transmission|none open it on a given view and glass.
 */
export function StationReview() {
  const [view, setView] = useState<ReviewView>("reference");
  const [glass, setGlass] = useState<GlassMode>("transmission");
  const [glow, setGlow] = useState(true);
  const [ready, setReady] = useState(false);
  // the URL is read after the first render (a static page: the server knows no query); set once, on arrival
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const v = q.get("view");
    const g = q.get("glass");
    if (v === "reference" || v === "side") setView(v);
    if (g === "clear" || g === "transmission" || g === "none") setGlass(g);
    if (q.get("glow") === "0") setGlow(false);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */
  const onReady = useCallback(() => setReady(true), []);
  return (
    <section className={styles.page} data-station-review="" data-view={view} data-glass={glass} data-glow={glow ? "on" : "off"} data-ready={ready || undefined}>
      <header className={styles.bar}>
        <div className={styles.title}>
          <span className={styles.kicker}>صفحة مراجعة</span>
          <h1>المحطة 01 وحدها</h1>
        </div>
        <div className={styles.groups}>
          <div className={styles.group} role="group" aria-label="الزاوية">
            {VIEWS.map((v) => (
              <button key={v.id} type="button" aria-pressed={view === v.id} data-view-btn={v.id} onClick={() => setView(v.id)}>
                {v.label}
              </button>
            ))}
          </div>
          <div className={styles.group} role="group" aria-label="التوهج">
            <button type="button" aria-pressed={glow} data-glow-btn="" onClick={() => setGlow((x) => !x)}>
              التوهج
            </button>
          </div>
          <div className={styles.group} role="group" aria-label="الزجاج">
            {GLASS.map((g) => (
              <button key={g.id} type="button" aria-pressed={glass === g.id} data-glass-btn={g.id} onClick={() => setGlass(g.id)}>
                {g.label}
              </button>
            ))}
          </div>
        </div>
      </header>
      <div className={styles.stage}>
        <Scene view={view} glass={glass} glow={glow} onReady={onReady} />
      </div>
      <p className={styles.note}>اسحب للدوران، ومرّر العجلة للتقريب. المصنع الكامل باقٍ كما هو في صفحته.</p>
    </section>
  );
}
