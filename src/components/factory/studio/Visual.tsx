import type { Visual as V } from "@/domain/factory-story";
import { cx } from "@/lib/cx";
import { StepIcon } from "./StepIcon";
import styles from "./Studio.module.css";

/**
 * A step's result as a small picture, in plain Arabic: the pages forming, a form with its fields, a calendar, a booking
 * moving to its list, a check on a phone… Drawn from the project's story (factory-story.ts); never code or file names.
 * `state` says how far the step is: being made (outlined, its parts appearing) or made (filled).
 */
export function Visual({ v, state, check }: { v: V; state: "making" | "made"; check?: "pass" | "fail" | "fixing" | null }) {
  const made = state === "made";
  switch (v.kind) {
    case "structure":
      return (
        <div className={cx(styles.vis, styles.visStructure)} data-visual="structure">
          {v.parts.map((p, i) => (
            <span key={p} className={cx(styles.visBlock, made && styles.visOn)} style={{ animationDelay: `${i * 120}ms` }}>
              {p}
            </span>
          ))}
        </div>
      );
    case "identity":
      return (
        <div className={cx(styles.vis, styles.visIdentity)} data-visual="identity" data-model={v.model}>
          <span className={styles.swatchA} />
          <span className={styles.swatchB} />
          <span className={styles.swatchC} />
          <b>Aa</b>
          <small>هوية النموذج {v.model}</small>
        </div>
      );
    case "pages":
      return (
        <div className={cx(styles.vis, styles.visPages)} data-visual="pages">
          {v.pages.map((p, i) => (
            <figure key={p} className={cx(styles.page, i < v.active && styles.pageMade, i === v.active && (made ? styles.pageMade : styles.pageMaking))}>
              <span className={styles.pageBar} />
              <span className={styles.pageHero} />
              <span className={styles.pageRow} />
              <figcaption>{p}</figcaption>
            </figure>
          ))}
        </div>
      );
    case "form":
      return (
        <div className={cx(styles.vis, styles.visForm)} data-visual="form">
          <b>{v.title}</b>
          {v.fields.map((f, i) => (
            <span key={f} className={cx(styles.field, (made || i < 2) && styles.fieldOn)} style={{ animationDelay: `${i * 140}ms` }}>
              {f}
              <i aria-hidden="true">⌄</i>
            </span>
          ))}
          <span className={cx(styles.cta, made && styles.ctaOn)}>
            <StepIcon name="calendar" size={14} /> {v.cta}
          </span>
        </div>
      );
    case "picker":
      return (
        <div className={cx(styles.vis, styles.visPicker)} data-visual="picker">
          <b>{v.title}</b>
          <span className={styles.days}>
            {Array.from({ length: 14 }, (_, i) => (
              <i key={i} className={i === 9 ? styles.dayOn : undefined}>
                {i + 15}
              </i>
            ))}
          </span>
        </div>
      );
    case "flow":
      return (
        <div className={cx(styles.vis, styles.visFlow)} data-visual="flow">
          <span className={styles.flowNode}>{v.from}</span>
          <span className={cx(styles.flowLine, made && styles.flowDone)} aria-hidden="true">
            <i />
          </span>
          <span className={cx(styles.flowNode, made && styles.flowNodeOn)}>{v.to}</span>
          <small>{v.note}</small>
        </div>
      );
    case "list":
      return (
        <div className={cx(styles.vis, styles.visList)} data-visual="list">
          <b>{v.title}</b>
          {v.rows.map((r, i) => (
            <span key={r} className={cx(styles.listRow, (made || i === 0) && styles.listOn)} style={{ animationDelay: `${i * 160}ms` }}>
              <StepIcon name="calendar" size={13} /> {r}
            </span>
          ))}
        </div>
      );
    case "confirm":
      return (
        <div className={cx(styles.vis, styles.visConfirm, made && styles.confirmOn)} data-visual="confirm">
          <span className={styles.tick} aria-hidden="true">
            <StepIcon name="check" size={20} />
          </span>
          <b>{v.title}</b>
          {v.lines.map((l) => (
            <small key={l}>{l}</small>
          ))}
        </div>
      );
    case "check":
      return (
        <div className={cx(styles.vis, styles.visCheck)} data-visual="check" data-result={check ?? "running"}>
          <span className={cx(styles.device, v.device === "phone" ? styles.phone : styles.desktop, check === "fail" && styles.deviceIssue)}>
            <i />
            <i />
            <i />
          </span>
          <span className={styles.checkLine}>
            <b>{v.label}</b>
            <small>
              {check === "pass"
                ? "نجح الفحص"
                : check === "fail"
                  ? "ظهرت مشكلة"
                  : check === "fixing"
                    ? "عولجت — يُعاد الفحص"
                    : "يُفحص الآن"}
            </small>
          </span>
        </div>
      );
    case "ready":
      return (
        <div className={cx(styles.vis, styles.visReady)} data-visual="ready">
          <b>جاهز للمعاينة</b>
          {v.ready.map((r) => (
            <span key={r} className={styles.readyRow}>
              <StepIcon name="check" size={13} /> {r}
            </span>
          ))}
          <b className={styles.pendingHead}>ينتظر إكماله</b>
          {v.pending.map((r) => (
            <span key={r} className={styles.pendingRow}>
              <StepIcon name="clock" size={13} /> {r}
            </span>
          ))}
        </div>
      );
  }
}
