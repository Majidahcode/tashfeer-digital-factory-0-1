"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Icon, type IconName } from "@/components/icons/Icon";
import { CHAT } from "@/domain/home-content";
import { asset } from "@/lib/assets";
import { cx } from "@/lib/cx";
import { transitionTo } from "@/lib/page-transition";
import { CONTENT_BOX, boxVars, chatRowVars } from "@/lib/portal-geometry";
import {
  type AttachmentKind,
  addAttachments,
  hasFile,
  removeAttachment,
  updateProject,
  useProject,
} from "@/lib/project-store";
import styles from "./ChatShell.module.css";

type Tool = {
  label: (typeof CHAT.tools)[number];
  icon: IconName;
  kind: AttachmentKind | "link";
  accept?: string;
};
const TOOLS: readonly Tool[] = [
  {
    label: "الوصف",
    icon: "doc",
    kind: "description",
    accept: ".pdf,.doc,.docx,.txt,.md,.rtf,.odt",
  },
  { label: "روابط", icon: "link", kind: "link" },
  { label: "ملفات", icon: "file", kind: "file" },
  { label: "فيديو", icon: "video", kind: "video", accept: "video/*" },
  { label: "صور", icon: "image", kind: "image", accept: "image/*" },
];

export type ChatMessage = {
  id: string;
  from: "tashfeer" | "visitor" | "note";
  text: string;
};

/**
 * The intake inside the portal: the visitor describes the idea, attaches what explains it, and presses «ادخل». The
 * idea and the attachments are kept in this browser only (src/lib/project-store.ts) — nothing is uploaded and no
 * assistant answers yet; the conversation says so where it applies. The microphone is not available yet and says so.
 *
 * It lives inside the portal ring: positioned over the ring's opening and drawn above the ring art, with each row
 * at a measured height and width of the opening (src/lib/portal-geometry.ts). Like a messaging app, the messages
 * gather above the text field; the attachment types are compact icons (each named for assistive technology and in
 * its tooltip) and Enter a compact button.
 *
 * By default «ادخل» opens the agents screen. The video test (/robot-animation-test) drives it instead: it keeps its
 * own text (`persist={false}`), adds the conversation (`messages`), and is told when typing starts and on submit.
 */
