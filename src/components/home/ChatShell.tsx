"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Icon, type IconName } from "@/components/icons/Icon";
import { CHAT } from "@/domain/home-content";
import { asset } from "@/lib/assets";
import { cx } from "@/lib/cx";
import { CONTENT_BOX, boxVars, chatRowVars } from "@/lib/portal-geometry";
import styles from "./ChatShell.module.css";

const TOOL_ICONS: readonly IconName[] = ["doc", "link", "file", "video", "image"];

/**
 * Phase 1: the intake window's visual design only. Nothing here pretends to send, upload or transcribe —
 * controls that need Phase 3 are disabled, and pressing Enter says so instead of faking a reply.
 *
 * It lives inside the portal ring: positioned over the ring's opening and drawn above the ring art, with each row
 * at a measured height and width of the opening (src/lib/portal-geometry.ts). Like a messaging app, the
 * conversation takes most of the height and the text field sits right under it; the attachment types are compact
 * icons (each named for assistive technology and in its tooltip) and Enter a compact button.
 */
export function ChatShell({ className }: { className?: string }) {
  const [notice, setNotice] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const avatar = asset("brand-mark");

  useEffect(() => {
    if (notice) logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [notice]);

  return (
    <section
      id="intake"
      aria-labelledby="intake-title"
      data-chat-shell=""
      className={cx(styles.chat, className)}
      style={{ ...boxVars("content", CONTENT_BOX), ...chatRowVars() } as CSSProperties}
    >
      <header className={styles.head}>
        <Image src={avatar.src} width={30} height={30} alt="" className={styles.avatar} sizes="40px" />
        <h2 id="intake-title" className={styles.name}>
          {CHAT.name}
        </h2>
      </header>

      <div className={styles.statusRow}>
        <span className={styles.status}>{CHAT.status}</span>
      </div>

      <div ref={logRef} className={styles.log} role="log" aria-live="polite" aria-label="المحادثة" tabIndex={0}>
        <p className={styles.bubble}>{CHAT.welcome}</p>
        {notice && (
          <p className={styles.note} role="status">
            {CHAT.disabledNote}
          </p>
        )}
      </div>

      <div className={styles.inputRow}>
        <label htmlFor="intake-text" className="sr-only">
          وصف المشروع
        </label>
        <textarea
          id="intake-text"
          className={styles.textarea}
          rows={1}
          placeholder={CHAT.placeholder}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              setNotice(true);
            }
          }}
        />
        <button type="button" className={styles.iconBtn} disabled aria-label="تسجيل صوتي — غير مفعّل بعد">
          <Icon name="mic" size={16} />
        </button>
      </div>

      <div className={styles.tools} role="group" aria-label="أنواع المرفقات — غير مفعّلة في معاينة التصميم">
        {CHAT.tools.map((label, i) => (
          <button key={label} type="button" className={styles.tool} disabled title={label}>
            <Icon name={TOOL_ICONS[i] ?? "file"} size={16} />
            <span className="sr-only">{label}</span>
          </button>
        ))}
      </div>

      <div className={styles.footer}>
        <button type="button" className={styles.enter} disabled title="يُفعَّل مع الاستلام الحقيقي">
          {CHAT.enter}
        </button>
      </div>
    </section>
  );
}
