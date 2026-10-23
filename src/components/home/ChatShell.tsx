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
 * Phase 1: the intake window's visual design only. Nothing here pretends to send, upload or transcribe. The header is
 * the avatar alone, with a grey "not connected" dot; the preview status is spelled out for assistive technology and in
 * the avatar's tooltip, and shown in the conversation as soon as the visitor uses the chat — focusing the field,
 * pressing Enter, or pressing a control that needs Phase 3. Those controls are marked unavailable (aria-disabled)
 * rather than inert, so pressing one explains instead of doing nothing.
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
  const explain = () => setNotice(true);

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
        <span className={styles.avatar} title={CHAT.status} data-chat-avatar="">
          <Image src={avatar.src} width={40} height={40} alt="" className={styles.avatarImg} sizes="40px" />
          <span className={styles.presence} aria-hidden="true" />
        </span>
        <h2 id="intake-title" className="sr-only">
          {CHAT.name}
        </h2>
        <span className="sr-only" data-chat-status="">
          {CHAT.status}
        </span>
      </header>

      <div ref={logRef} className={styles.log} role="log" aria-live="polite" aria-label="المحادثة" tabIndex={0}>
        <p className={styles.bubble}>{CHAT.welcome}</p>
        {notice && (
          <div className={styles.note} role="status">
            {CHAT.disabledNote}
          </div>
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
          onFocus={explain}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              explain();
            }
          }}
        />
        <button
          type="button"
          className={styles.iconBtn}
          aria-disabled="true"
          aria-label="تسجيل صوتي — غير مفعّل بعد"
          onClick={explain}
        >
          <Icon name="mic" size={16} />
        </button>
      </div>

      <div className={styles.tools} role="group" aria-label="أنواع المرفقات — غير مفعّلة في معاينة التصميم">
        {CHAT.tools.map((label, i) => (
          <button key={label} type="button" className={styles.tool} aria-disabled="true" title={label} onClick={explain}>
            <Icon name={TOOL_ICONS[i] ?? "file"} size={16} />
            <span className="sr-only">{label}</span>
          </button>
        ))}
      </div>

      <div className={styles.footer}>
        <button
          type="button"
          className={styles.enter}
          aria-disabled="true"
          title="يُفعَّل مع الاستلام الحقيقي"
          onClick={explain}
        >
          {CHAT.enter}
        </button>
      </div>
    </section>
  );
}
