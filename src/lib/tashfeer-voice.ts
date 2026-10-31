/**
 * The real links between Tashfeer and the page's sound — independent of any service:
 *
 *   startMic()   asks for the microphone; only once it is really recording does Tashfeer listen («mic-start»). A refusal
 *                changes nothing in him (the caller shows a note). The recording goes nowhere: no speech service is
 *                connected yet — whoever connects one takes the stream from here.
 *   speak(el)    plays a reply's sound: Tashfeer replies with his voice from the moment it plays to the moment it ends,
 *                the light of his visor following its loudness; the visitor speaking stops it (the controller asks).
 */
import { onVoiceStop, sendTashfeer, setVoiceLevel } from "./tashfeer-controller";

export type MicSession = { stream: MediaStream; stop: () => void };

export async function startMic(): Promise<MicSession> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const recorder = typeof MediaRecorder !== "undefined" ? new MediaRecorder(stream) : null;
  await new Promise<void>((resolve) => {
    if (!recorder) return resolve();
    recorder.addEventListener("start", () => resolve(), { once: true });
    recorder.start();
  });
  sendTashfeer({ type: "mic-start" });
  return {
    stream,
    stop: () => {
      if (recorder && recorder.state !== "inactive") recorder.stop();
      for (const t of stream.getTracks()) t.stop();
      const field = document.querySelector<HTMLTextAreaElement>("[data-chat-shell] textarea");
      sendTashfeer({ type: "mic-stop", typing: !!field?.value.trim() });
    },
  };
}

let ctx: AudioContext | null = null;

/** plays `el` as Tashfeer's voice; resolves when it ends (or is stopped) */
export function speak(el: HTMLMediaElement): Promise<void> {
  ctx ??= new AudioContext();
  const ac = ctx;
  const src = ac.createMediaElementSource(el);
  const analyser = ac.createAnalyser();
  analyser.fftSize = 512;
  src.connect(analyser);
  analyser.connect(ac.destination);
  const data = new Uint8Array(analyser.fftSize);
  let raf = 0;
  const meter = () => {
    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (const v of data) sum += ((v - 128) / 128) ** 2;
    setVoiceLevel(Math.min(1, Math.sqrt(sum / data.length) * 4));
    raf = requestAnimationFrame(meter);
  };
  return new Promise<void>((resolve) => {
    const end = () => {
      cancelAnimationFrame(raf);
      setVoiceLevel(0);
      onVoiceStop(null);
      src.disconnect();
      resolve();
    };
    el.addEventListener(
      "playing",
      () => {
        sendTashfeer({ type: "reply", voice: true });
        meter();
      },
      { once: true },
    );
    el.addEventListener(
      "ended",
      () => {
        sendTashfeer({ type: "reply-end" });
        end();
      },
      { once: true },
    );
    el.addEventListener("error", () => {
      sendTashfeer({ type: "error" });
      end();
    }, { once: true });
    // interrupted by the visitor: the sound stops here, the controller has already moved to listening
    onVoiceStop(() => {
      el.pause();
      end();
    });
    void ac.resume().then(() => el.play()).catch(() => {
      sendTashfeer({ type: "error" });
      end();
    });
  });
}
