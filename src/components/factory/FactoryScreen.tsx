"use client";

import Image from "next/image";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Icon } from "@/components/icons/Icon";
import { PrototypePreview } from "@/components/prototypes/PrototypePreview";
import {
  type FactoryState,
  type Station,
  type StationId,
  deriveFactory,
  openIssue,
  responsible,
  simulationScript,
  stationsFor,
} from "@/domain/factory";
import { PROTOTYPES, modelName } from "@/domain/prototypes";
import { asset } from "@/lib/assets";
import { cx } from "@/lib/cx";
import { type FactorySource, createSimulation } from "@/lib/factory-source";
import { transitionTo } from "@/lib/page-transition";
import { approvalOf, designApprovalOf, useProject } from "@/lib/project-store";
import { createCameraStore, useCamera } from "./camera-store";
import styles from "./FactoryScreen.module.css";

/* the 3D scene is loaded in the browser only, and only on this screen */
const FactoryScene = dynamic(() => import("./FactoryScene"), {
  ssr: false,
  loading: () => <div className={styles.loading}>يُجهَّز المصنع…</div>,
});

const noop = () => () => {};
const STATUS: Record<string, string> = { waiting: "لم تبدأ", active: "قيد العمل", done: "مكتملة" };
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
 * production line through the stations their team works at. They watch it (the camera follows it), stop at any
 * station to see who works there, on what, what it has produced and what went wrong and how it was fixed — or look
 * around freely. What happens comes from an event source; today a local simulation, labelled as such.
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
  const events = useMemo(() => simulationScript(stations, model), [stations, model]);
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
  const select = (id: StationId) => {
    setSelected(id);
    cameraStore.go("station", id);
  };

  // keyboard: 1–9 choose a station, Esc closes its panel
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el?.closest("input, textarea, [contenteditable]")) return;
      if (e.key === "Escape") setSelected(null);
      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && n <= stations.length) {
        const s = stations[n - 1];
        if (s) {
          setSelected(s.id);
          cameraStore.go("station", s.id);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stations, cameraStore]);

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
  const current = state.current ? stations.find((s) => s.id === state.current) : null;
  const panelStation = selected ? stations.find((s) => s.id === selected) : null;
  const started = (snap?.elapsed ?? 0) > 0;
  const guide = panelStation ?? (started ? current : null);
  const build = buildLevel(stations, state);
  const prototype = PROTOTYPES.find((p) => p.id === model);
  const sceneStations = stations.map((s) => ({
    id: s.id,
    name: s.name,
    icon: s.icon,
    status: state.stations[s.id]?.status ?? "waiting",
  }));

  return (
    <section
      className={styles.screen}
      aria-labelledby="factory-title"
      data-factory-screen=""
      data-camera-mode={cam.mode}
      data-camera-station={cam.station ?? ""}
      data-camera-settled={cam.settled ? "" : undefined}
      data-camera-request={cam.request}
      data-production={state.finished ? "finished" : running ? "running" : "paused"}
      data-webgl={webgl ? "yes" : "no"}
    >
      <div className={styles.stage}>
        {webgl && !fonts ? (
          <div className={styles.loading}>يُجهَّز المصنع…</div>
        ) : webgl ? (
          <FactoryScene
            stations={sceneStations}
            selected={selected}
            travel={state.current ? state.travel : { to: -1, t: 0 }}
            build={build}
            checking={state.current === "quality" && state.stations.quality?.status === "active"}
            delivered={state.stations.delivery?.status === "done"}
            model={model}
            camera={cameraStore}
            reducedMotion={reducedMotion}
            onSelect={select}
            tashfeerSrc={asset("tashfeer").src}
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

      {/* the top: where the project is, and the production's control */}
      <header className={styles.top}>
        <div className={styles.titleBlock}>
          <h1 id="factory-title" className={styles.title}>
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
        <div className={styles.control}>
          <span className={styles.simTag} data-simulation-tag="">
            محاكاة تفاعلية
          </span>
          <span className={styles.prodState} role="status" data-production-state="">
            {state.finished
              ? "اكتمل خط الإنتاج (محاكاة)"
              : running
                ? `يعمل الآن: ${current?.name ?? "—"}`
                : (snap?.elapsed ?? 0) > 0
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
              {running ? "إيقاف مؤقت" : (snap?.elapsed ?? 0) > 0 ? "استئناف" : "ابدأ الإنتاج"}
            </button>
          )}
        </div>
      </header>

      {/* Tashfeer, the guide */}
      <aside className={cx(styles.guide, panelStation && styles.guideHidden)} aria-live="polite" data-guide="">
        <Image src={asset("brand-mark").src} width={44} height={44} alt="" className={styles.guideFace} />
        <p>
          {guide
            ? guide.guide
            : "أهلًا بك في مصنعك. منتجك على خط الإنتاج؛ ابدأ الإنتاج، أو اختر محطة لتستكشفها."}
        </p>
      </aside>

      {/* the stations and the camera */}
      <nav className={styles.bar} aria-label="محطات المصنع">
        <ol className={styles.stations}>
          {stations.map((s, i) => {
            const st = state.stations[s.id];
            return (
              <li key={s.id}>
                <button
                  type="button"
                  className={cx(styles.stationBtn, selected === s.id && styles.stationOn)}
                  onClick={() => select(s.id)}
                  aria-pressed={selected === s.id}
                  aria-keyshortcuts={String(i + 1)}
                  data-station-btn={s.id}
                  data-status={st?.status}
                >
                  <span className={cx(styles.dot, st && styles[st.status])} aria-hidden="true" />
                  <span className={styles.stationNum}>{String(i + 1).padStart(2, "0")}</span>
                  {s.name}
                  <span className="sr-only"> — {STATUS[st?.status ?? "waiting"]}</span>
                </button>
              </li>
            );
          })}
        </ol>
        {webgl && (
          <div className={styles.camBtns}>
            <button
              type="button"
              className={cx(styles.camBtn, cam.mode === "follow" && styles.camOn)}
              onClick={() => {
                setSelected(null);
                cameraStore.go("follow");
              }}
              aria-pressed={cam.mode === "follow"}
              data-cam-follow=""
            >
              <Icon name="target" size={16} /> متابعة المنتج
            </button>
            <button
              type="button"
              className={cx(styles.camBtn, cam.mode === "overview" && styles.camOn)}
              onClick={() => {
                setSelected(null);
                cameraStore.go("overview");
              }}
              aria-pressed={cam.mode === "overview"}
              data-cam-overview=""
            >
              <Icon name="search" size={16} /> المشهد الكامل
            </button>
            {/* for reviewing the visual sample: the reference image's angle */}
            <button
              type="button"
              className={cx(styles.camBtn, cam.mode === "sample" && styles.camOn)}
              onClick={() => {
                setSelected(null);
                cameraStore.go("sample");
              }}
              aria-pressed={cam.mode === "sample"}
              data-cam-sample=""
            >
              <Icon name="image" size={16} /> زاوية العينة
            </button>
          </div>
        )}
        {webgl && (
          <p className={styles.hint}>اسحب للنظر حولك · مرّر العجلة أو قرّب بإصبعين للتقريب · زر الفأرة الأيمن أو إصبعان للتنقل</p>
        )}
      </nav>

      {panelStation && (
        <StationPanel
          station={panelStation}
          index={stations.indexOf(panelStation)}
          state={state}
          team={team}
          model={model}
          onClose={() => setSelected(null)}
          events={events}
          elapsed={snap?.elapsed ?? 0}
        />
      )}
    </section>
  );
}

