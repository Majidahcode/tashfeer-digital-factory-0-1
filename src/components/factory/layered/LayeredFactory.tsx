"use client";

/**
 * A trial (for review, beside the current factory): the factory as layers of the owner's own pictures — the belt and
 * two glass stations — in 2.5D. The same for every client: the pictures never change; what changes is real HTML on top
 * (the project's data, the production's state), from the same project store and the same simulation as /factory.
 *
 * The camera answers only the visitor (choose a station, back to the whole scene, a little tilt and zoom); production
 * runs on its own and never moves it.
 */
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { SRGBColorSpace, type Texture, TextureLoader } from "three";
import { type StationId, deriveFactory, responsible, simulationScript, stationsFor } from "@/domain/factory";
import { modelName } from "@/domain/prototypes";
import { type FactorySource, createSimulation } from "@/lib/factory-source";
import { approvalOf, designApprovalOf, useProject } from "@/lib/project-store";
import { ALL_SOURCES, LAYER_STATIONS, type LayerStationId } from "./layout";
import type { CameraReport, CameraView } from "./LayeredScene";
import styles from "./LayeredFactory.module.css";

const Scene = dynamic(() => import("./LayeredScene"), { ssr: false });

const noop = () => () => {};
const motionQuery = () => window.matchMedia("(prefers-reduced-motion: reduce)");
const subscribeMotion = (cb: () => void) => {
  const m = motionQuery();
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
};

declare global {
  interface Window {
    /** how many times each picture was fetched (each once: data changes never reload the scene) */
    __layeredLoads?: Record<string, number>;
  }
}

/** the pictures, loaded once before the scene starts */
function usePictures() {
  const [textures, setTextures] = useState<Record<string, Texture> | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    const loader = new TextureLoader();
    window.__layeredLoads = window.__layeredLoads ?? {};
    Promise.all(
      ALL_SOURCES.map(async (src) => {
        window.__layeredLoads![src] = (window.__layeredLoads![src] ?? 0) + 1;
        const t = await loader.loadAsync(src);
        t.colorSpace = SRGBColorSpace;
        t.anisotropy = 4;
        return [src, t] as const;
      }),
    )
      .then((list) => alive && setTextures(Object.fromEntries(list)))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, []);
  return { textures, failed };
}

const STATUS: Record<string, string> = { waiting: "بانتظار دورها", active: "تعمل الآن", done: "اكتملت" };

