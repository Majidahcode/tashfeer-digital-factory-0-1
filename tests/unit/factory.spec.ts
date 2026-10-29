import { expect, test } from "@playwright/test";
import {
  deriveFactory,
  openIssue,
  responsible,
  scriptLength,
  simulationScript,
  stationsFor,
} from "../../src/domain/factory";
import { createSimulation } from "../../src/lib/factory-source";

const TEAM = ["ux", "back", "front", "qa", "ops"];

test("the stations follow the team: setup, quality and delivery always; interfaces and services when the team builds them", () => {
  expect(stationsFor(TEAM).map((s) => s.id)).toEqual(["setup", "interfaces", "services", "quality", "delivery"]);
  expect(stationsFor(["ux"]).map((s) => s.id)).toEqual(["setup", "interfaces", "quality", "delivery"]);
  expect(stationsFor([]).map((s) => s.id)).toEqual(["setup", "quality", "delivery"]);
  // never the history: analysis and the approvals are not stations
  for (const s of stationsFor(TEAM)) expect(s.name).not.toMatch(/تحليل|اعتماد/);
});

test("who is responsible: the team's agent for the station, else Tashfeer", () => {
  const [setup, interfaces, , quality, delivery] = stationsFor(TEAM);
  expect(responsible(interfaces!, TEAM)).toBe("المطور الأمامي");
  expect(responsible(quality!, TEAM)).toBe("اختبار الجودة");
  expect(responsible(delivery!, TEAM)).toBe("العمليات");
  expect(responsible(setup!, TEAM)).toBe("تشفير");
});

test("the state comes from the events that have happened, nothing else", () => {
  const stations = stationsFor(TEAM);
  const events = simulationScript(stations, "B");
  const at0 = deriveFactory(stations, events, 0);
  expect(Object.values(at0.stations).every((s) => s.status === "waiting")).toBe(true);
  expect(at0.travel).toEqual({ to: 0, t: 0 });
  expect(at0.finished).toBe(false);

  // the script's events are in time order
  const times = events.map((e) => e.at);
  expect([...times].sort((a, b) => a - b)).toEqual(times);

  const end = scriptLength(events);
  const done = deriveFactory(stations, events, end);
  expect(done.finished).toBe(true);
  expect(Object.values(done.stations).every((s) => s.status === "done")).toBe(true);
  expect(done.stations.interfaces!.outputs).toEqual(["الصفحات الرئيسية بتصميم النموذج B"]);
});

test("quality: a failed check, its fix and the retest, each only once it has happened", () => {
  const stations = stationsFor(TEAM);
  const events = simulationScript(stations, "A");
  const at = (type: string, check?: string) =>
    events.find((e) => e.type === type && (!check || ("check" in e && e.check === check)))!.at;
  const fail = events.find((e) => e.type === "check" && e.result === "fail")!.at;
  const fix = at("fix", "mobile");
  const retest = events.filter((e) => e.type === "check" && e.check === "mobile").at(-1)!.at;

  const before = deriveFactory(stations, events, fail - 0.01).stations.quality!;
  expect(before.checks.find((c) => c.id === "mobile")).toBeUndefined();

  const failed = deriveFactory(stations, events, fail).stations.quality!.checks.find((c) => c.id === "mobile")!;
  expect(openIssue(failed)).toBe(true);
  expect(failed.fix).toBeNull();

  const fixed = deriveFactory(stations, events, fix).stations.quality!.checks.find((c) => c.id === "mobile")!;
  expect(fixed.fix).toBeTruthy();
  expect(openIssue(fixed)).toBe(true); // fixed, not yet retested

  const passed = deriveFactory(stations, events, retest).stations.quality!.checks.find((c) => c.id === "mobile")!;
  expect(passed.runs.map((r) => r.result)).toEqual(["fail", "pass"]);
  expect(openIssue(passed)).toBe(false);
});

test("the simulation: paused when created, keeps its progress per approval, starts over when the approval changes", async () => {
  const store = new Map<string, string>();
  const g = globalThis as unknown as { window: unknown };
  g.window = Object.assign(globalThis, {
    sessionStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
  });
  const stations = stationsFor(TEAM);
  const events = simulationScript(stations, "B");

  const a = createSimulation(events, "approval-1", 40);
  expect(a.snapshot()).toMatchObject({ running: false, elapsed: 0, kind: "simulation" });
  a.start();
  await new Promise((r) => setTimeout(r, 450));
  a.pause();
  const kept = a.snapshot().elapsed;
  expect(kept).toBeGreaterThan(5);
  a.dispose();

  // reopened: paused, where it was
  const b = createSimulation(events, "approval-1", 40);
  expect(b.snapshot()).toMatchObject({ running: false, elapsed: kept });
  b.dispose();

  // another approval: nothing carried over
  const c = createSimulation(events, "approval-2", 40);
  expect(c.snapshot().elapsed).toBe(0);
  c.dispose();
});
