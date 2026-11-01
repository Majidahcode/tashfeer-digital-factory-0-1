"use client";

import Image from "next/image";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Icon } from "@/components/icons/Icon";
import { PrototypePreview } from "@/components/prototypes/PrototypePreview";
import {
  type FactoryState,
  type Station,
  type StationId,
  deriveFactory,
  openIssue,
  simulationScript,
  stationsFor,
} from "@/domain/factory";
import { type StationStory, projectTitle, screenCopy, storyFor } from "@/domain/factory-story";
import { PROTOTYPES, modelName } from "@/domain/prototypes";
import { asset } from "@/lib/assets";
import { cx } from "@/lib/cx";
import { type FactorySource, createSimulation } from "@/lib/factory-source";
import { transitionTo } from "@/lib/page-transition";
import { approvalOf, designApprovalOf, useProject } from "@/lib/project-store";
import { createCameraStore, useCamera } from "./camera-store";
import styles from "./FactoryScreen.module.css";
import { STATION_ICON, StepIcon } from "./studio/StepIcon";
import { STATUS, StationDetails, StationWindow } from "./studio/StationWindow";
import { Backdrop, JourneyLog, ResultCards, Sheet, useSwap } from "./studio/Studio";
import studio from "./studio/Studio.module.css";

/* the 3D scene is loaded in the browser only, and only on this screen */
const FactoryScene = dynamic(() => import("./FactoryScene"), {
  ssr: false,
  loading: () => <div className={styles.loading}>يُجهَّز المصنع…</div>,
});

const noop = () => () => {};
const WEIGHT: Record<StationId, number> = { setup: 0.15, interfaces: 0.5, services: 0.15, quality: 0.12, delivery: 0.08 };

let webglCache: boolean | null = null;
function hasWebGL(): boolean {
  if (webglCache !== null) return webglCache;
  try {
    const c = document.createElement("canvas");
    webglCache = Boolean(c.getContext("webgl2") ?? c.getContext("webgl"));
  } catch {
    webglCache = false;
  }
  return webglCache;
}

/* the scene draws Arabic labels on canvases: wait until Cairo is loaded, or they would be drawn in a fallback font */
const FONT_Q = `800 20px "Cairo"`;
function subscribeFonts(cb: () => void) {
  void Promise.all([document.fonts.load(FONT_Q), document.fonts.load(`500 20px "Cairo"`)]).then(cb, cb);
  document.fonts.addEventListener("loadingdone", cb);
  return () => document.fonts.removeEventListener("loadingdone", cb);
}
const fontsNow = () => document.fonts.check(FONT_Q);

function subscribeMotion(cb: () => void) {
  const m = window.matchMedia("(prefers-reduced-motion: reduce)");
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
}
const reducedNow = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** How far along the product is built, 0..1, from the stations' states (weighted by the work each adds). */
function buildLevel(stations: readonly Station[], state: FactoryState): number {
  const total = stations.reduce((n, s) => n + WEIGHT[s.id], 0);
  const done = stations.reduce((n, s) => n + WEIGHT[s.id] * (state.stations[s.id]?.progress ?? 0), 0);
  // rounded: sums of fractions should not leave the last section a hair short of built
  return total ? Math.min(1, Math.round((done / total) * 1000) / 1000) : 0;
}

/**
 * Screen 5 — the production factory. The visitor arrives here after approving a model: their product travels along a
 * production line through the stations their team works at. The camera tells it (a directed tour, no free camera): it
 * follows the product and holds still while it is worked on; the visitor may stop at any station and come back to the
 * product. One card, beside the scene, says what is happening at the station in view. What happens comes from an event
 * source; today a local simulation, labelled as such — camera shots never decide what has been done.
 */
