/**
 * Tashfeer's one controller: what he is doing, driven by what really happens on the page — the visitor typing, the
 * microphone actually recording, a message sent, a reply arriving (with or without a voice), an error, a cancel, the
 * crossing to the next screen. The 3D character (Tashfeer3D) only reads it: there is one source of truth, so two
 * movements never fight.
 *
 *   idle       standing at ease
 *   attending  the visitor is typing: he looks at the chat and stays on it (a short pause changes nothing; only a
 *              long silence, an emptied field or leaving the field sends him back to idle)
 *   listening  the microphone is recording (after permission): turned to the visitor, a small nod now and then
 *   thinking   a message was sent and its answer is awaited: until the reply, an error or a cancel
 *   replying   a reply is shown — `voice` only when a real voice plays (then the speaking motion follows its sound)
 *   leaving    the crossing through the portal has begun: nothing else may start
 *
 * The reducer is pure (tests/unit/tashfeer-controller.spec.ts). Whatever service later answers (none is connected
 * yet: the test page simulates one, and says so) drives it through the same events.
 */
import { useSyncExternalStore } from "react";

export type Mood = "idle" | "attending" | "listening" | "thinking" | "replying" | "leaving";
export type Focus = "customer" | "chat" | null;
export type TashfeerState = { mood: Mood; voice: boolean; since: number };

export type TashfeerEvent =
  | { type: "type-start" }
  | { type: "type-stop" }
  | { type: "mic-start" }
  | { type: "mic-stop"; typing?: boolean }
  | { type: "submit" }
  | { type: "reply"; voice: boolean }
  | { type: "reply-end" }
  | { type: "error" }
  | { type: "cancel" }
  | { type: "leave" }
  | { type: "reset" };

export const INITIAL: TashfeerState = { mood: "idle", voice: false, since: 0 };

/** the next state; `now` stamps a change (the same object comes back when nothing changes) */
export function reduce(s: TashfeerState, e: TashfeerEvent, now = 0): TashfeerState {
  const to = (mood: Mood, voice = false): TashfeerState =>
    mood === s.mood && voice === s.voice ? s : { mood, voice, since: now };
  if (e.type === "reset") return to("idle");
  if (s.mood === "leaving") return s; // the crossing has begun: nothing else starts
  switch (e.type) {
    case "type-start":
      // typing during a reply or at rest: he turns to the chat; while thinking or listening he stays as he is
      return s.mood === "idle" || s.mood === "replying" ? to("attending") : s;
    case "type-stop":
      return s.mood === "attending" ? to("idle") : s;
    case "mic-start":
      // the visitor speaks: he listens — also interrupting a reply (the caller stops the reply's voice)
      return s.mood === "thinking" ? s : to("listening");
    case "mic-stop":
      return s.mood === "listening" ? to(e.typing ? "attending" : "idle") : s;
    case "submit":
      return s.mood === "thinking" ? s : to("thinking");
    case "reply":
      return s.mood === "thinking" ? to("replying", e.voice) : s;
    case "reply-end":
      return s.mood === "replying" ? to("idle") : s;
    case "error":
    case "cancel":
      return s.mood === "thinking" || s.mood === "replying" ? to("idle") : s;
    case "leave":
      return to("leaving");
  }
}

/** where he looks in each state (the character finds that element on the page, at its current place) */
export function focusOf(mood: Mood): Focus {
  if (mood === "listening" || mood === "replying") return "customer";
  if (mood === "attending") return "chat";
  return null;
}

// ── the page's one instance ────────────────────────────────────────────────────────────────────────────────────

let state = INITIAL;
const listeners = new Set<() => void>();
/** the voice's loudness now (0…1), set by whoever plays the reply's sound; read every frame, not a React state */
let voiceLevel = 0;
/** stops a reply's sound (set by the player while it plays): the visitor speaking interrupts it */
let stopVoice: (() => void) | null = null;

export function sendTashfeer(e: TashfeerEvent) {
  const before = state;
  if (e.type === "mic-start" && state.mood === "replying") {
    stopVoice?.();
    stopVoice = null;
    voiceLevel = 0;
  }
  state = reduce(state, e, performance.now());
  if (state !== before) for (const l of listeners) l();
}

export function tashfeerState() {
  return state;
}

export function subscribeTashfeer(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useTashfeer(): TashfeerState {
  return useSyncExternalStore(subscribeTashfeer, tashfeerState, () => INITIAL);
}

export function setVoiceLevel(v: number) {
  voiceLevel = Math.max(0, Math.min(1, v));
}

export function voiceLevelNow() {
  return state.mood === "replying" && state.voice ? voiceLevel : 0;
}

export function onVoiceStop(stop: (() => void) | null) {
  stopVoice = stop;
}
