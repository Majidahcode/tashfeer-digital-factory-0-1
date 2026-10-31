"use client";

/**
 * The site's opening (≈2.6 s, once per browsing session, home page only): a human hand and a mechanical hand — black
 * with orange joints, Tashfeer's own colours — come together on the dark brand field and touch at the fingertips; a
 * soft lime-and-green light opens from the touch and the home page, already loaded underneath, shows through.
 *
 * It never stands in the way of the site:
 *   - the whole timeline is CSS: it ends and lets clicks through by itself, even if scripts or the pictures fail;
 *   - a «تخطَّ» button ends it at once;
 *   - an inline script, run before the first paint, hides it when it was seen in this tab or motion is reduced;
 *   - nothing waits for it: the home page renders and loads under it (no progress figures, real or invented).
 */
import { useCallback, useState, useSyncExternalStore } from "react";
import styles from "./SiteIntro.module.css";

const SEEN_KEY = "tashfeer.intro.seen";
const EVENT = "tashfeer-intro";

declare global {
  interface Window {
    /** "play" while the opening shows, "skip" when it is not shown in this tab, "done" once it has ended */
    __tashfeerIntro?: "play" | "skip" | "done";
  }
}

/** Decided before the first paint: the opening plays once per tab, never with reduced motion. */
const DECIDE = `(function(){try{var s=window.sessionStorage;if(s.getItem("${SEEN_KEY}")||window.matchMedia("(prefers-reduced-motion: reduce)").matches){var st=document.createElement("style");st.textContent="[data-site-intro]{display:none!important}";document.head.appendChild(st);window.__tashfeerIntro="skip"}else{s.setItem("${SEEN_KEY}","1");window.__tashfeerIntro="play"}}catch(e){window.__tashfeerIntro="play"}})();`;

const subscribe = (cb: () => void) => {
  window.addEventListener(EVENT, cb);
  return () => window.removeEventListener(EVENT, cb);
};
// on the server (and while hydrating) the opening is in the page; on the client it stays only while it plays — a
// visit back to the home page in the same tab never shows it again
const playing = () => window.__tashfeerIntro === "play";

export function SiteIntro() {
  const show = useSyncExternalStore(subscribe, playing, () => true);
  const [leaving, setLeaving] = useState(false);

  const end = useCallback(() => {
    window.__tashfeerIntro = "done";
    window.dispatchEvent(new Event(EVENT));
  }, []);

  if (!show) return null;
  return (
    <>
      {/* our own constant script (no outside input): it must run before the first paint, so it is inline */}
      {/* eslint-disable-next-line react/no-danger */}
      <script dangerouslySetInnerHTML={{ __html: DECIDE }} />
      {/* both pictures are asked for at once, first thing (React places these in the head) */}
      <link rel="preload" as="image" href="/intro/hand-human.webp" fetchPriority="high" />
      <link rel="preload" as="image" href="/intro/hand-robot.webp" fetchPriority="high" />
      <div
        className={leaving ? `${styles.intro} ${styles.leaving}` : styles.intro}
        data-site-intro=""
        data-intro-state={leaving ? "leaving" : "playing"}
        role="presentation"
        // the overlay's own fade (the timeline's end, or the quick one after «تخطَّ») removes it
        onAnimationEnd={(e) => {
          if (e.target === e.currentTarget) end();
        }}
      >
        <div className={styles.art}>
          <div className={styles.field} aria-hidden="true" />
          {/* eslint-disable-next-line @next/next/no-img-element -- fixed art in an overlay: no responsive sizes to pick */}
          <img className={styles.human} src="/intro/hand-human.webp" alt="" width={1400} height={700} decoding="async" fetchPriority="high" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className={styles.robot} src="/intro/hand-robot.webp" alt="" width={1400} height={788} decoding="async" fetchPriority="high" />
          <div className={styles.glow} aria-hidden="true">
            <span className={styles.halo} />
            <span className={styles.arc} />
            <span className={`${styles.arc} ${styles.arc2}`} />
            <span className={styles.spark} />
          </div>
        </div>
        <button type="button" className={styles.skip} onClick={() => setLeaving(true)} data-intro-skip="">
          تخطَّ
        </button>
      </div>
    </>
  );
}
