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
  /** a number (0…1) drawn when the current mode began: varies what he does within it (never the same sequence) */
  seed: number;
  /** walking: the length of the step cycle now (metres per two steps) — short steps as he slows */
  stride: number;
};

/** his leg, from the hip joint to the ankle (metres, measured on the model) */
const LEG = 0.72;
/**
 * The leg's working length for the step (a little longer than LEG: the foot rolls under him) and how the hips must
 * follow the planted leg's angle — both measured on the model by walking him and watching the planted ankle
 * (scratch check walkcheck.mjs): with them it stays within ~1 cm of its place and height through the step.
 */
const STEP_LEG = 0.76;
const HIP_FOLLOW = 0.094;
const HIP_BASE = 0.0075;
/** the share of a step cycle a foot stays on the ground */
const STANCE = 0.6;
/** a repeatable random number (0…1) for a seed and an index */
const rnd = (seed: number, i: number) => {
  const x = Math.sin((seed * 131.7 + i * 17.13) * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};

/**
 * While he listens: when he nods and when he folds his arms, drawn from the seed — a short recording gets only the
 * turn to the visitor and perhaps one nod; a longer one, folded arms for a while (as if weighing what is said), and
 * nods at uneven moments. Nothing repeats on a fixed beat.
 */
function listening(s: number, seed: number) {
  let nod = env(s, 0.8 + rnd(seed, 0) * 0.6, 1.0, 0.3, 0.5);
  if (rnd(seed, 1) > 0.3) nod += env(s, 6 + rnd(seed, 2) * 5, 0.9, 0.3, 0.5) * 0.7;
  nod += env(s, 15 + rnd(seed, 3) * 7, 1.0, 0.3, 0.5) * 0.8;
  const a0 = 4.5 + rnd(seed, 4) * 3.5;
  const l0 = 5.5 + rnd(seed, 5) * 4;
  let fold = env(s, a0, l0, 1.3, 1.3);
  if (rnd(seed, 6) > 0.35) {
    const a1 = a0 + l0 + 6 + rnd(seed, 7) * 6;
    fold = Math.max(fold, env(s, a1, 5 + rnd(seed, 8) * 3, 1.3, 1.3));
  }
  return { nod, fold, side: rnd(seed, 9) > 0.5 ? 1 : -1 };
}

/**
 * Folded arms, `c` from 0 (at ease) to 1 (folded), after the owner's reference (2026-11-01): the forearms crossed in
 * front of the lower chest under his name, the left one in front of the right, the elbows level by his sides, the
 * shoulders at ease, each hand toward the opposite arm. Solved on the model itself (its arms are short for its broad
 * chest: the hands reach the opposite arm by its elbow, not the middle of the upper arm — as far as they go without
 * passing through anything). The way in is staged so nothing passes through anything at any moment: the upper arms
 * come forward, the front forearm crosses first, the other slides under it, the hands settle last — and the way back
 * is the same in reverse. Checked on the model at every 5 % of the way: no vertex of a hand or forearm inside the
 * chest, the other arm or the other forearm; rigid plates, nothing stretched (scratch checks: pathcheck.mjs).
 */
function folded(r: Pose["rot"], c: number) {
  if (c <= 0) return;
  const u = ease(Math.min(1, c * 1.35));
  const fl = ease((c - 0.2) / 0.55);
  const fr = ease((c - 0.45) / 0.55);
  const h = ease((c - 0.75) / 0.25);
  r.upper_arm_L = add(r.upper_arm_L, [deg(-34.5) * u, deg(-48) * u, deg(28.5) * u]);
  r.forearm_L = add(r.forearm_L, [deg(29) * fl, deg(-75) * fl, 0]);
  r.hand_L = add(r.hand_L, [deg(-15.5) * h, deg(-21.5) * h, deg(35.5) * h]);
  r.upper_arm_R = add(r.upper_arm_R, [deg(-35) * u, deg(42) * u, deg(-28.5) * u]);
  r.forearm_R = add(r.forearm_R, [deg(-16) * fr, deg(69.5) * fr, 0]);
  r.hand_R = add(r.hand_R, [deg(6) * h, deg(-4.5) * h, deg(-4.5) * h]);
  // settled back a touch, as one who weighs what he hears (the head keeps its aim on the visitor's face)
  r.chest = add(r.chest, [deg(-1.5) * c, 0, 0]);
  r.head = add(r.head, [deg(1.5) * c, 0, 0]);
}

/**
 * One leg through the step cycle (u: 0 the heel lands … STANCE the toes leave … 1). On the ground, the thigh's angle
 * moves the foot back at exactly the pace he moves forward (sin θ linear in time): the planted foot does not slide.
 * In the air, the knee bends to lift the foot and straightens before it lands. `reach` is sin of the largest angle.
 * Angles: θ forward +, the knee's bend +, the foot's pitch in the world (toes up −).
 */
function leg(u: number, reach: number) {
  if (u < STANCE) {
    const s = u / STANCE;
    const th = Math.asin(reach * (1 - 2 * s));
    const knee = deg(5) + Math.sin(Math.PI * s) * deg(7);
    // heel strike (toes up), flat on the ground, then the heel rises before the toes leave
    const foot = deg(-9) * (1 - ease(s / 0.18)) + deg(22) * ease((s - 0.72) / 0.28);
    return { th, knee, foot, ground: true };
  }
  const s = (u - STANCE) / (1 - STANCE);
  const th = Math.asin(reach * (2 * ease(s) - 1));
  const knee = deg(5) + Math.sin(Math.PI * Math.min(1, s * 1.25)) * deg(36);
  const foot = deg(22) + (deg(-9) - deg(22)) * ease(s * 1.1);
  return { th, knee, foot, ground: false };
}

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
  // (down: mostly the head and neck, the chest leans a little — the three add up to the whole look)
  r.head = add(r.head, [look.pitch * 0.5, look.yaw * (0.62 - body / 2), 0]);
  r.neck = add(r.neck, [look.pitch * 0.35, look.yaw * 0.28, 0]);
  r.chest = add(r.chest, [look.pitch * 0.15, look.yaw * body, 0]);
  if (p.mode === "idle") r.head = add(r.head, idleHead);
  else r.head = add(r.head, [idleHead[0] * 0.4, idleHead[1] * 0.3, idleHead[2] * 0.4]);

  const s = p.since;
  switch (p.mode) {
    case "listening": {
      // turned to the visitor's face (his gaze comes from the page: look), at ease; now and then a small nod, and in a
      // longer recording his arms fold for a while and open again — drawn from the seed, never on a fixed beat
      const plan = listening(p.still ? 0 : s, p.seed);
      r.head = add(r.head, [deg(5) * plan.nod, 0, deg(2.5)]);
      // the weight on one leg (which one varies)
      out.hips = [(out.hips?.[0] ?? 0) + 0.008 * plan.side * ease(s / 1.5), out.hips?.[1] ?? 0, 0];
      folded(r, p.still ? 0 : plan.fold);
      break;
    }
    case "attending": {
      // reading the chat: head slightly down toward it, still
      r.head = add(r.head, [deg(5), 0, 0]);
      break;
    }
    case "thinking": {
      // a clear moment of reflection: the head tilts and lowers a little, looking down and aside; the weight settles
      // on one leg; the right forearm comes in across the waist, the left hand rests on it — no raised hand
      const k = ease(s / 1.0);
      const drift = p.still ? 0 : Math.sin(s * 0.6) * deg(1.5); // a slow, small drift of the gaze while he thinks
      r.head = add(r.head, [deg(9) * k, (deg(-14) + drift) * k, deg(-11) * k]);
      r.neck = add(r.neck, [deg(3) * k, deg(-4) * k, deg(-3) * k]);
      r.chest = add(r.chest, [deg(3) * k, deg(-3) * k, 0]);
      out.hips = [(out.hips?.[0] ?? 0) + 0.012 * k, out.hips?.[1] ?? 0, 0];
      r.spine = add(r.spine, [0, 0, deg(-1.5) * k]);
      r.upper_arm_R = add(r.upper_arm_R, [deg(-14) * k, 0, deg(6) * k]);
      r.forearm_R = add(r.forearm_R, [deg(-62) * k, deg(38) * k, 0]);
      r.upper_arm_L = add(r.upper_arm_L, [deg(-16) * k, 0, deg(8) * k]);
      r.forearm_L = add(r.forearm_L, [deg(-70) * k, deg(-34) * k, 0]);
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
      // a real step: weight from one leg to the other, the planted foot still on the ground, the other lifted and set
      // down heel first; the knees bend as they should, the hips rise over the planted leg, the arms swing calmly
      // against the legs. The length of the step follows his pace (the caller turns distance into phase)
      const w = p.mode === "walking" ? 1 : 0.55;
      // on the ground a foot travels back STANCE × stride while he moves on: 2·LEG·reach of it
      const reach = Math.min(0.55, (STANCE * p.stride) / (2 * STEP_LEG)) * w;
      const a = p.phase;
      const L = leg(a % 1, reach);
      const R = leg((a + 0.5) % 1, reach);
      // thigh: − swings the leg forward; shin: + bends the knee; the foot keeps its own pitch in the world
      r.thigh_L = add(r.thigh_L, [-L.th, 0, 0]);
      r.thigh_R = add(r.thigh_R, [-R.th, 0, 0]);
      r.shin_L = add(r.shin_L, [L.knee, 0, 0]);
      r.shin_R = add(r.shin_R, [R.knee, 0, 0]);
      r.foot_L = add(r.foot_L, [L.foot + L.th - L.knee, 0, 0]);
      r.foot_R = add(r.foot_R, [R.foot + R.th - R.knee, 0, 0]);
      // the toes stay on the ground while the heel rises
      r.toes_L = add(r.toes_L, [-Math.max(0, L.foot) * 0.8, 0, 0]);
      r.toes_R = add(r.toes_R, [-Math.max(0, R.foot) * 0.8, 0, 0]);
      // the hips: as high as the planted leg allows (highest over it, lowest between steps), toward the planted side
      const planted = [L.ground ? L : null, R.ground ? R : null].filter((x): x is typeof L => !!x);
      const height = planted.length
        ? Math.max(...planted.map((x) => LEG * Math.cos(x.th) - LEG * (1 - Math.cos(x.knee)) * 0.35 + HIP_FOLLOW * Math.sin(x.th)))
        : LEG;
      const c = Math.cos(2 * Math.PI * (a - 0.3));
      out.hips = [0.02 * c * w, (height - LEG * Math.cos(deg(5)) - HIP_BASE) * w, 0];
      // the pelvis turns with the forward leg, the chest against it; a slight lean into the walk
      const turn = Math.cos(2 * Math.PI * a);
      r.hips = add(r.hips, [0, deg(-5) * turn * w, deg(-2) * c * w]);
      r.spine = add(r.spine, [deg(3) * w, deg(4) * turn * w, deg(1.5) * c * w]);
      r.chest = add(r.chest, [0, deg(3) * turn * w, 0]);
      r.head = add(r.head, [0, deg(-2) * turn * w, 0]);
      // arms against the legs, calm; the elbow bends a little more as the arm comes forward
      r.upper_arm_L = add(r.upper_arm_L, [deg(13) * turn * w, 0, deg(3)]);
      r.upper_arm_R = add(r.upper_arm_R, [deg(-13) * turn * w, 0, deg(-3)]);
      r.forearm_L = add(r.forearm_L, [(deg(-2) - deg(9) * Math.max(0, -turn)) * w, 0, 0]);
      r.forearm_R = add(r.forearm_R, [(deg(-2) - deg(9) * Math.max(0, turn)) * w, 0, 0]);
      break;
    }
  }
  return out;
}

/** how quickly each mode takes over (per second): gestures arrive calmly, walking follows the step */
export function stiffness(mode: Mode): number {
  return mode === "walking" || mode === "turning" ? 18 : mode === "thinking" || mode === "replying" ? 6 : 5;
}
