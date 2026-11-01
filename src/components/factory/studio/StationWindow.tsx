"use client";

import { forwardRef } from "react";
import { Icon } from "@/components/icons/Icon";
import { PrototypePreview } from "@/components/prototypes/PrototypePreview";
import { type FactoryEvent, type FactoryState, type Station, type StationState, openIssue, responsible } from "@/domain/factory";
import type { StationStory, Step } from "@/domain/factory-story";
import { PROTOTYPES } from "@/domain/prototypes";
import { cx } from "@/lib/cx";
import { STATION_ICON, StepIcon } from "./StepIcon";
import styles from "./Studio.module.css";

export const STATUS: Record<string, string> = { waiting: "لم تبدأ", active: "جارٍ العمل", done: "مكتملة" };

/** each quality step, and the check that is its result */
const CHECK_OF = ["load", "mobile", "services|speed"] as const;

export type StepState = "done" | "current" | "next";

/** where each of the station's steps stands, from the events that have happened (never ahead of them) */
export function stepStates(st: StationState, steps: readonly Step[]): StepState[] {
  return steps.map((_, i) =>
    st.status === "done" ? "done" : st.status === "waiting" || st.step < 0 ? "next" : i < st.step ? "done" : i === st.step ? "current" : "next",
  );
}

/** the quality check that answers step `i`, and where it stands */
export function checkFor(st: StationState, i: number) {
  const ids = (CHECK_OF[i] ?? "").split("|");
  const c = st.checks.find((x) => ids.includes(x.id));
  if (!c) return null;
  const last = c.runs.at(-1)?.result;
  const state = last === "pass" ? "pass" : c.fix ? "fixing" : "fail";
  return { check: c, state: state as "pass" | "fail" | "fixing" };
}

/**
 * The station's glass window, after the owner's reference (2026-11-01): what is happening to the product here, in one
 * headline; why it matters; the station's three steps (done, now, next); a short list of what is done, what is being
 * done and what comes after; the agent responsible. «شاهد التفاصيل» opens everything else (onDetails). Its content
 * changes only when the work's events arrive — the text holds still while it is read.
 */
export const StationWindow = forwardRef<
  HTMLElement,
  {
    station: Station;
    index: number;
    chosen: boolean;
    state: FactoryState;
    story: StationStory;
    team: readonly string[];
    onBack: () => void;
    onDetails: () => void;
    leaving?: boolean;
    reducedMotion: boolean;
  }
>(function StationWindow({ station, index, chosen, state, story, team, onBack, onDetails, leaving, reducedMotion }, ref) {
  const st = state.stations[station.id];
  if (!st) return null;
  const steps = story.steps;
  const states = stepStates(st, steps);
  const cur = steps[Math.max(0, st.step)] ?? steps[0];
  const issue = station.id === "quality" ? st.checks.find(openIssue) : undefined;
  const headline =
    st.status === "active"
      ? (st.task ?? cur?.headline ?? "يبدأ العمل الآن")
      : st.status === "done"
        ? "اكتملت هذه المرحلة"
        : "بانتظار وصول منتجك إلى هذه المرحلة";
  const why =
    st.status === "active"
      ? issue
        ? issue.fix
          ? `عولجت المشكلة: ${issue.fix} نعيد الفحص الآن.`
          : `ظهرت مشكلة: ${issue.runs.at(-1)?.detail ?? ""} نعالجها الآن.`
        : (cur?.why ?? "")
      : st.status === "done"
        ? (steps.at(-1)?.result ?? "")
        : `أول ما نعمله هنا: ${steps[0]?.headline ?? station.name}.`;
  return (
    <aside
      ref={ref}
      className={cx(styles.window, !reducedMotion && (leaving ? styles.windowOut : styles.windowIn))}
      aria-labelledby={leaving ? undefined : "station-title"}
      aria-hidden={leaving || undefined}
      data-station-panel={leaving ? undefined : station.id}
      data-leaving-panel={leaving ? station.id : undefined}
      data-card-mode={chosen ? "station" : "follow"}
    >
      <header className={styles.winHead}>
        <span className={cx(styles.pill, styles[st.status])} data-panel-status={st.status}>
          <i aria-hidden="true" />
          {STATUS[st.status]}
        </span>
        <span className={styles.winStation}>
          <span className={styles.winIcon}>
            <StepIcon name={STATION_ICON[station.id] ?? "layers"} size={22} />
          </span>
          <span className="sr-only">المحطة {String(index + 1).padStart(2, "0")}: </span>
          <h2 id={leaving ? undefined : "station-title"}>{station.name}</h2>
        </span>
        {chosen && !leaving && (
          <button type="button" className={styles.close} onClick={onBack} aria-label="العودة لمتابعة المنتج" data-panel-close="">
            ×
          </button>
        )}
      </header>

      {/* what is happening now: one headline, steady while it is read (a new one comes with a new event) */}
      <p key={headline} className={cx(styles.headline, !reducedMotion && styles.textIn)} data-panel-task="">
        {headline}
      </p>
      {why && (
        <p key={why} className={cx(styles.why, issue && !issue.fix && styles.whyIssue, !reducedMotion && styles.textIn)} data-panel-why="">
          {why}
        </p>
      )}

      {/* the station's steps */}
      <ol className={styles.steps} aria-label="خطوات المحطة">
        {steps.map((s, i) => (
          <li key={s.label} className={styles[states[i]!]} data-step={i} data-step-state={states[i]}>
            <span className={styles.stepRing}>
              <StepIcon name={s.icon} size={26} />
            </span>
            <span className={styles.stepLabel}>{s.label}</span>
          </li>
        ))}
      </ol>

      {/* done · now · next */}
      <ul className={styles.list} aria-label="ما اكتمل وما يجري وما يليه">
        {steps.map((s, i) => {
          const k = states[i]!;
          const chk = station.id === "quality" ? checkFor(st, i) : null;
          const text =
            k === "done"
              ? s.result
              : k === "current"
                ? chk?.state === "fail"
                  ? `${s.headline} — ظهرت مشكلة، تُعالج الآن`
                  : chk?.state === "fixing"
                    ? `${s.headline} — عولجت، يُعاد الفحص`
                    : s.headline
                : `بعدها: ${s.headline}`;
          return (
            <li key={`${s.label}-${k}`} className={cx(styles.item, styles[`item_${k}`], chk?.state === "fail" && styles.itemIssue, !reducedMotion && styles.textIn)} data-item-state={k}>
              <span className={styles.mark} aria-hidden="true">
                {k === "done" ? <StepIcon name="check" size={14} /> : null}
              </span>
              {text}
            </li>
          );
        })}
      </ul>

      {st.outputs.length > 0 && (
        <p className={styles.output} data-card-output="">
          <StepIcon name="check" size={14} /> المخرج المتاح: {st.outputs.join("، ")}
        </p>
      )}

      <footer className={styles.winFoot}>
        <span className={styles.agent}>
          <span className={styles.agentDot} aria-hidden="true" />
          الوكيل المسؤول: <b data-panel-agent="">{responsible(station, team)}</b>
        </span>
        <span className={styles.simLine}>
          <Icon name="info" size={13} /> محاكاة تفاعلية — ليست نتائج عمل حقيقي
        </span>
        <div className={styles.winActions}>
          <button type="button" className={styles.detailsBtn} onClick={onDetails} data-panel-details="" disabled={leaving}>
            شاهد التفاصيل
            <span aria-hidden="true">‹</span>
          </button>
          {chosen && !leaving && (
            <button type="button" className={styles.backBtn} onClick={onBack} data-follow-return="">
              <Icon name="target" size={15} /> العودة لمتابعة المنتج
            </button>
          )}
        </div>
      </footer>
    </aside>
  );
});

