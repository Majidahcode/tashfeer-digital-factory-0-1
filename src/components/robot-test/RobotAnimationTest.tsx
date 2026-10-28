"use client";

import { useCallback, useReducer, useRef, useState } from "react";
import {
  TashfeerVideo,
  type ThinkingVariant,
  type VideoReport,
} from "@/components/characters/TashfeerVideo";
import { ChatShell, type ChatMessage } from "@/components/home/ChatShell";
import { HomeScene } from "@/components/home/HomeScene";
import {
  INITIAL,
  type Machine,
  type TashfeerEvent,
  next,
} from "@/lib/tashfeer-state";
import styles from "./RobotAnimationTest.module.css";

const STATE_LABEL: Record<Machine["state"], string> = {
  idle: "خامل — صورة ثابتة من أول إطار",
  listening: "يستمع",
  thinking: "يفكّر",
  replying: "يرد — لا يوجد مقطع رد بعد؛ تبقى آخر وضعية",
};

/** A clearly fake answer: there is no assistant behind this page. */
const demoReply = (idea: string) =>
  `(رد تجريبي — لا يوجد ذكاء اصطناعي متصل) فهمت: «${idea.length > 60 ? `${idea.slice(0, 60)}…` : idea}». سأرشّح لك الوكلاء المناسبين في الخطوة التالية.`;

type Run = Machine & { key: number; clip: Machine["play"] };

/**
 * /robot-animation-test — the first screen with Tashfeer as video: typing starts «listening» once, sending plays
 * «thinking» once, then a demo answer appears and he holds his last pose. A panel drives the same events by hand and
 * switches the thinking clip (Kling's original / the edited preview), the clips' alignment and a background dimmer,
 * for comparison. Nothing here listens, records or calls a service.
 */
export function RobotAnimationTest() {
  const [m, dispatch] = useReducer(
    (s: Run, e: TashfeerEvent): Run => {
      const n = next(s, e);
      // the player starts a clip when `key` changes; `clip` is the last one asked for (holding keeps it)
      return {
        ...n,
        key: n.play ? s.key + 1 : e === "reset" ? 0 : s.key,
        clip: n.play ?? (e === "reset" ? null : s.clip),
      };
    },
    { ...INITIAL, key: 0, clip: null },
  );
  const [variant, setVariant] = useState<ThinkingVariant>("preview");
  const [aligned, setAligned] = useState(true);
  const [dim, setDim] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [report, setReport] = useState<VideoReport | null>(null);
  const [resets, setResets] = useState(0);
  const pending = useRef<string | null>(null);
  const seq = useRef(0);
  const id = () => `m${++seq.current}`;

  const onClipEnd = useCallback((clip: "listening" | "thinking") => {
    if (clip !== "thinking") return;
    dispatch("clip-end");
    const idea = pending.current;
    pending.current = null;
    if (idea !== null)
      setMessages((ms) => [
        ...ms,
        { id: `r${ms.length}`, from: "tashfeer", text: demoReply(idea) },
      ]);
  }, []);

  const send = (idea: string) => {
    if (m.state === "thinking") return;
    pending.current = idea || "(مرفقات بلا وصف)";
    setMessages((ms) => [
      ...ms,
      { id: id(), from: "visitor", text: idea || "(مرفقات بلا وصف)" },
    ]);
    dispatch("submit");
  };

  return (
    <>
      <HomeScene
        characterMedia={
          <TashfeerVideo
            key={resets}
            play={m.clip}
            playKey={m.key}
            variant={variant}
            aligned={aligned}
            dimBackground={dim}
            onClipEnd={onClipEnd}
            onReport={setReport}
          />
        }
        chat={
          <ChatShell
            persist={false}
            messages={messages}
            onTypingStart={() => dispatch("type")}
            onSubmit={send}
          />
        }
      />

      <aside
        className={styles.panel}
        aria-label="لوحة اختبار الحركة"
        data-test-panel=""
        data-machine-state={m.state}
      >
        <details open className={styles.details}>
          <summary className={styles.title}>اختبار حركة تشفير</summary>
          <p className={styles.disclaimer}>
            نموذج محاكاة: لا يستمع للصوت ولا يتصل بذكاء اصطناعي. الكتابة
            والإرسال يحرّكان الحالات فقط.
          </p>
          <p className={styles.state} role="status">
            الحالة: <b>{STATE_LABEL[m.state]}</b>
          </p>
          <div className={styles.row}>
            <button type="button" onClick={() => dispatch("type")}>
              استماع
            </button>
            <button
              type="button"
              onClick={() => send("فكرة تجريبية من لوحة الاختبار")}
              disabled={m.state === "thinking"}
            >
              إرسال / تفكير
            </button>
            <button
              type="button"
              onClick={() => {
                pending.current = null;
                setMessages([]);
                setReport(null);
                setResets((r) => r + 1);
                dispatch("reset");
              }}
            >
              إعادة ضبط
            </button>
          </div>
          <fieldset className={styles.row}>
            <legend>نسخة التفكير</legend>
            <label>
              <input
                type="radio"
                name="variant"
                checked={variant === "preview"}
                onChange={() => setVariant("preview")}
              />{" "}
              المعدّلة
            </label>
            <label>
              <input
                type="radio"
                name="variant"
                checked={variant === "original"}
                onChange={() => setVariant("original")}
              />{" "}
              الأصلية
            </label>
          </fieldset>
          <div className={styles.row}>
            <label>
              <input
                type="checkbox"
                checked={aligned}
                onChange={(e) => setAligned(e.target.checked)}
              />{" "}
              محاذاة الروبوت بين المقطعين
            </label>
            <label>
              <input
                type="checkbox"
                checked={dim}
                onChange={(e) => setDim(e.target.checked)}
              />{" "}
              تعتيم خلفية الفيديو
            </label>
          </div>
          {report && report.failed.length > 0 && (
            <p className={styles.warn}>
              تعذّر تشغيل: {report.failed.join("، ")} — تظهر صورة ثابتة.
            </p>
          )}
        </details>
      </aside>
    </>
  );
}
