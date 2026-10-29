/**
 * Where the factory's events come from. Today: a local simulation that plays a script (src/domain/factory.ts) while
 * the visitor lets it run; later: the agents' real events, behind the same interface. The scene and the panel only
 * read snapshots from a source — camera moves and effects never decide what has been done.
 *
 * The simulation keeps its progress in sessionStorage, tied to what was approved (idea, team, model, approval time).
 * After a reload it comes back paused, where it was: it never runs while the page is closed. If anything approved has
 * changed, the old progress is discarded rather than continued.
 */
import { type FactoryEvent, scriptLength } from "@/domain/factory";

export type SourceSnapshot = { elapsed: number; running: boolean; kind: "simulation" | "live" };

export interface FactorySource {
  readonly kind: "simulation" | "live";
  readonly events: readonly FactoryEvent[];
  snapshot(): SourceSnapshot;
  subscribe(listener: () => void): () => void;
  start(): void;
  pause(): void;
  dispose(): void;
}

const KEY = "tashfeer.factory.v1";
type Saved = { signature: string; elapsed: number };

function readSaved(signature: string): number {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return 0;
    const s = JSON.parse(raw) as Saved;
    return s.signature === signature && typeof s.elapsed === "number" ? s.elapsed : 0;
  } catch {
    return 0;
  }
}

function writeSaved(signature: string, elapsed: number) {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify({ signature, elapsed } satisfies Saved));
  } catch {
    // storage unavailable: progress lives for this page only
  }
}

export function clearFactoryProgress() {
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    // see writeSaved
  }
}

/** A local simulation of the script. `speed` > 1 only shortens it (for review and tests); it is still a simulation. */
export function createSimulation(
  events: readonly FactoryEvent[],
  signature: string,
  speed = 1,
): FactorySource {
  const end = scriptLength(events);
  let elapsed = Math.min(readSaved(signature), end);
  let running = false;
  let timer: number | null = null;
  let last = 0;
  let lastSave = 0;
  let snap: SourceSnapshot = { elapsed, running, kind: "simulation" };
  const listeners = new Set<() => void>();
  const emit = () => {
    snap = { elapsed, running, kind: "simulation" };
    for (const l of listeners) l();
  };
  const stopTimer = () => {
    if (timer !== null) window.clearInterval(timer);
    timer = null;
  };
  const tick = () => {
    const now = performance.now();
    elapsed = Math.min(end, elapsed + ((now - last) / 1000) * speed);
    last = now;
    if (now - lastSave > 1000) {
      writeSaved(signature, elapsed);
      lastSave = now;
    }
    if (elapsed >= end) {
      running = false;
      stopTimer();
      writeSaved(signature, elapsed);
    }
    emit();
  };
  return {
    kind: "simulation",
    events,
    snapshot: () => snap,
    subscribe(l) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    start() {
      if (running || elapsed >= end) return;
      running = true;
      last = performance.now();
      timer = window.setInterval(tick, 200);
      emit();
    },
    pause() {
      if (!running) return;
      tick();
      running = false;
      stopTimer();
      writeSaved(signature, elapsed);
      emit();
    },
    dispose() {
      if (running) writeSaved(signature, elapsed);
      stopTimer();
      listeners.clear();
    },
  };
}
