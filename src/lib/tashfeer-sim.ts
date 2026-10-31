/**
 * A simulated answering service, for the test page only (/robot-animation-test) — there is no assistant and no voice
 * service behind the site yet. It answers after a pause with a clearly marked demo text, or fails, or is cancelled,
 * and for a "voice" it plays a generated tone with a speech-like rhythm (labelled as such) through the same real path
 * a voice would take (speak). It drives Tashfeer only through the controller's events, like a real service will.
 */
import { sendTashfeer } from "./tashfeer-controller";
import { speak } from "./tashfeer-voice";

export type SimOutcome = "text" | "voice" | "error";

/** a few seconds of a tone shaped like speech (syllables and pauses), as a WAV blob URL */
function demoVoice(seconds = 3.2): string {
  const rate = 22050;
  const n = Math.floor(rate * seconds);
  const pcm = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    const syllable = Math.max(0, Math.sin(t * Math.PI * 4.2)) * (Math.sin(t * 1.3) > -0.6 ? 1 : 0);
    const f = 170 + 30 * Math.sin(t * 2.1);
    pcm[i] = Math.round(Math.sin(2 * Math.PI * f * t) * syllable * 0.35 * 32767);
  }
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const w = (o: number, s: string) => [...s].forEach((c, k) => v.setUint8(o + k, c.charCodeAt(0)));
  w(0, "RIFF");
  v.setUint32(4, 36 + n * 2, true);
  w(8, "WAVEfmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  w(36, "data");
  v.setUint32(40, n * 2, true);
  new Int16Array(buf, 44).set(pcm);
  return URL.createObjectURL(new Blob([buf], { type: "audio/wav" }));
}

/** sends `idea` to the simulated service; returns a cancel. `onText` receives the demo reply to show. */
export function simulateReply(idea: string, outcome: SimOutcome, onText: (text: string) => void, delay = 2200) {
  sendTashfeer({ type: "submit" });
  let cancelled = false;
  const timer = window.setTimeout(async () => {
    if (cancelled) return;
    if (outcome === "error") {
      sendTashfeer({ type: "error" });
      onText("(محاكاة) تعذّر الوصول إلى الخدمة — حاول مرة أخرى.");
      return;
    }
    const text = `(رد تجريبي — لا يوجد ذكاء اصطناعي متصل) فهمت: «${idea.length > 60 ? `${idea.slice(0, 60)}…` : idea}».`;
    onText(text);
    if (outcome === "text") {
      // no voice: the reply is shown, with a short presenting gesture — he does not pretend to speak
      sendTashfeer({ type: "reply", voice: false });
      window.setTimeout(() => sendTashfeer({ type: "reply-end" }), 2600);
      return;
    }
    const audio = new Audio(demoVoice());
    await speak(audio);
  }, delay);
  return () => {
    cancelled = true;
    window.clearTimeout(timer);
    sendTashfeer({ type: "cancel" });
  };
}
