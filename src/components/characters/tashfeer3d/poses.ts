/**
 * Tashfeer's body language, as poses over time (character axes, see rig.ts). Calm and attentive: small movements,
 * nothing on a loop that draws the eye.
 *
 * Signs (checked on the model): for the character's left side (_L) —
 *   upper arm  z − lowers the arm toward the body (from the A-pose)   x − swings it forward
 *   forearm    x − bends the elbow (forearm forward/up)                y − turns it inward, across the body
 *   thigh      x − swings the leg forward                               shin x + bends the knee
 *   head/neck  y + turns toward the character's left (the viewer's right), x + nods down, z tilts
 * The right side mirrors z and y.
 */
import type { Pose, Rot } from "./rig";

export type Mode = "idle" | "listening" | "attending" | "thinking" | "replying" | "walking" | "turning";

export type PoseInput = {
  mode: Mode;
  /** seconds since the start (for breathing and sway) */
  t: number;
  /** seconds since the current mode began (gestures play once, at the start) */
  since: number;
  /** where to look: yaw and pitch (radians, character axes), already limited */
  look: { yaw: number; pitch: number } | null;
  /** walking: the step cycle (0…1 per two steps) */
  phase: number;
  /** speaking: the voice's loudness now (0…1), 0 without a voice */
  voice: number;
  /** no idle movement (reduced motion) */
  still: boolean;
};

const deg = (d: number) => (d * Math.PI) / 180;
const add = (a: Rot | undefined, b: Rot): Rot => (a ? [a[0] + b[0], a[1] + b[1], a[2] + b[2]] : b);
const ease = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
/** a gesture's envelope: rises over `inT`, holds, falls over `outT`, from `start` for `len` seconds */
const env = (s: number, start: number, len: number, inT = 0.45, outT = 0.6) =>
  ease((s - start) / inT) * (1 - ease((s - start - len + outT) / outT));

/** standing at ease: arms down by the sides (the model is in an A-pose), elbows a touch bent */
function rest(): Pose {
  return {
    rot: {
      clavicle_L: [0, 0, deg(-4)],
      clavicle_R: [0, 0, deg(4)],
      upper_arm_L: [deg(-4), 0, deg(-26)],
      upper_arm_R: [deg(-4), 0, deg(26)],
      forearm_L: [deg(-14), deg(-8), 0],
      forearm_R: [deg(-14), deg(8), 0],
      hand_L: [0, deg(-6), deg(4)],
      hand_R: [0, deg(6), deg(-4)],
    },
  };
}

