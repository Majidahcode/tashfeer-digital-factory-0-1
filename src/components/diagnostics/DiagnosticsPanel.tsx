"use client";

/**
 * The hidden diagnostics panel (?diag=1 in the address, for this tab only; ?diag=0 closes it): what this device
 * really measured — Tashfeer's drawing and the last transitions. Never shown to visitors otherwise.
 */
import { useEffect, useState, useSyncExternalStore } from "react";
import { type Measures, diagnosticsOn, readMeasures, subscribeMeasures } from "@/lib/diagnostics";
import styles from "./DiagnosticsPanel.module.css";

const noop = () => () => {};

export function DiagnosticsPanel() {
  const on = useSyncExternalStore(noop, diagnosticsOn, () => false);
  const [m, setM] = useState<Measures>({});
  useEffect(() => {
    if (!on) return;
    const update = () => setM({ ...readMeasures() });
    update();
    const off = subscribeMeasures(update);
    return () => {
      off();
    };
  }, [on]);
  if (!on) return null;
  const ms = (v?: number) => (v === undefined ? "—" : `${Math.round(v)} ms`);
  return (
    <aside className={styles.panel} dir="ltr" aria-label="Diagnostics" data-diagnostics="">
      <b>Diagnostics</b>
      <div>renderer: {m.renderer ?? "—"}{m.lite ? " (software: light drawing)" : ""}</div>
      <div>
        Tashfeer: {m.fps === undefined ? "—" : `${m.fps.toFixed(1)} fps`} · frame avg {ms(m.frameAvg)} · p95 {ms(m.frameP95)} · draw{" "}
        {ms(m.drawCost)}
      </div>
      {m.crossing && (
        <div>
          crossing: next screen {ms(m.crossing.toNext)} · settled {ms(m.crossing.settled)}
          <br />
          <small>{m.crossing.steps.map(([s, t]) => `${s} ${t}`).join(" → ")}</small>
        </div>
      )}
      {m.transition && (
        <div>
          last {m.transition.kind} transition: {ms(m.transition.ms)}
        </div>
      )}
    </aside>
  );
}
