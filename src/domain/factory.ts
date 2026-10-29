/**
 * The production factory (screen 5): the stations the product passes through, chosen from the approved team, and the
 * script of the local simulation that drives them today.
 *
 * Nothing here runs real work. The script is a list of timed events that src/lib/factory-source.ts plays; a real
 * source (the agents' own events) can replace it without touching the scene or the panel, which only read the state
 * derived from events (deriveFactory). The analysis, the team and the design approval are history, not stations.
 */
import { AGENTS } from "@/domain/agents";
import type { ModelId } from "@/lib/project-store";

export type StationId = "setup" | "interfaces" | "services" | "quality" | "delivery";

export type Station = {
  id: StationId;
  name: string;
  /** who is responsible: the first of these agents that is in the team, else Tashfeer himself */
  agents: readonly string[];
  /** what Tashfeer says about the station, in one line */
  guide: string;
  icon: "tools" | "pen" | "code" | "check" | "rocket";
};

const ALL: readonly Station[] = [
  {
    id: "setup",
    name: "تجهيز المشروع",
    agents: ["arch", "pm"],
    guide: "هنا يُجهَّز هيكل مشروعك على التصور الذي اعتمدته.",
    icon: "tools",
  },
  {
    id: "interfaces",
    name: "تنفيذ الواجهات",
    agents: ["front", "ux"],
    guide: "هنا تتحول صفحات تصميمك المعتمد إلى واجهات تعمل.",
    icon: "pen",
  },
  {
    id: "services",
    name: "الخدمات والبيانات",
    agents: ["back", "db"],
    guide: "هنا تُبنى الخدمات والبيانات التي تشغّل منتجك.",
    icon: "code",
  },
  {
    id: "quality",
    name: "الجودة",
    agents: ["qa", "sec", "perf"],
    guide: "هنا يُفحص منتجك، وكل مشكلة تُعالج ثم يُعاد اختبارها.",
    icon: "check",
  },
  {
    id: "delivery",
    name: "التسليم",
    agents: ["ops"],
    guide: "هنا يصل منتجك إلى نهاية الخط، مع ما هو متاح منه فعلًا.",
    icon: "rocket",
  },
];

/** The stations for this team: setup, quality and delivery always; interfaces and services when the team builds them. */
export function stationsFor(team: readonly string[]): Station[] {
  return ALL.filter(
    (s) =>
      s.id === "setup" ||
      s.id === "quality" ||
      s.id === "delivery" ||
      s.agents.some((a) => team.includes(a)),
  );
}

export function responsible(station: Station, team: readonly string[]): string {
  const id = station.agents.find((a) => team.includes(a));
  return AGENTS.find((a) => a.id === id)?.ar ?? "تشفير";
}

/* ── events ── */

export type CheckResult = "pass" | "fail";
export type FactoryEvent =
  | { at: number; type: "travel"; station: StationId }
  | { at: number; type: "start"; station: StationId; task: string }
  | { at: number; type: "task"; station: StationId; task: string }
  | { at: number; type: "output"; station: StationId; output: string }
  | {
      at: number;
      type: "check";
      station: StationId;
      check: string;
      label: string;
      result: CheckResult;
      detail: string;
    }
  | { at: number; type: "fix"; station: StationId; check: string; detail: string }
  | { at: number; type: "done"; station: StationId };

const TRAVEL = 4;
const WORK: Record<StationId, number> = { setup: 12, interfaces: 16, services: 14, quality: 20, delivery: 10 };