export function pose(p: PoseInput): Pose {
  const out = rest();
  const r = out.rot;
  const t = p.still ? 0 : p.t;
  // breathing and a slow shift of weight: barely there
  const breath = Math.sin(t * 1.25) * deg(1.2);
  const sway = Math.sin(t * 0.33) * 0.008;
  r.chest = add(r.chest, [-breath * 0.6, 0, 0]);
  r.spine = add(r.spine, [0, Math.sin(t * 0.21) * deg(1.2), Math.sin(t * 0.33) * deg(0.8)]);
  out.hips = [sway, Math.sin(t * 1.25) * 0.002, 0];
  r.thigh_L = add(r.thigh_L, [0, 0, Math.sin(t * 0.33) * deg(0.8)]);
  r.thigh_R = add(r.thigh_R, [0, 0, Math.sin(t * 0.33) * deg(0.8)]);
  // a little life in the head even when nothing happens (never on the beat of the breath)
  const idleHead: Rot = [Math.sin(t * 0.47 + 1) * deg(1.5), Math.sin(t * 0.29) * deg(3), Math.sin(t * 0.37) * deg(1)];

  // where he looks: shared by head, neck and a little of the chest (more of it when someone speaks to him)
  const look = p.look ?? { yaw: 0, pitch: 0 };
  const body = p.mode === "listening" || p.mode === "replying" ? 0.22 : 0.12;
  r.head = add(r.head, [look.pitch * 0.6, look.yaw * (0.62 - body / 2), 0]);
  r.neck = add(r.neck, [look.pitch * 0.4, look.yaw * 0.28, 0]);
  r.chest = add(r.chest, [0, look.yaw * body, 0]);
  if (p.mode === "idle") r.head = add(r.head, idleHead);
  else r.head = add(r.head, [idleHead[0] * 0.4, idleHead[1] * 0.3, idleHead[2] * 0.4]);

  const s = p.since;
  switch (p.mode) {
    case "listening": {
      // turned to the visitor; a small nod a little after they start, then another later — not on a loop
      const nod = env(s, 1.2, 1.1, 0.3, 0.5) + env(s, 6.5, 1.0, 0.3, 0.5) * 0.7;
      r.head = add(r.head, [deg(7) * nod, 0, deg(4)]);
      r.chest = add(r.chest, [deg(2), 0, 0]);
      break;
    }
    case "attending": {
      // reading the chat: head slightly down toward it, still
      r.head = add(r.head, [deg(5), 0, 0]);
      break;
    }
    case "thinking": {
      // a gentle tilt, a look a little up and aside, the right hand raised toward the chin
      const k = ease(s / 0.8);
      r.head = add(r.head, [deg(-6) * k, deg(-10) * k, deg(-9) * k]);
      r.neck = add(r.neck, [0, 0, deg(-3) * k]);
      r.upper_arm_R = add(r.upper_arm_R, [deg(-52) * k, 0, deg(8) * k]);
      r.forearm_R = add(r.forearm_R, [deg(-124) * k, deg(34) * k, 0]);
      r.hand_R = add(r.hand_R, [deg(-15) * k, 0, 0]);
      // the other arm folds a little across the body
      r.upper_arm_L = add(r.upper_arm_L, [deg(-10) * k, 0, deg(6) * k]);
      r.forearm_L = add(r.forearm_L, [deg(-50) * k, deg(-25) * k, 0]);
      break;
    }
    case "replying": {
      // a small presenting gesture with the left hand at the start, then the voice moves the head a little
      const g = env(s, 0.1, 2.4, 0.5, 0.7);
      r.upper_arm_L = add(r.upper_arm_L, [deg(-22) * g, 0, deg(8) * g]);
      r.forearm_L = add(r.forearm_L, [deg(-62) * g, deg(18) * g, 0]);
      r.hand_L = add(r.hand_L, [0, deg(-40) * g, deg(-10) * g]);
      const v = p.still ? 0 : p.voice;
      r.head = add(r.head, [Math.sin(t * 7.3) * deg(1.6) * v, Math.sin(t * 3.1) * deg(1.4) * v, 0]);
      break;
    }
    case "turning":
    case "walking": {
      const w = p.mode === "walking" ? 1 : 0.55;
      const a = p.phase * Math.PI * 2;
      const swing = deg(24) * w;
      // legs: one forward while the other is back; the knee bends while the leg swings through
      r.thigh_L = add(r.thigh_L, [-Math.sin(a) * swing, 0, 0]);
      r.thigh_R = add(r.thigh_R, [Math.sin(a) * swing, 0, 0]);
      const kneeL = Math.max(0, Math.sin(a + Math.PI * 0.5)) * deg(40) * w + deg(5);
      const kneeR = Math.max(0, Math.sin(a + Math.PI * 1.5)) * deg(40) * w + deg(5);
      r.shin_L = add(r.shin_L, [kneeL, 0, 0]);
      r.shin_R = add(r.shin_R, [kneeR, 0, 0]);
      r.foot_L = add(r.foot_L, [Math.sin(a) * deg(10) * w - kneeL * 0.3, 0, 0]);
      r.foot_R = add(r.foot_R, [-Math.sin(a) * deg(10) * w - kneeR * 0.3, 0, 0]);
      // arms swing against the legs; the body rises a little on each step
      r.upper_arm_L = add(r.upper_arm_L, [Math.sin(a) * deg(16) * w, 0, deg(4)]);
      r.upper_arm_R = add(r.upper_arm_R, [-Math.sin(a) * deg(16) * w, 0, deg(-4)]);
      r.forearm_L = add(r.forearm_L, [deg(-12) * w, 0, 0]);
      r.forearm_R = add(r.forearm_R, [deg(-12) * w, 0, 0]);
      r.spine = add(r.spine, [deg(3) * w, Math.sin(a) * deg(4) * w, 0]);
      out.hips = [Math.sin(a) * 0.012 * w, Math.abs(Math.cos(a)) * 0.022 * w - 0.02 * w, 0];
      break;
    }
  }
  return out;
}

/** how quickly each mode takes over (per second): gestures arrive calmly, walking follows the step */
export function stiffness(mode: Mode): number {
  return mode === "walking" || mode === "turning" ? 18 : mode === "thinking" || mode === "replying" ? 6 : 5;
}
