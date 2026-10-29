"use client";

import { useRouter } from "next/navigation";
import { Fragment, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { TashfeerCharacter } from "@/components/characters/TashfeerCharacter";
import { Icon } from "@/components/icons/Icon";
import { PROTOTYPES, type Prototype, modelName } from "@/domain/prototypes";
import { cx } from "@/lib/cx";
import { transitionTo } from "@/lib/page-transition";
import {
  type Attachment,
  type ModelId,
  addNote,
  approvalOf,
  designApprovalOf,
  hasFile,
  keepNoteFile,
  removeNote,
  updateProject,
  useProject,
} from "@/lib/project-store";
import { PrototypePreview } from "./PrototypePreview";
import styles from "./PrototypeReview.module.css";

const noop = () => () => {};
const MAX_NOTE = 500;
const MAX_FILE = 10 * 1024 * 1024;
const STEPS = [
  "تحليل الفكرة",
  "مراجعة النموذجين",
  "اعتماد التصور",
  "بدء الإنتاج",
] as const;

/**
 * Screen 4 — «مراجعة النموذجين»: two visual directions for the project, large and side by side (one under the other
 * below 1100 px), so they are seen and compared on the page itself. The visitor chooses one (only one), asks for a
 * change on the model it concerns — the request form opens in the page only then — and approves the chosen model.
 * A model's «معاينة توضيحية» stamp opens it in a larger window, with the same two actions.
 * Requests are kept in this browser; no agent acts on them yet. The previews are illustrative, and say so; the factory —
 * the next screen — is not built, and approving starts nothing.
 */
export function PrototypeReview() {
  const router = useRouter();
  const project = useProject();
  const hydrated = useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
  /** the change-request form: closed until the visitor asks for a change; `ask` grows on each request (to focus it) */
  const [editing, setEditing] = useState(false);
  const [ask, setAsk] = useState(0);
  const [target, setTarget] = useState<ModelId>("A");
  const [text, setText] = useState("");
  const [file, setFile] = useState<Attachment | null>(null);
  const [fileError, setFileError] = useState("");
  const [confirming, setConfirming] = useState(false);
  /** the model shown in the larger window, opened from its «معاينة توضيحية» stamp */
  const [viewing, setViewing] = useState<ModelId | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const go = (href: string) => transitionTo(href, (h) => router.push(h));

  useEffect(() => {
    if (ask === 0) return;
    formRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    noteRef.current?.focus({ preventScroll: true });
  }, [ask]);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (viewing && !d.open) d.showModal();
    if (!viewing && d.open) d.close();
  }, [viewing]);

  if (!hydrated) return <section className={styles.screen} aria-busy="true" />;

  const team = approvalOf(project);
  if (team !== "approved") {
    const noTeam = !project.team || project.team.length === 0;
    return (
      <section
        className={cx(styles.screen, styles.gate)}
        aria-labelledby="proto-title"
        data-prototypes-screen=""
        data-prototypes-gate=""
      >
        <div className={styles.gateBox}>
          <h1 id="proto-title" className={styles.title}>
            {noTeam ? "اختر فريقك أولًا" : "اعتمد فريقك أولًا"}
          </h1>
          <p className={styles.lede}>
            {noTeam
              ? "مراجعة النموذجين تأتي بعد اختيار الوكلاء واعتماد الفريق."
              : team === "changed"
                ? "عدّلت الفريق بعد اعتماده. اعتمد التشكيلة الجديدة لتصل إلى مراجعة النموذجين."
                : "مراجعة النموذجين تأتي بعد اعتماد الفريق."}
          </p>
          <button
            type="button"
            className={styles.primary}
            onClick={() => go(noTeam ? "/agents" : "/team")}
            data-gate-go=""
          >
            {noTeam ? "اختيار الوكلاء" : "اعتماد الفريق"}
          </button>
        </div>
      </section>
    );
  }

  const chosen = project.chosenModel;
  const design = designApprovalOf(project);
  const pendingFor = (id: ModelId) =>
    project.notes.filter((n) => n.model === id);
  const choose = (id: ModelId) => {
    setConfirming(false);
    updateProject({ chosenModel: id });
  };
  const requestChange = (id: ModelId) => {
    setViewing(null);
    setTarget(id);
    setEditing(true);
    setAsk((n) => n + 1);
  };
  const closeForm = () => {
    setEditing(false);
    setFileError("");
  };
  const saveNote = () => {
    if (!text.trim()) return;
    addNote(target, text.trim(), file);
    setText("");
    setFile(null);
    closeForm();
  };
  const approve = () => {
    if (!chosen) return;
    if (pendingFor(chosen).length > 0 && !confirming) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    updateProject({
      approvedDesign: {
        model: chosen,
        idea: project.idea,
        team: [...(project.team ?? [])],
        at: Date.now(),
      },
    });
  };

  return (
    <section
      className={styles.screen}
      aria-labelledby="proto-title"
      data-prototypes-screen=""
    >
      <ol className={styles.steps} aria-label="مراحل المشروع">
        {STEPS.map((label, i) => {
          const done = i === 0 || (i === 2 && design === "approved");
          const current = i === 1;
          return (
            <li
              key={label}
              className={cx(done && styles.done, current && styles.current)}
              aria-current={current ? "step" : undefined}
            >
              <span className={styles.stepNum}>
                {done ? <Icon name="check" size={16} /> : `0${i + 1}`}
              </span>
              {label}
            </li>
          );
        })}
      </ol>

      <TashfeerCharacter
        className={styles.tashfeer}
        sizes="(max-width: 1099px) 40vw, 14vw"
      />

      <div className={styles.main}>
        <header className={styles.head}>
          <h1 id="proto-title" className={styles.title}>
            اختر التصور الأقرب إلى فكرتك
          </h1>
          <p className={styles.lede}>
            قارن النموذجين، اطلب التعديلات، ثم اعتمد التصميم.
          </p>
        </header>

        <div className={styles.cards}>
          {PROTOTYPES.map((p, i) => (
            <Fragment key={p.id}>
              {i > 0 && (
                // a label only: the two models are already side by side
                <span className={styles.compare} data-compare-label="">
                  مقارنة مباشرة
                </span>
              )}
              <PrototypeCard
                prototype={p}
                selected={chosen === p.id}
                notes={pendingFor(p.id).length}
                requesting={editing && target === p.id}
                onChoose={() => choose(p.id)}
                onRequest={() => requestChange(p.id)}
                onOpen={() => setViewing(p.id)}
              />
            </Fragment>
          ))}
        </div>

        {(editing || project.notes.length > 0) && (
          <div className={styles.notes} data-notes="">
            {editing && (
              <div
                ref={formRef}
                className={styles.form}
                role="group"
                aria-labelledby="note-title"
                data-note-form={target}
              >
                <div className={styles.notesHead}>
                  <h2 id="note-title" className={styles.notesTitle}>
                    طلب تعديل على {modelName(target)}
                  </h2>
                  <div
                    className={styles.targets}
                    role="radiogroup"
                    aria-label="الملاحظة على"
                  >
                    {PROTOTYPES.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        role="radio"
                        aria-checked={target === p.id}
                        className={cx(
                          styles.target,
                          target === p.id && styles.targetOn,
                        )}
                        onClick={() => setTarget(p.id)}
                        data-note-target={p.id}
                      >
                        على {p.name}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    className={styles.formClose}
                    onClick={closeForm}
                    aria-label="إغلاق طلب التعديل"
                    data-note-close=""
                  >
                    ×
                  </button>
                </div>
                <div className={styles.noteRow}>
                  <div className={styles.field}>
                    <label htmlFor="design-note" className="sr-only">
                      ملاحظتك على {modelName(target)}
                    </label>
                    <textarea
                      ref={noteRef}
                      id="design-note"
                      className={styles.textarea}
                      maxLength={MAX_NOTE}
                      rows={3}
                      placeholder={`اكتب ما تريد تغييره في ${modelName(target)}…`}
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      data-note-text=""
                    />
                    <span className={styles.count}>
                      {text.length}/{MAX_NOTE}
                    </span>
                  </div>
                  <div className={styles.attach}>
                    <button
                      type="button"
                      className={styles.attachBtn}
                      onClick={() => fileRef.current?.click()}
                      data-note-attach=""
                    >
                      <Icon name="file" size={18} />
                      إرفاق مرجع
                      <small>JPG, PNG, PDF (حتى 10 ميجابايت)</small>
                    </button>
                    {file && (
                      <span className={styles.fileChip} data-note-file="">
                        <span dir="auto">{file.name}</span>
                        <button
                          type="button"
                          aria-label={`إزالة ${file.name}`}
                          onClick={() => setFile(null)}
                        >
                          ×
                        </button>
                      </span>
                    )}
                    {fileError && (
                      <span className={styles.fileError} role="alert">
                        {fileError}
                      </span>
                    )}
                    <input
                      ref={fileRef}
                      type="file"
                      hidden
                      accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf"
                      data-note-file-input=""
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        e.target.value = "";
                        if (!f) return;
                        if (!/\.(jpe?g|png|pdf)$/i.test(f.name))
                          return setFileError("الصيغ المقبولة: JPG وPNG وPDF.");
                        if (f.size > MAX_FILE)
                          return setFileError("حجم الملف أكبر من 10 ميجابايت.");
                        setFileError("");
                        setFile(keepNoteFile(f));
                      }}
                    />
                  </div>
                  <button
                    type="button"
                    className={styles.save}
                    onClick={saveNote}
                    disabled={!text.trim()}
                    data-note-save=""
                  >
                    حفظ الملاحظة
                  </button>
                </div>
              </div>
            )}

            {project.notes.length > 0 && (
              <ul
                className={styles.noteList}
                aria-label="الملاحظات المسجلة"
                data-note-list=""
              >
                {project.notes.map((n) => {
                  const stale = n.file ? !hasFile(n.file.id) : false;
                  return (
                    <li key={n.id} data-note={n.model}>
                      <span className={styles.noteModel}>
                        {modelName(n.model)}
                      </span>
                      <p dir="auto">{n.text}</p>
                      {n.file && (
                        <span
                          className={cx(styles.fileChip, stale && styles.stale)}
                          data-stale={stale ? "" : undefined}
                        >
                          <span dir="auto">{n.file.name}</span>
                          {stale && <em>تحتاج إعادة إرفاق</em>}
                        </span>
                      )}
                      <span className={styles.noteStatus}>
                        مسجلة محليًا — لم ينفّذها وكيل بعد
                      </span>
                      <button
                        type="button"
                        className={styles.noteRemove}
                        aria-label="حذف الملاحظة"
                        onClick={() => removeNote(n.id)}
                      >
                        ×
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        <div className={styles.actions}>
          {design === "review" && (
            <p className={styles.warn} role="status" data-design-review="">
              تغيّرت الفكرة أو الفريق أو النموذج المختار بعد اعتماد التصور،
              فيحتاج الاعتماد مراجعة من جديد.
            </p>
          )}
          {confirming && chosen && (
            <div
              className={styles.confirm}
              role="alertdialog"
              aria-labelledby="confirm-text"
              data-approve-confirm=""
            >
              <p id="confirm-text">
                لديك{" "}
                {pendingFor(chosen).length === 1
                  ? "ملاحظة مسجلة"
                  : `${pendingFor(chosen).length} ملاحظات مسجلة`}{" "}
                على {modelName(chosen)} لم تُنفَّذ بعد. اعتماد النسخة الحالية
                يعني اعتمادها كما هي، دون هذه التعديلات.
              </p>
              <div>
                <button
                  type="button"
                  className={styles.primarySm}
                  onClick={approve}
                  data-approve-anyway=""
                >
                  اعتمد النسخة الحالية
                </button>
                <button
                  type="button"
                  className={styles.secondary}
                  onClick={() => setConfirming(false)}
                >
                  رجوع
                </button>
              </div>
            </div>
          )}
          {design === "approved" && chosen ? (
            <div
              className={styles.approved}
              role="status"
              data-design-approved=""
            >
              <Icon name="check" size={22} />
              <p>
                <b>اعتُمد التصميم: {modelName(chosen)}.</b> الخطوة التالية واجهة
                المصنع، وهي غير متاحة بعد في هذه النسخة. لم يبدأ أي إنتاج فعلي.
              </p>
            </div>
          ) : (
            !confirming && (
              <>
                <button
                  type="button"
                  className={styles.primary}
                  disabled={!chosen}
                  onClick={approve}
                  data-approve-design=""
                >
                  <Icon name="rocket" size={20} /> اعتماد النموذج والمتابعة
                </button>
                <button
                  type="button"
                  className={styles.secondary}
                  onClick={() => requestChange(chosen ?? target)}
                  data-need-changes=""
                >
                  ما زلت أحتاج تعديلات
                </button>
              </>
            )
          )}
          <p className={styles.illustrative}>
            <Icon name="info" size={16} /> معاينات توضيحية لاتجاهين بصريين — لم
            تُولَّد من فكرتك، ولا يوجد ذكاء اصطناعي متصل بعد.
          </p>
        </div>
      </div>
      <dialog
        ref={dialog}
        className={styles.dialog}
        onClose={() => setViewing(null)}
        onClick={(e) => e.target === e.currentTarget && setViewing(null)}
        aria-labelledby="preview-title"
        data-preview-dialog={viewing ?? ""}
      >
        {viewing && (
          <div className={styles.dialogBody}>
            <header className={styles.dialogHead}>
              <div>
                <h2 id="preview-title">{modelName(viewing)}</h2>
                <span className={styles.direction}>
                  {PROTOTYPES.find((p) => p.id === viewing)?.direction}
                </span>
              </div>
              {chosen === viewing && (
                <span className={styles.chosen}>
                  <Icon name="check" size={16} /> محدد
                </span>
              )}
              <button
                type="button"
                className={styles.close}
                onClick={() => setViewing(null)}
                aria-label="إغلاق المعاينة"
                data-dialog-close=""
              >
                ×
              </button>
            </header>
            <div className={styles.dialogPreview}>
              {PROTOTYPES.filter((p) => p.id === viewing).map((p) => (
                <PrototypePreview key={p.id} prototype={p} />
              ))}
            </div>
            <div className={styles.dialogActions}>
              <button
                type="button"
                className={chosen === viewing ? styles.primarySm : styles.choose}
                onClick={() => choose(viewing)}
                aria-pressed={chosen === viewing}
                data-dialog-choose={viewing}
              >
                <Icon name="check" size={16} />{" "}
                {chosen === viewing ? "النموذج المختار" : "اختيار هذا النموذج"}
              </button>
              <button
                type="button"
                className={styles.secondary}
                onClick={() => requestChange(viewing)}
                data-dialog-request={viewing}
              >
                <Icon name="pen" size={16} /> طلب تعديل
              </button>
            </div>
          </div>
        )}
      </dialog>
    </section>
  );
}

function PrototypeCard({
  prototype: p,
  selected,
  notes,
  requesting,
  onChoose,
  onRequest,
  onOpen,
}: {
  prototype: Prototype;
  selected: boolean;
  notes: number;
  requesting: boolean;
  onChoose: () => void;
  onRequest: () => void;
  onOpen: () => void;
}) {
  return (
    <article
      className={cx(styles.card, selected && styles.cardOn)}
      aria-labelledby={`proto-${p.id}`}
      data-prototype={p.id}
      data-selected={selected ? "" : undefined}
    >
      <header className={styles.cardHead}>
        <div>
          <h2 id={`proto-${p.id}`} className={styles.cardTitle}>
            {p.name}
          </h2>
          <p className={styles.direction}>{p.direction}</p>
        </div>
        {selected && (
          <span className={styles.chosen}>
            <Icon name="check" size={16} /> محدد
          </span>
        )}
      </header>
      <PrototypePreview prototype={p} onOpen={onOpen} />
      <div className={styles.cardActions}>
        <button
          type="button"
          className={selected ? styles.primarySm : styles.choose}
          onClick={onChoose}
          aria-pressed={selected}
          data-choose={p.id}
        >
          <Icon name="check" size={16} />{" "}
          {selected ? "النموذج المختار" : "اختيار هذا النموذج"}
        </button>
        <button
          type="button"
          className={cx(styles.secondary, requesting && styles.secondaryOn)}
          onClick={onRequest}
          aria-expanded={requesting}
          data-request={p.id}
        >
          <Icon name="pen" size={16} /> طلب تعديل
          {notes > 0 ? ` (${notes})` : ""}
        </button>
      </div>
    </article>
  );
}
