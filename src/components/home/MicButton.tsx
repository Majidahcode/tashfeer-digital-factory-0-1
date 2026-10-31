"use client";

/**
 * «تحدّث الآن»: the microphone. Pressed, it asks the browser for the microphone; only when the recording has really
 * started does Tashfeer turn to the visitor and listen (the controller). Pressed again, it stops. A refusal leaves
 * him as he was and says so here. No speech service is connected yet: nothing is sent anywhere (the note says so).
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { type MicSession, startMic } from "@/lib/tashfeer-voice";

export function MicButton({
  className,
  textClass,
  waveClass,
  iconClass,
  noteClass,
  icon,
}: {
  className?: string;
  textClass?: string;
  waveClass?: string;
  iconClass?: string;
  noteClass?: string;
  icon: ReactNode;
}) {
  const [state, setState] = useState<"off" | "asking" | "on" | "denied" | "unsupported">("off");
  const session = useRef<MicSession | null>(null);
  useEffect(() => () => session.current?.stop(), []);

  const toggle = async () => {
    if (session.current) {
      session.current.stop();
      session.current = null;
      setState("off");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setState("unsupported");
      return;
    }
    setState("asking");
    try {
      session.current = await startMic();
      setState("on");
    } catch {
      setState("denied");
    }
  };

  const note =
    state === "on"
      ? "يُسجَّل للتجربة فقط — لا توجد خدمة صوت متصلة بعد، ولا يُرسل الصوت إلى أي مكان."
      : state === "denied"
        ? "لم يُسمح باستخدام المايك."
        : state === "unsupported"
          ? "متصفحك لا يتيح المايك هنا."
          : null;

  return (
    <>
      <button
        type="button"
        className={className}
        onClick={toggle}
        aria-pressed={state === "on"}
        aria-label={state === "on" ? "إيقاف التسجيل" : "تحدّث الآن"}
        data-mic={state}
      >
        <span className={textClass}>
          <span>{state === "on" ? "إيقاف" : "تحدّث الآن"}</span>
          <span className={waveClass} aria-hidden="true" />
        </span>
        <span className={iconClass}>{icon}</span>
      </button>
      {note && (
        <span className={noteClass} role="status" data-mic-note="">
          {note}
        </span>
      )}
    </>
  );
}