/** The simulation's script for these stations (seconds from the start of production). */
export function simulationScript(stations: readonly Station[], model: ModelId): FactoryEvent[] {
  const events: FactoryEvent[] = [];
  const hasServices = stations.some((s) => s.id === "services");
  let t = 0;
  for (const s of stations) {
    events.push({ at: t, type: "travel", station: s.id });
    t += TRAVEL;
    const at = (d: number) => t + d;
    const st = s.id;
    switch (st) {
      case "setup":
        events.push(
          { at: at(0), type: "start", station: st, task: "إنشاء هيكل المشروع وإعداداته" },
          { at: at(6), type: "task", station: st, task: `ربط هوية النموذج ${model} بالمشروع` },
          { at: at(WORK.setup), type: "output", station: st, output: "هيكل المشروع وإعداداته" },
        );
        break;
      case "interfaces":
        events.push(
          { at: at(0), type: "start", station: st, task: `تنفيذ صفحات النموذج ${model}` },
          { at: at(8), type: "task", station: st, task: "ربط الصفحات وضبطها على الجوال" },
          { at: at(WORK.interfaces), type: "output", station: st, output: `الصفحات الرئيسية بتصميم النموذج ${model}` },
        );
        break;
      case "services":
        events.push(
          { at: at(0), type: "start", station: st, task: "بناء نموذج البيانات" },
          { at: at(7), type: "task", station: st, task: "بناء الخدمات وربطها بالواجهات" },
          { at: at(WORK.services), type: "output", station: st, output: "الخدمات ونموذج البيانات" },
        );
        break;
      case "quality":
        events.push(
          { at: at(0), type: "start", station: st, task: "تشغيل فحوص المنتج" },
          {
            at: at(3),
            type: "check",
            station: st,
            check: "load",
            label: "تحميل الصفحات الرئيسية",
            result: "pass",
            detail: "كل الصفحات تُحمَّل دون أخطاء.",
          },
          {
            at: at(6),
            type: "check",
            station: st,
            check: "mobile",
            label: "العرض على الجوال",
            result: "fail",
            detail: "قائمة التنقل تتداخل مع العنوان على عرض 390px.",
          },
          { at: at(9), type: "task", station: st, task: "معالجة مشكلة العرض على الجوال" },
          {
            at: at(11),
            type: "fix",
            station: st,
            check: "mobile",
            detail: "أُعيد ترتيب قائمة التنقل للشاشات الضيقة.",
          },
          { at: at(12), type: "task", station: st, task: "إعادة اختبار العرض على الجوال" },
          {
            at: at(14),
            type: "check",
            station: st,
            check: "mobile",
            label: "العرض على الجوال",
            result: "pass",
            detail: "لا تداخل بعد المعالجة على 390px.",
          },
          hasServices
            ? {
                at: at(17),
                type: "check",
                station: st,
                check: "services",
                label: "الربط مع الخدمات",
                result: "pass",
                detail: "الواجهات تقرأ من الخدمات وتكتب إليها.",
              }
            : {
                at: at(17),
                type: "check",
                station: st,
                check: "speed",
                label: "سرعة التحميل",
                result: "pass",
                detail: "الصفحة الرئيسية تُحمَّل في أقل من ثانيتين.",
              },
          { at: at(WORK.quality), type: "output", station: st, output: "تقرير الفحص" },
        );
        break;
      case "delivery":
        events.push(
          { at: at(0), type: "start", station: st, task: "تجهيز معاينة المنتج" },
          { at: at(WORK.delivery), type: "output", station: st, output: "معاينة المنتج" },
        );
        break;
    }
    t += WORK[st];
    events.push({ at: t, type: "done", station: st });
  }
  return events;
}

export function scriptLength(events: readonly FactoryEvent[]): number {
  return events.reduce((m, e) => Math.max(m, e.at), 0);
}

/* ── state, derived from the events that have happened ── */

export type StationStatus = "waiting" | "active" | "done";
export type CheckState = {
  id: string;
  label: string;
  /** every run of this check, in order: a failure, its fix, the retest */
  runs: { result: CheckResult; detail: string }[];
  fix: string | null;
};
export type StationState = {
  status: StationStatus;
  task: string | null;
  outputs: string[];
  checks: CheckState[];
  /** 0..1 through the station's work */
  progress: number;
};
export type FactoryState = {
  stations: Record<string, StationState>;
  /** the station the product is at or travelling to (null before the first event) */
  current: StationId | null;
  /** the product along the line: index of the station it is travelling to, and how far (0..1) it has travelled */
  travel: { to: number; t: number };
  finished: boolean;
};

export function deriveFactory(
  stations: readonly Station[],
  events: readonly FactoryEvent[],
  elapsed: number,
): FactoryState {
  const s: Record<string, StationState> = {};
  for (const st of stations)
    s[st.id] = { status: "waiting", task: null, outputs: [], checks: [], progress: 0 };
  let current: StationId | null = null;
  let travelStart = 0;
  let workStart = Number.POSITIVE_INFINITY;
  for (const e of events) {
    if (e.at > elapsed) break;
    const st = s[e.station];
    if (!st) continue;
    switch (e.type) {
      case "travel":
        current = e.station;
        travelStart = e.at;
        workStart = Number.POSITIVE_INFINITY;
        break;
      case "start":
        st.status = "active";
        st.task = e.task;
        workStart = e.at;
        break;
      case "task":
        st.task = e.task;
        break;
      case "output":
        st.outputs.push(e.output);
        break;
      case "check": {
        let c = st.checks.find((x) => x.id === e.check);
        if (!c) {
          c = { id: e.check, label: e.label, runs: [], fix: null };
          st.checks.push(c);
        }
        c.runs.push({ result: e.result, detail: e.detail });
        break;
      }
      case "fix": {
        const c = st.checks.find((x) => x.id === e.check);
        if (c) c.fix = e.detail;
        break;
      }
      case "done":
        st.status = "done";
        st.task = null;
        st.progress = 1;
        break;
    }
  }
  const idx = current ? stations.findIndex((x) => x.id === current) : -1;
  const cur = current ? s[current] : undefined;
  if (current && cur?.status === "active") {
    cur.progress = Math.min(1, Math.max(0, (elapsed - workStart) / WORK[current]));
  }
  const end = scriptLength(events);
  return {
    stations: s,
    current,
    travel: {
      to: Math.max(0, idx),
      t: idx < 0 ? 0 : Math.min(1, Math.max(0, (elapsed - travelStart) / TRAVEL)),
    },
    finished: elapsed >= end,
  };
}

/** A run is a failure that is still open: failed, and not passed since. */
export function openIssue(c: CheckState): boolean {
  return c.runs.at(-1)?.result === "fail";
}