export function ChatShell({
  className,
  persist = true,
  messages = [],
  onTypingStart,
  onSubmit,
}: {
  className?: string;
  persist?: boolean;
  messages?: readonly ChatMessage[];
  onTypingStart?: () => void;
  /** called with the idea; without it, «ادخل» opens the agents screen */
  onSubmit?: (idea: string) => void;
}) {
  const router = useRouter();
  const project = useProject();
  const [local, setLocal] = useState("");
  const [notes, setNotes] = useState<string[]>([]);
  const logRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pickKind = useRef<AttachmentKind>("file");
  const typing = useRef(false);
  const avatar = asset("brand-mark");
  const idea = persist ? project.idea : local;
  const attachments = persist ? project.attachments : [];

  const note = (text: string) =>
    setNotes((n) =>
      n.at(-1) === text ? n : [...n.filter((x) => x !== text), text],
    );

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [notes, messages.length, attachments.length]);

  const setIdea = (value: string) => {
    if (value.trim() && !typing.current) {
      typing.current = true;
      onTypingStart?.();
    }
    if (!value.trim()) typing.current = false;
    if (persist) updateProject({ idea: value });
    else setLocal(value);
  };

  const submit = () => {
    if (!idea.trim() && !attachments.some((a) => hasFile(a.id))) {
      note(CHAT.notes.empty);
      fieldRef.current?.focus();
      return;
    }
    if (onSubmit) {
      onSubmit(idea.trim());
      typing.current = false;
      if (!persist) setLocal("");
      return;
    }
    // the idea and its attachments are already kept (project store); the next screen is fetched ahead of the crossing
    router.prefetch("/agents");
    transitionTo("/agents", (href) => router.push(href));
  };

  const pressTool = (t: Tool) => {
    if (t.kind === "link") {
      note(CHAT.notes.links);
      fieldRef.current?.focus();
      return;
    }
    pickKind.current = t.kind;
    const input = fileRef.current;
    if (!input) return;
    input.accept = t.accept ?? "";
    input.click();
  };

  return (
    <section
      id="intake"
      aria-labelledby="intake-title"
      data-chat-shell=""
      className={cx(styles.chat, className)}
      style={
        {
          ...boxVars("content", CONTENT_BOX),
          ...chatRowVars(),
        } as CSSProperties
      }
    >
      <header className={styles.head}>
        <span className={styles.avatar} title={CHAT.status} data-chat-avatar="">
          <Image
            src={avatar.src}
            width={40}
            height={40}
            alt=""
            className={styles.avatarImg}
            sizes="40px"
          />
          <span className={styles.presence} aria-hidden="true" />
        </span>
        <h2 id="intake-title" className="sr-only">
          {CHAT.name}
        </h2>
        <span className="sr-only" data-chat-status="">
          {CHAT.status}
        </span>
      </header>

      <div
        ref={logRef}
        className={styles.log}
        role="log"
        aria-live="polite"
        aria-label="المحادثة"
        tabIndex={0}
      >
        <p className={styles.bubble}>{CHAT.welcome}</p>
        {messages.map((m) =>
          m.from === "note" ? (
            <div key={m.id} className={styles.note} data-chat-message="note">
              {m.text}
            </div>
          ) : (
            <p
              key={m.id}
              className={cx(styles.bubble, m.from === "visitor" && styles.mine)}
              data-chat-message={m.from}
            >
              {m.text}
            </p>
          ),
        )}
        {attachments.length > 0 && (
          <ul
            className={styles.chips}
            aria-label="المرفقات"
            data-chat-attachments=""
          >
            {attachments.map((a) => {
              // after a reload only the name is left: the file must be attached again before it can be used
              const stale = !hasFile(a.id);
              return (
                <li
                  key={a.id}
                  className={cx(styles.chip, stale && styles.staleChip)}
                  data-stale={stale ? "" : undefined}
                >
                  <span className={styles.chipName} dir="auto" title={a.name}>
                    {a.name}
                  </span>
                  {stale && (
                    <span className={styles.staleLabel}>تحتاج إعادة إرفاق</span>
                  )}
                  <button
                    type="button"
                    className={styles.chipRemove}
                    aria-label={`إزالة ${a.name}`}
                    onClick={() => removeAttachment(a.id)}
                  >
                    ×
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {notes.map((n) => (
          <div key={n} className={styles.note} role="status">
            {n}
          </div>
        ))}
      </div>

      <div className={styles.inputRow}>
        <label htmlFor="intake-text" className="sr-only">
          وصف المشروع
        </label>
        <textarea
          ref={fieldRef}
          id="intake-text"
          className={styles.textarea}
          rows={1}
          placeholder={CHAT.placeholder}
          value={idea}
          onChange={(e) => setIdea(e.target.value)}
          onKeyDown={(e) => {
            if (
              e.key === "Enter" &&
              !e.shiftKey &&
              !e.nativeEvent.isComposing
            ) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <button
          type="button"
          className={styles.iconBtn}
          aria-disabled="true"
          aria-label="تسجيل صوتي — غير مفعّل بعد"
          onClick={() => note(CHAT.notes.mic)}
        >
          <Icon name="mic" size={16} />
        </button>
      </div>

      <div
        className={styles.tools}
        role="group"
        aria-label="أرفق ما يوضح فكرتك"
      >
        {TOOLS.map((t) => (
          <button
            key={t.label}
            type="button"
            className={styles.tool}
            title={t.label}
            aria-disabled={persist ? undefined : "true"}
            onClick={() =>
              persist ? pressTool(t) : note(CHAT.notes.attachments)
            }
          >
            <Icon name={t.icon} size={16} />
            <span className="sr-only">{t.label}</span>
          </button>
        ))}
        <input
          ref={fileRef}
          type="file"
          multiple
          hidden
          data-chat-file-input=""
          onChange={(e) => {
            const files = e.target.files;
            if (files?.length) {
              addAttachments(pickKind.current, files);
              note(CHAT.notes.attachments);
            }
            e.target.value = "";
          }}
        />
      </div>

      <div className={styles.footer}>
        <button
          type="button"
          className={styles.enter}
          onClick={submit}
          data-chat-enter=""
        >
          {CHAT.enter}
        </button>
      </div>
    </section>
  );
}
