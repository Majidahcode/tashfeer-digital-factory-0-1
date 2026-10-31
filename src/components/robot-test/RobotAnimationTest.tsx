"use client";

import { useEffect, useRef, useState } from "react";
import { ChatShell, type ChatMessage } from "@/components/home/ChatShell";
import { HomeScene } from "@/components/home/HomeScene";
import { type Mood, sendTashfeer, useTashfeer } from "@/lib/tashfeer-controller";
import { type SimOutcome, simulateReply } from "@/lib/tashfeer-sim";
import { type MicSession, startMic } from "@/lib/tashfeer-voice";
import styles from "./RobotAnimationTest.module.css";

const MOOD_LABEL: Record<Mood, string> = {
  idle: "خامل — وقفة مريحة",
  attending: "منتبه للدردشة — العميل يكتب",
  listening: "يستمع — المايك يسجّل",
  thinking: "يفكّر — بانتظار الرد (محاكاة)",
  replying: "يرد",
  leaving: "يعبر النافذة",
};

/**
 * /robot-animation-test — internal, not linked: the first screen with Tashfeer's 3D model and his one controller,
 * driven by the real page events (typing, the microphone, sending) and by a simulated service (no assistant or voice
 * is connected: the panel says so). The panel exists only here — never over the visitor's screens.
 */
export function RobotAnimationTest() {
  const st = useTashfeer();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [outcome, setOutcome] = useState<SimOutcome>("text");
  const [mic, setMic] = useState<"off" | "on" | "denied">("off");
  const session = useRef<MicSession | null>(null);
  const cancel = useRef<(() => void) | null>(null);
  const seq = useRef(0);
  const id = () => `m${++seq.current}`;
  // this test page only: the controller's events, for reviews and tests (never on the visitor's screens)
  useEffect(() => {
    (window as unknown as { __tashfeerSend?: typeof sendTashfeer }).__tashfeerSend = sendTashfeer;
  }, []);

  const send = (idea: string) => {
    if (st.mood === "thinking") return; // one question at a time
    const text = idea || "(مرفقات بلا وصف)";
    setMessages((ms) => [...ms, { id: id(), from: "visitor", text }]);
    cancel.current = simulateReply(text, outcome, (reply) =>
      setMessages((ms) => [...ms, { id: id(), from: "tashfeer", text: reply }]),
    );
  };

  const toggleMic = async () => {
    if (session.current) {
      session.current.stop();
      session.current = null;
      setMic("off");
      return;
    }
    try {
      session.current = await startMic();
      setMic("on");
    } catch {
      setMic("denied"); // a refusal: he does not start listening
    }
  };

  return (
    <>
      <HomeScene chat={<ChatShell persist={false} messages={messages} onSubmit={send} />} />

      <aside className={styles.panel} aria-label="لوحة اختبار الحركة" data-test-panel="" data-machine-state={st.mood}>
        <details open className={styles.details}>
          <summary className={styles.title}>اختبار حركة تشفير (المجسم)</summary>
          <p className={styles.disclaimer}>
            خدمة رد محاكاة: لا ذكاء اصطناعي ولا خدمة صوت متصلة. «الصوت» نغمة تجريبية بإيقاع كلام، لا صوت تشفير.
          </p>
          <p className={styles.state} role="status">
            الحالة: <b>{MOOD_LABEL[st.mood]}</b>
            {st.mood === "replying" && <> — {st.voice ? "مع صوت (تجريبي)" : "نص فقط، بلا صوت"}</>}
          </p>
          <fieldset className={styles.row}>
            <legend>نتيجة الإرسال التالي</legend>
            {(["text", "voice", "error"] as const).map((o) => (
              <label key={o}>
                <input type="radio" name="outcome" checked={outcome === o} onChange={() => setOutcome(o)} data-outcome={o} />{" "}
                {o === "text" ? "رد نصي" : o === "voice" ? "رد بصوت تجريبي" : "خطأ"}
              </label>
            ))}
          </fieldset>
          <div className={styles.row}>
            <button type="button" onClick={toggleMic} data-test-mic="">
              {mic === "on" ? "إيقاف المايك" : "تشغيل المايك"}
            </button>
            <button type="button" onClick={() => send("فكرة تجريبية من لوحة الاختبار")} disabled={st.mood === "thinking"} data-test-send="">
              إرسال
            </button>
            <button
              type="button"
              onClick={() => {
                cancel.current?.();
                cancel.current = null;
              }}
              disabled={st.mood !== "thinking"}
              data-test-cancel=""
            >
              إلغاء الانتظار
            </button>
            <button
              type="button"
              onClick={() => {
                cancel.current?.();
                session.current?.stop();
                session.current = null;
                setMic("off");
                setMessages([]);
                sendTashfeer({ type: "reset" });
              }}
              data-test-reset=""
            >
              إعادة ضبط
            </button>
          </div>
          {mic === "denied" && <p className={styles.warn}>لم يُسمح بالمايك — لا يبدأ الاستماع.</p>}
        </details>
      </aside>
    </>
  );
}