function StationPanel({
  station,
  index,
  state,
  team,
  model,
  onClose,
  events,
  elapsed,
}: {
  station: Station;
  index: number;
  state: FactoryState;
  team: readonly string[];
  model: "A" | "B";
  onClose: () => void;
  events: ReturnType<typeof simulationScript>;
  elapsed: number;
}) {
  const st = state.stations[station.id];
  if (!st) return null;
  const prototype = PROTOTYPES.find((p) => p.id === model);
  const log = events.filter((e) => e.station === station.id && e.at <= elapsed && e.type !== "travel");
  return (
    <aside
      className={styles.panel}
      aria-labelledby="station-title"
      data-station-panel={station.id}
    >
      <header className={styles.panelHead}>
        <span className={styles.panelNum}>{String(index + 1).padStart(2, "0")}</span>
        <h2 id="station-title">{station.name}</h2>
        <span className={cx(styles.status, styles[st.status])} data-panel-status={st.status}>
          {STATUS[st.status]}
        </span>
        <button type="button" className={styles.close} onClick={onClose} aria-label="إغلاق التفاصيل" data-panel-close="">
          ×
        </button>
      </header>

      <p className={styles.simNote}>
        <Icon name="info" size={14} /> محاكاة تفاعلية — ليست نتائج عمل حقيقي.
      </p>

      {/* the essentials: who, and what now; everything else opens on request */}
      <dl className={styles.rows}>
        <div>
          <dt>الوكيل</dt>
          <dd data-panel-agent="">{responsible(station, team)}</dd>
        </div>
        <div>
          <dt>المهمة الحالية</dt>
          <dd data-panel-task="">
            {st.task ?? (st.status === "done" ? "اكتملت مهام المحطة" : "لم تبدأ بعد")}
          </dd>
        </div>
      </dl>

      <details className={styles.more} data-panel-details="">
        <summary>
          المخرجات{station.id === "quality" ? " والفحوص" : ""}
          {openCount(st) > 0 && <span className={styles.issueDot}>مشكلة مفتوحة</span>}
        </summary>
        <dl className={styles.rows}>
          <div>
            <dt>المخرج المتاح</dt>
            <dd data-panel-output="">{st.outputs.length ? st.outputs.join("، ") : "لا يوجد مخرج بعد"}</dd>
          </div>
        </dl>

        {station.id === "quality" && (
          <section className={styles.checks} aria-label="الفحوص" data-panel-checks="">
            <h3>الفحوص</h3>
            {st.checks.length === 0 ? (
              <p className={styles.muted}>لم يُجرَ أي فحص بعد.</p>
            ) : (
              <ul>
                {st.checks.map((c) => (
                  <li key={c.id} data-check={c.id} data-check-state={openIssue(c) ? "open" : "pass"}>
                    <b>{c.label}</b>
                    <ol>
                      {c.runs.map((r, i) => (
                        <li key={i} className={r.result === "fail" ? styles.fail : styles.pass}>
                          {r.result === "fail" ? "مشكلة: " : i > 0 ? "إعادة الاختبار: نجح — " : "نجح — "}
                          {r.detail}
                          {r.result === "fail" && c.fix && i === 0 && (
                            <span className={styles.fix} data-check-fix="">المعالجة: {c.fix}</span>
                          )}
                          {r.result === "fail" && !c.fix && <span className={styles.fixPending}>المعالجة جارية</span>}
                        </li>
                      ))}
                    </ol>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {station.id === "delivery" && (
          <section className={styles.delivery} data-panel-delivery="">
            <h3>معاينة المنتج</h3>
            {prototype && <PrototypePreview prototype={prototype} />}
            <p className={styles.muted}>
              {st.status === "done"
                ? "اكتمل الخط في المحاكاة. لا يوجد ملف للتنزيل ولا رابط منشور: لم يُنتَج مخرج حقيقي بعد."
                : "لا يوجد ملف للتنزيل ولا رابط منشور بعد."}
            </p>
          </section>
        )}

        {log.length > 0 && (
          <div className={styles.tech}>
            <h3>السجل</h3>
            <ul>
              {log.map((e, i) => (
                <li key={i}>
                  <time>{formatTime(e.at)}</time> {describe(e)}
                </li>
              ))}
            </ul>
          </div>
        )}
      </details>
    </aside>
  );
}

function openCount(st: FactoryState["stations"][string]) {
  return st.checks.filter(openIssue).length;
}

function formatTime(s: number) {
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

function describe(e: ReturnType<typeof simulationScript>[number]): string {
  switch (e.type) {
    case "start":
      return `بدأ: ${e.task}`;
    case "task":
      return `المهمة: ${e.task}`;
    case "output":
      return `مخرج: ${e.output}`;
    case "check":
      return `فحص «${e.label}»: ${e.result === "pass" ? "نجح" : "فشل"}`;
    case "fix":
      return `معالجة: ${e.detail}`;
    case "done":
      return "اكتملت المحطة";
    default:
      return "";
  }
}
