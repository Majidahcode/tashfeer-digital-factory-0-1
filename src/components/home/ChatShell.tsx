"use client";

import Image from "next/image";
import { useState, type CSSProperties } from "react";
import { Icon, type IconName } from "@/components/icons/Icon";
import { CHAT } from "@/domain/home-content";
import { asset, assetUrl } from "@/lib/assets";
import { cx } from "@/lib/cx";
import styles from "./ChatShell.module.css";

const TOOL_ICONS: readonly IconName[] = ["doc", "link", "file", "video", "image"];

/**
 * Phase 1: the intake window's visual design only. Nothing here pretends to send, upload or transcribe —
 * controls that need Phase 3 are disabled, and pressing Enter says so instead of faking a reply.
 */
export function ChatShell({ className }: { className?: string }) {
  const [notice, setNotice] = useState(false);
  const avatar = asset("brand-mark");

  return (
    <section
      id="intake"
      aria-labelledby="intake-title"
      data-chat-shell=""
      className={cx(styles.chat, className)}
      style={{ "--chat-mask": assetUrl("portal-chat-mask") } as CSSProperties}
    >
      <div className={styles.bg} aria-hidden="true" />
      <div className={styles.content}>
        <header className={styles.head}>
          <Image src={avatar.src} width={30} height={30} alt="" className={styles.avatar} sizes="30px" />
          <h2 id="intake-title" className={styles.name}>
            {CHAT.name}
          </h2>
        </header>

        <div className={styles.messages} role="log" aria-live="polite" aria-label="المحادثة" tabIndex={0}>
          <span className={styles.status}>{CHAT.status}</span>
          <p className={styles.bubble}>{CHAT.welcome}</p>
          {notice && (
            <p className={styles.note} role="status">
              {CHAT.disabledNote}
            </p>
          )}
        </div>

        <p className={styles.pick}>{CHAT.pick}</p>
        <div className={styles.tools} role="group" aria-label="أنواع المرفقات — غير مفعّلة في معاينة التصميم">
          {CHAT.tools.map((label, i) => (
            <button key={label} type="button" className={styles.tool} disabled>
              <Icon name={TOOL_ICONS[i] ?? "file"} size={18} />
              <span>{label}</span>
            </button>
          ))}
        </div>

        <div className={styles.inputRow}>
          <label htmlFor="intake-text" className="sr-only">
            وصف المشروع
          </label>
          <textarea
            id="intake-text"
            className={styles.textarea}
            rows={2}
            placeholder={CHAT.placeholder}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                setNotice(true);
              }
            }}
          />
          <button type="button" className={styles.iconBtn} disabled aria-label="تسجيل صوتي — غير مفعّل بعد">
            <Icon name="mic" size={18} />
          </button>
        </div>

        <div className={styles.footer}>
          <button type="button" className={styles.enter} disabled title="يُفعَّل مع الاستلام الحقيقي">
            {CHAT.enter}
          </button>
        </div>
      </div>
    </section>
  );
}
