/**
 * Optional diagnostics, hidden from visitors: opened with ?diag=1 (kept for the tab; ?diag=0 closes it). It measures
 * what really happens on this device — Tashfeer's drawing (frames per second, frame times), the renderer, and the
 * crossing's duration — and shows it in a small panel only in that tab (DiagnosticsPanel).
 *
 * ?tashfeer3d=full draws Tashfeer at full quality even on a software renderer (for reviews of his look).
 */
const KEY = "tashfeer.diag";

export function diagnosticsOn(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const q = new URLSearchParams(location.search).get("diag");
    if (q === "1") sessionStorage.setItem(KEY, "1");
    if (q === "0") sessionStorage.removeItem(KEY);
    return sessionStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function forceFullQuality(): boolean {
  return typeof window !== "undefined" && new URLSearchParams(location.search).get("tashfeer3d") === "full";
}

export type Measures = {
  renderer?: string;
  lite?: boolean;
  /** Tashfeer's drawn frames: per second over the last 2 s, and frame times (ms) */
  fps?: number;
  frameAvg?: number;
  frameP95?: number;
  drawCost?: number;
  /** the last crossing: from «ادخل» to the agents screen, and to settled (ms), with its steps */
  crossing?: { toNext: number; settled: number; steps: [string, number][]; at: string };
  /** the last short transition (ms) */
  transition?: { kind: string; ms: number };
};

const MEASURES = "tashfeer.diag.measures";
let current: Measures = {};
const listeners = new Set<() => void>();

export function readMeasures(): Measures {
  if (typeof window === "undefined") return current;
  try {
    const raw = sessionStorage.getItem(MEASURES);
    if (raw && !Object.keys(current).length) current = JSON.parse(raw) as Measures;
  } catch {}
  return current;
}

export function record(m: Partial<Measures>) {
  current = { ...readMeasures(), ...m };
  try {
    sessionStorage.setItem(MEASURES, JSON.stringify(current));
  } catch {}
  for (const l of listeners) l();
}

export function subscribeMeasures(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}