export function FactoryScreen() {
  const router = useRouter();
  const project = useProject();
  const hydrated = useSyncExternalStore(noop, () => true, () => false);
  const reducedMotion = useSyncExternalStore(subscribeMotion, reducedNow, () => false);
  const webgl = useSyncExternalStore(noop, hasWebGL, () => true);
  const fonts = useSyncExternalStore(subscribeFonts, fontsNow, () => false);
  const go = (href: string) => transitionTo(href, (h) => router.push(h));

  const team = useMemo(() => project.team ?? [], [project.team]);
  const design = project.approvedDesign;
  const ready = hydrated && approvalOf(project) === "approved" && designApprovalOf(project) === "approved" && !!design;
  const model = design?.model ?? "A";
  const stations = useMemo(() => stationsFor(team), [team]);
  const idea = design?.idea ?? project.idea;
  const events = useMemo(() => simulationScript(stations, model, idea), [stations, model, idea]);
  // what each station shows of *this* project (its steps, what they add, what waits)
  const stories = useMemo(
    () => Object.fromEntries(stations.map((s) => [s.id, storyFor(idea, model, s.id)])) as Record<string, StationStory>,
    [stations, model, idea],
  );
  const copy = useMemo(() => screenCopy(idea), [idea]);
  const [sheet, setSheet] = useState<{ kind: "details"; station: StationId } | { kind: "log" } | null>(null);
  const signature = design ? JSON.stringify([design.idea, [...design.team].sort(), design.model, design.at]) : "";

  const [speed] = useState(() => {
    if (typeof window === "undefined") return 1;
    const v = Number(new URLSearchParams(window.location.search).get("speed"));
    return Number.isFinite(v) && v > 0 ? Math.min(v, 60) : 1;
  });
  const source: FactorySource | null = useMemo(
    () => (ready ? createSimulation(events, signature, speed) : null),
    [ready, events, signature, speed],
  );
  useEffect(() => () => source?.dispose(), [source]);
  const snap = useSyncExternalStore(
    source?.subscribe ?? noop,
    () => source?.snapshot() ?? null,
    () => null,
  );
  const state = useMemo(
    () => deriveFactory(stations, events, snap?.elapsed ?? 0),
    [stations, events, snap?.elapsed],
  );

  const [cameraStore] = useState(() => createCameraStore("intro"));
  const cam = useCamera(cameraStore);
  const [selected, setSelected] = useState<StationId | null>(null);
  // the visitor may pause the tour's camera motion (production goes on); reduced motion: shots change at once anyway
  const [tourPaused, setTourPaused] = useState(false);
  const select = useCallback(
    (id: StationId) => {
      setSelected(id);
      cameraStore.go("station", id);
    },
    [cameraStore],
  );
  const backToProduct = useCallback(() => {
    setSelected(null);
    cameraStore.go("follow");
  }, [cameraStore]);

  // keyboard: 1–9 choose a station, Esc returns to the product
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el?.closest("input, textarea, [contenteditable]")) return;
      if (e.key === "Escape" && cameraStore.get().mode === "station") backToProduct();
      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && n <= stations.length) {
        const s = stations[n - 1];
        if (s) select(s.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stations, cameraStore, select, backToProduct]);

  // what the controls cover of the scene (px): the camera frames its shots in the rest
  const stageRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLElement>(null);
  const cardRef = useRef<HTMLElement>(null);
  const barRef = useRef<HTMLElement>(null);
  const [covered, setCovered] = useState({ top: 0, bottom: 0, start: 0 });
  useEffect(() => {
    const measure = () => {
      const stage = stageRef.current?.getBoundingClientRect();
      const top = topRef.current?.getBoundingClientRect();
      const bar = barRef.current?.getBoundingClientRect();
      const card = cardRef.current?.getBoundingClientRect();
      if (!stage || !top || !bar) return;
      // wide: the card stands at the start side (the right, in Arabic); narrow: it sits above the bar
      const beside = !!card && card.height > 0 && card.top < bar.top - 4 && card.width < stage.width * 0.6;
      const next = {
        top: Math.max(0, Math.round(top.bottom - stage.top)),
        bottom: Math.max(0, Math.round(stage.bottom - (card && !beside && card.height > 0 ? card.top : bar.top))),
        start: beside && card ? Math.max(0, Math.round(stage.right - card.left)) : 0,
      };
      setCovered((c) => (c.top === next.top && c.bottom === next.bottom && c.start === next.start ? c : next));
    };
    measure();
    const ro = new ResizeObserver(measure);
    for (const el of [stageRef.current, topRef.current, barRef.current, cardRef.current]) if (el) ro.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  });

  // A device too busy drawing the scene (no GPU) can hold a starting CSS animation at its first frame for seconds —
  // the window or its headline then stays invisible. An entrance that has not begun after ≈0.5 s is finished at once:
  // the content is always shown, animated where the device can.
  useEffect(() => {
    if (reducedMotion) return;
    const seen = new WeakMap<Animation, number>();
    const t = window.setInterval(() => {
      const now = performance.now();
      // only the window and the result card (the rest has no entrance), and only while one is starting
      for (const a of document.getAnimations()) {
        const el = (a.effect as KeyframeEffect | null)?.target as Element | null;
        if (!el?.closest("[data-station-panel], [data-leaving-panel], [data-result-card]")) continue;
        if (a.playState !== "running" || (Number(a.currentTime) || 0) > 0) continue;
        const first = seen.get(a) ?? now;
        seen.set(a, first);
        if (now - first > 450 && Number.isFinite(Number(a.effect?.getTiming().iterations ?? 1))) {
          try {
            a.finish();
          } catch {
            a.cancel();
          }
        }
      }
    }, 250);
    return () => window.clearInterval(t);
  }, [reducedMotion]);

  // the window in view, and the one leaving while the next comes in (kept a moment: no flash, no jump)
  const viewId =
    selected ?? state.current ?? (state.finished ? stations[stations.length - 1]?.id : stations[0]?.id) ?? "";
  const swap = useSwap(viewId, stations.find((s) => s.id === viewId) ?? null, reducedMotion);

  if (!hydrated) return <section className={styles.screen} aria-busy="true" />;

  if (!ready) {
    const teamState = approvalOf(project);
    const noTeam = !project.team || project.team.length === 0;
    const where = noTeam ? "/agents" : teamState !== "approved" ? "/team" : "/prototypes";
    return (
      <section className={cx(styles.screen, styles.gate)} aria-labelledby="factory-title" data-factory-gate="">
        <div className={styles.gateBox}>
          <h1 id="factory-title" className={styles.gateTitle}>
            {noTeam ? "اختر فريقك أولًا" : teamState !== "approved" ? "اعتمد فريقك أولًا" : "اعتمد نموذجك أولًا"}
          </h1>
          <p>
            {designApprovalOf(project) === "review"
              ? "تغيّرت الفكرة أو الفريق أو النموذج بعد اعتماد التصميم، فلا يتابع المصنع إنتاجًا على اعتماد قديم. راجع النموذج واعتمده من جديد."
              : "المصنع يبدأ بعد اعتماد الفريق والنموذج."}
          </p>
          <button type="button" className={styles.primary} onClick={() => go(where)} data-gate-go="">
            {noTeam ? "اختيار الوكلاء" : teamState !== "approved" ? "اعتماد الفريق" : "مراجعة النموذجين"}
          </button>
        </div>
      </section>
    );
  }

  const running = snap?.running ?? false;
  const started = (snap?.elapsed ?? 0) > 0;
  const current = state.current ? stations.find((s) => s.id === state.current) : null;
  // the station in view: the one chosen, else where the product is (the first before production, the last after it)
  const chosen = selected ? stations.find((s) => s.id === selected) : null;
  const inView = chosen ?? current ?? (state.finished ? stations[stations.length - 1] : stations[0]) ?? null;
  const build = buildLevel(stations, state);
  const prototype = PROTOTYPES.find((p) => p.id === model);
  const sceneStations = stations.map((s) => ({
    id: s.id,
    name: s.name,
    icon: s.icon,
    status: state.stations[s.id]?.status ?? "waiting",
  }));
  const message = guideLine(state, current ?? null, started, running, current ? stories[current.id] : undefined);

  return (
    <section
      className={styles.screen}
      aria-labelledby="factory-title"
      data-factory-screen=""
      data-camera-mode={cam.mode}
      data-camera-station={cam.station ?? ""}
      data-camera-settled={cam.settled ? "" : undefined}
      data-camera-request={cam.request}
      data-tour={tourPaused ? "paused" : "moving"}
      data-production={state.finished ? "finished" : running ? "running" : "paused"}
      data-webgl={webgl ? "yes" : "no"}
    >
      <div className={styles.stage} ref={stageRef}>
        {webgl && <Backdrop />}
        {webgl && !fonts ? (
          <div className={styles.loading}>يُجهَّز المصنع…</div>
        ) : webgl ? (
          <FactoryScene
            stations={sceneStations}
            selected={selected}
            travel={state.current ? state.travel : { to: -1, t: 0 }}
            build={build}
            waiting={!started}
            checking={state.current === "quality" && state.stations.quality?.status === "active"}
            delivered={state.stations.delivery?.status === "done"}
            model={model}
            copy={copy}
            camera={cameraStore}
            reducedMotion={reducedMotion}
            onSelect={select}
            tourPaused={tourPaused}
            covered={covered}
          />
        ) : (
          <div className={styles.fallback} data-webgl-fallback="">
            <p>
              <Icon name="info" size={18} /> متصفحك لا يعرض المشهد ثلاثي الأبعاد (WebGL غير متاح). تابع منتجك ومحطاته من
              هنا.
            </p>
            {prototype && (
              <div className={styles.fallbackProduct}>
                <PrototypePreview prototype={prototype} />
              </div>
            )}
          </div>
        )}
      </div>

      {/* the step's result by the product (follows it on screen while the camera follows it) */}
      {webgl && inView && stories[inView.id] && (
        <ResultCards
          station={inView.id}
          state={state}
          story={stories[inView.id]!}
          follow={!chosen}
          reducedMotion={reducedMotion}
          freeRight={covered.start}
        />
      )}

      <div className={styles.hud}>
        {/* the top: what this is (an illustration, labelled), whose project, the production's control; the history */}
        <header className={cx(styles.top, studio.top)} ref={topRef}>
          <div className={studio.topStart}>
            <h1 id="factory-title" className={studio.factoryTitle}>
              مصنع تشفير
            </h1>
            <p className={styles.history} aria-label="سجل المشروع">
              <span>
                <Icon name="check" size={14} /> تحليل الفكرة
              </span>
              <span>
                <Icon name="check" size={14} /> اعتماد الفريق
              </span>
              <span>
                <Icon name="check" size={14} /> اعتماد {modelName(model)}
              </span>
            </p>
          </div>
          <div className={studio.topEnd}>
            <p className={studio.project} data-project-title="">
              مشروعك: <b>{projectTitle(design.idea)}</b>
            </p>
            <div className={styles.control}>
              <span className={styles.simTag} data-simulation-tag="">
                محاكاة تفاعلية
              </span>
              <span className={styles.prodState} role="status" data-production-state="">
                {state.finished
                  ? "اكتمل خط الإنتاج (محاكاة)"
                  : running
                    ? `يعمل الآن: ${current?.name ?? "—"}`
                    : started
                      ? "الإنتاج متوقف مؤقتًا"
                      : "الإنتاج لم يبدأ"}
              </span>
              {!state.finished && (
                <button
                  type="button"
                  className={running ? styles.secondary : styles.primarySm}
                  onClick={() => (running ? source?.pause() : source?.start())}
                  aria-pressed={running}
                  data-production-toggle=""
                >
                  <Icon name={running ? "pause" : "play"} size={16} />
                  {running ? "إيقاف مؤقت" : started ? "استئناف" : "ابدأ الإنتاج"}
                </button>
              )}
            </div>
          </div>
        </header>

        <div className={cx(styles.middle, studio.middle)}>
          {inView && stories[inView.id] && (
            <StationWindow
              key={inView.id}
              ref={cardRef}
              station={inView}
              index={stations.indexOf(inView)}
              chosen={!!chosen}
              state={state}
              story={stories[inView.id]!}
              team={team}
              onBack={backToProduct}
              onDetails={() => setSheet({ kind: "details", station: inView.id })}
              reducedMotion={reducedMotion}
            />
          )}
          {swap.leaving && stories[swap.leaving.id] && (
            <StationWindow
              key={`leaving-${swap.leaving.id}`}
              station={swap.leaving}
              index={stations.indexOf(swap.leaving)}
              chosen={false}
              state={state}
              story={stories[swap.leaving.id]!}
              team={team}
              onBack={backToProduct}
              onDetails={() => {}}
              leaving
              reducedMotion={reducedMotion}
            />
          )}
        </div>

        {/* the bottom: Tashfeer's line (his mark), the stations' rail, the tour's controls and the journey's log */}
        <nav className={cx(styles.bar, studio.bottom)} aria-label="محطات المصنع" ref={barRef}>
          <div className={studio.tourBtns}>
            <button type="button" className={studio.roundBtn} onClick={() => setSheet({ kind: "log" })} data-journey-btn="">
              <Icon name="doc" size={16} /> سجل الرحلة
            </button>
            {webgl && (
              <>
                <button
                  type="button"
                  className={cx(studio.roundBtn, tourPaused && studio.roundOn)}
                  onClick={() => setTourPaused((p) => !p)}
                  aria-pressed={tourPaused}
                  data-tour-toggle=""
                >
                  <Icon name={tourPaused ? "play" : "pause"} size={16} />
                  {tourPaused ? "تشغيل الجولة" : "إيقاف الجولة"}
                </button>
                <button
                  type="button"
                  className={cx(studio.roundBtn, !selected && studio.roundOn)}
                  onClick={backToProduct}
                  aria-pressed={!selected}
                  data-cam-follow=""
                >
                  <Icon name="target" size={16} /> متابعة المنتج
                </button>
              </>
            )}
          </div>
          <ol className={studio.rail}>
            {stations.map((s, i) => {
              const st = state.stations[s.id];
              const here = (current?.id ?? stations[0]?.id) === s.id;
              return (
                <li key={s.id} className={cx(studio.railItem, st && studio[st.status])}>
                  <button
                    type="button"
                    className={cx(studio.railBtn, (selected === s.id || (!selected && here)) && studio.railOn)}
                    onClick={() => select(s.id)}
                    aria-pressed={selected === s.id}
                    aria-keyshortcuts={String(i + 1)}
                    data-station-btn={s.id}
                    data-status={st?.status}
                  >
                    <span className={studio.railLabel}>{s.name}</span>
                    <span className={studio.railIcon}>
                      {st?.status === "done" ? <StepIcon name="check" size={18} /> : <StepIcon name={STATION_ICON[s.id] ?? "layers"} size={18} />}
                    </span>
                    <span className="sr-only"> — {STATUS[st?.status ?? "waiting"]}</span>
                  </button>
                </li>
              );
            })}
          </ol>
          {/* Tashfeer: his mark and one line to the visitor, changed only when something meaningful changes */}
          <button type="button" className={studio.tashfeer} onClick={() => setSheet({ kind: "log" })} aria-label={`${message} — افتح سجل الرحلة`}>
            <Image src={asset("brand-mark").src} width={34} height={34} alt="" className={studio.tashfeerFace} />
            <span aria-live="polite" data-guide="" key={message}>
              {message}
            </span>
            <span aria-hidden="true" className={studio.tashfeerGo}>
              ‹
            </span>
          </button>
        </nav>
      </div>

      {sheet?.kind === "details" && (() => {
        const s = stations.find((x) => x.id === sheet.station);
        const st = s ? state.stations[s.id] : undefined;
        return s && st ? (
          <Sheet title={`تفاصيل ${s.name}`} label="details" onClose={() => setSheet(null)}>
            <StationDetails
              station={s}
              st={st}
              story={stories[s.id]!}
              log={events.filter((e) => e.station === s.id && e.at <= (snap?.elapsed ?? 0) && e.type !== "travel")}
              model={model}
            />
          </Sheet>
        ) : null;
      })()}
      {sheet?.kind === "log" && (
        <Sheet title="سجل الرحلة" label="log" onClose={() => setSheet(null)}>
          <JourneyLog stations={stations} stories={stories} events={events} elapsed={snap?.elapsed ?? 0} state={state} />
        </Sheet>
      )}
    </section>
  );
}