export function LayeredFactory() {
  const project = useProject();
  const hydrated = useSyncExternalStore(noop, () => true, () => false);
  const reducedMotion = useSyncExternalStore(subscribeMotion, () => motionQuery().matches, () => false);
  const { textures, failed } = usePictures();

  // the same data and the same simulation as /factory
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
  const snap = useSyncExternalStore(source?.subscribe ?? noop, () => source?.snapshot() ?? null, () => null);
  const state = useMemo(() => deriveFactory(stations, events, snap?.elapsed ?? 0), [stations, events, snap?.elapsed]);

  // the camera: only the visitor moves it
  const [view, setView] = useState<CameraView>({ mode: "overview" });
  const [cam, setCam] = useState<CameraReport>({ mode: "overview", id: null, settled: false });
  const panel = useRef<HTMLDivElement>(null);
  // a new view: reported as moving at once (the scene reports the arrival); the same view again changes nothing
  const viewRef = useRef<CameraView>(view);
  const go = useCallback((next: CameraView) => {
    const cur = viewRef.current;
    if (cur.mode === next.mode && (cur.mode === "overview" || (next.mode === "station" && cur.id === next.id))) return;
    viewRef.current = next;
    setView(next);
    setCam({ mode: next.mode, id: next.mode === "station" ? next.id : null, settled: false });
  }, []);
  const select = useCallback((id: LayerStationId) => go({ mode: "station", id }), [go]);
  const overview = useCallback(() => go({ mode: "overview" }), [go]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.closest("input, textarea")) return;
      if (e.key === "Escape") overview();
      if (e.key === "1") select("s04");
      if (e.key === "2") select("s05");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [select, overview]);

  if (!hydrated) return <section className={styles.screen} aria-busy="true" />;
  if (!ready)
    return (
      <section className={styles.gate} data-layered-gate="">
        <h1>المصنع يبدأ بعد اعتماد الفريق والنموذج</h1>
        <Link href="/prototypes">مراجعة النموذجين</Link>
      </section>
    );

  const running = snap?.running ?? false;
  const started = (snap?.elapsed ?? 0) > 0;
  const chosen = view.mode === "station" ? LAYER_STATIONS.find((s) => s.id === view.id)! : null;
  const showPanel = !!chosen && cam.mode === "station" && cam.id === chosen.id && cam.settled;

  return (
    <section
      className={styles.screen}
      aria-labelledby="layered-title"
      data-layered=""
      data-ready={textures ? "true" : undefined}
      data-camera-mode={cam.mode}
      data-camera-station={cam.id ?? ""}
      data-camera-settled={cam.settled ? "true" : undefined}
      data-production={state.finished ? "finished" : running ? "running" : "paused"}
    >
      <header className={styles.top}>
        <div className={styles.titleBlock}>
          <span className={styles.kicker}>تجربة للمراجعة · طبقات 2.5D</span>
          <h1 id="layered-title">مصنع تشفير</h1>
        </div>
        <div className={styles.prod}>
          <span className={styles.sim} data-sim-label="">محاكاة تفاعلية</span>
          <span className={styles.prodState}>
            {state.finished ? "اكتمل الإنتاج" : running ? "الإنتاج يعمل" : started ? "الإنتاج متوقف مؤقتًا" : "الإنتاج لم يبدأ"}
          </span>
          {!state.finished && (
            <button
              type="button"
              className={running ? styles.secondary : styles.primary}
              onClick={() => (running ? source?.pause() : source?.start())}
              data-production-toggle=""
            >
              {running ? "إيقاف مؤقت" : started ? "استئناف" : "ابدأ الإنتاج"}
            </button>
          )}
        </div>
      </header>

      <div className={styles.stage}>
        {failed ? (
          <p className={styles.loading}>تعذّر تحميل صور المصنع.</p>
        ) : !textures ? (
          <p className={styles.loading} data-layered-loading="">
            يُجهَّز المصنع…
          </p>
        ) : (
          <Scene
            textures={textures}
            view={view}
            reducedMotion={reducedMotion}
            panel={panel}
            onSelect={select}
            onCamera={setCam}
          />
        )}
        {/* the project's content, real HTML, placed by the scene over the chosen station's content area */}
        <div
          ref={panel}
          className={styles.panel}
          data-content-panel={chosen?.id ?? ""}
          data-visible={showPanel ? "true" : undefined}
          aria-hidden={!showPanel}
        >
          {chosen && <StationContent station={chosen} state={state} stations={stations} team={team} model={model} idea={design?.idea ?? ""} />}
        </div>
      </div>

      <nav className={styles.bottom} aria-label="التنقل في المصنع">
        <button type="button" aria-pressed={view.mode === "overview"} onClick={overview} data-view-overview="">
          المشهد الكامل
        </button>
        {LAYER_STATIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            aria-pressed={view.mode === "station" && view.id === s.id}
            onClick={() => select(s.id)}
            data-view-station={s.id}
          >
            <span className={styles.num}>{s.num}</span> {s.title}
          </button>
        ))}
      </nav>
    </section>
  );
}

function StationContent({
  station,
  state,
  stations,
  team,
  model,
  idea,
}: {
  station: (typeof LAYER_STATIONS)[number];
  state: ReturnType<typeof deriveFactory>;
  stations: ReturnType<typeof stationsFor>;
  team: readonly string[];
  model: "A" | "B";
  idea: string;
}) {
  const stage = stations.find((s) => s.id === (station.stage as StationId));
  const st = stage ? state.stations[stage.id] : undefined;
  return (
    <div className={styles.content} data-station-content={station.id}>
      <div className={styles.cHead}>
        <h2>
          <span className={styles.num}>{station.num}</span> {station.title}
        </h2>
        <span className={styles.chip} data-status={stage ? (st?.status ?? "waiting") : "absent"}>
          {stage ? STATUS[st?.status ?? "waiting"] : "غير مشمولة في فريقك"}
        </span>
      </div>
      {stage ? (
        <dl className={styles.rows}>
          <div>
            <dt>المرحلة</dt>
            <dd>{stage.name}</dd>
          </div>
          <div>
            <dt>الوكيل</dt>
            <dd>{responsible(stage, team)}</dd>
          </div>
          <div>
            <dt>المهمة الحالية</dt>
            <dd data-task="">{st?.task ?? "—"}</dd>
          </div>
          <div>
            <dt>{station.stage === "interfaces" ? "النموذج المعتمد" : "الفكرة"}</dt>
            <dd>{station.stage === "interfaces" ? modelName(model) : idea}</dd>
          </div>
          <div>
            <dt>المخرجات</dt>
            <dd data-outputs="">{st?.outputs.length ? st.outputs.join("، ") : "لا مخرجات بعد"}</dd>
          </div>
        </dl>
      ) : (
        <p className={styles.absent}>فريقك المعتمد لا يشمل هذه المرحلة.</p>
      )}
      <p className={styles.simNote}>محاكاة تفاعلية — لا تمثّل عملًا منفّذًا فعلًا.</p>
    </div>
  );
}