/**
 * Everything about one station, on request: each step with what it made (its picture), the outputs, the checks with
 * their failures, fixes and retests, what is waiting, and the station's log in time order.
 */
export function StationDetails({
  station,
  st,
  story,
  log,
  model,
}: {
  station: Station;
  st: StationState;
  story: StationStory;
  log: FactoryEvent[];
  model: "A" | "B";
}) {
  const states = stepStates(st, story.steps);
  const prototype = PROTOTYPES.find((p) => p.id === model);
  return (
    <div className={styles.details} data-station-details={station.id}>
      <section>
        <h3>الخطوات وما أضافته لمنتجك</h3>
        <ol className={styles.detailSteps}>
          {story.steps.map((s, i) => (
            <li key={s.label} data-step-state={states[i]}>
              <span className={cx(styles.dsMark, styles[states[i]!])}>
                <StepIcon name={s.icon} size={16} />
              </span>
              <div>
                <b>{s.headline}</b>
                <p>{states[i] === "done" ? s.result : states[i] === "current" ? `يجري الآن — ${s.why}` : "لم تبدأ بعد"}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section>
        <h3>المخرج المتاح</h3>
        <p data-panel-output="">{st.outputs.length ? st.outputs.join("، ") : "لا يوجد مخرج بعد"}</p>
      </section>

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
                          <span className={styles.fix} data-check-fix="">
                            المعالجة: {c.fix}
                          </span>
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
          {story.pending.length > 0 && (
            <>
              <h3>ما ينتظر إكماله</h3>
              <ul className={styles.pendingList}>
                {story.pending.map((p) => (
                  <li key={p}>
                    <StepIcon name="clock" size={14} /> {p}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {log.length > 0 && (
        <section className={styles.tech}>
          <h3>سجل المحطة</h3>
          <ul>
            {log.map((e, i) => (
              <li key={i}>
                <time>{formatTime(e.at)}</time> {describe(e)}
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className={styles.simLine}>
        <Icon name="info" size={13} /> كل ما هنا من محاكاة تفاعلية — لم يُنفَّذ عمل حقيقي بعد.
      </p>
    </div>
  );
}

export function formatTime(s: number) {
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

export function describe(e: FactoryEvent): string {
  switch (e.type) {
    case "travel":
      return "انتقل المنتج إلى المحطة";
    case "start":
      return `بدأ العمل: ${e.task}`;
    case "step":
      return `خطوة جديدة: ${e.task}`;
    case "task":
      return e.task;
    case "output":
      return `مخرج جاهز: ${e.output}`;
    case "check":
      return `فحص «${e.label}»: ${e.result === "pass" ? "نجح" : "ظهرت مشكلة"} — ${e.detail}`;
    case "fix":
      return `معالجة: ${e.detail}`;
    case "done":
      return "اكتملت المحطة";
  }
}
