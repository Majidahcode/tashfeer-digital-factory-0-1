/**
 * Tashfeer's conversation states and what each transition plays. Pure (tested in tests/unit/tashfeer-state.spec.ts);
 * the video test page runs it.
 *
 *   idle      --type-->   listening   plays «listening» once (the head turns toward the visitor)
 *   listening --type-->   listening   nothing: more typing never replays the turn
 *   idle | listening | replying --submit--> thinking   plays «thinking» once
 *   thinking  --clip-end--> replying  nothing: the last frame stays (there is no reply clip yet — a status says so)
 *   thinking  --submit-->  thinking   ignored until the clip ends
 *   replying  --type-->    listening  nothing: «listening» starts from a different pose, replaying it would jump
 *   any       --reset-->   idle       back to the first frame of «listening»
 */
import type { TashfeerState } from "@/components/characters/TashfeerCharacter";

export type Clip = "listening" | "thinking";
export type TashfeerEvent = "type" | "submit" | "clip-end" | "reset";
export type Machine = { state: TashfeerState; play: Clip | null; heardTurn: boolean };

export const INITIAL: Machine = { state: "idle", play: null, heardTurn: false };

export function next(m: Machine, e: TashfeerEvent): Machine {
  switch (e) {
    case "reset":
      return INITIAL;
    case "type":
      if (m.state === "idle") return { state: "listening", play: m.heardTurn ? null : "listening", heardTurn: true };
      if (m.state === "replying") return { ...m, state: "listening", play: null };
      return { ...m, play: null };
    case "submit":
      if (m.state === "thinking") return { ...m, play: null };
      return { ...m, state: "thinking", play: "thinking" };
    case "clip-end":
      return m.state === "thinking" ? { ...m, state: "replying", play: null } : { ...m, play: null };
  }
}