/**
 * Tashfeer's line to the visitor: where their product is, in a sentence. It depends on the production's state only, so
 * it changes when something meaningful happens (a new stage, an issue, a pause, the end) — never on a timer.
 */
function guideLine(
  state: FactoryState,
  current: Station | null,
  started: boolean,
  running: boolean,
  story?: StationStory,
): string {
  if (state.finished) return "اكتمل خط الإنتاج في المحاكاة، ووصل منتجك إلى نهاية الخط.";
  if (!started) return "منتجك جاهز على خط الإنتاج. ابدأ الإنتاج متى شئت.";
  if (!current) return "منتجك على خط الإنتاج.";
  if (!running) return `الإنتاج متوقف مؤقتًا، ومنتجك ينتظر في مرحلة ${current.name}.`;
  const st = state.stations[current.id];
  if (st && st.checks.some(openIssue)) return "ظهرت مشكلة في الفحص، وتُعالج الآن.";
  if (st?.status !== "active") return `منتجك في طريقه إلى مرحلة ${current.name}.`;
  const step = story?.steps[Math.max(0, st.step)];
  if (step && current.id === "interfaces") return `شوف ${step.label} وهي تتكوّن في منتجك قدامك`;
  if (step) return `منتجك الآن في مرحلة ${current.name}: ${step.headline}.`;
  return `منتجك الآن في مرحلة ${current.name}.`;
}

