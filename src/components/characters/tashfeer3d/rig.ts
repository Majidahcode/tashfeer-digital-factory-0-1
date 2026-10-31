/**
 * Tashfeer's skeleton, posed in the character's own axes: every pose is a set of small rotations, one per bone,
 * written as if the character stood in his rest pose facing the viewer —
 *   x  pitch: + bends forward (the head nods down, an arm swings back, a forearm… see poses.ts for each sign)
 *   y  yaw:   + turns toward the character's left (the viewer's right)
 *   z  roll:  + tilts toward the character's right… (rotation about the forward axis)
 * The rig turns each into the bone's own frame (the bones' rolls from Blender never leak into the poses), and blends
 * from the current pose to the target with a critically damped ease: no jumps between states, whatever comes next.
 *
 * The skinning is rigid (blender/tashfeer/build.py): rotating a bone moves its plates as one piece.
 */
import { Bone, Euler, Object3D, Quaternion, Vector3 } from "three";

export const BONES = [
  "hips",
  "spine",
  "chest",
  "neck",
  "head",
  "clavicle_L",
  "upper_arm_L",
  "forearm_L",
  "hand_L",
  "clavicle_R",
  "upper_arm_R",
  "forearm_R",
  "hand_R",
  "thigh_L",
  "shin_L",
  "foot_L",
  "toes_L",
  "thigh_R",
  "shin_R",
  "foot_R",
  "toes_R",
] as const;
export type BoneName = (typeof BONES)[number];
export type Rot = readonly [number, number, number];
/** a pose: rotations per bone (radians, character axes) and the hips' offset (metres, character axes) */
export type Pose = { rot: Partial<Record<BoneName, Rot>>; hips?: readonly [number, number, number] };

const ORDER = "YXZ";

export class Rig {
  readonly bones: Record<BoneName, Bone>;
  private restLocal = new Map<BoneName, Quaternion>();
  /** each bone's rest orientation relative to the character (its root) */
  private restModel = new Map<BoneName, Quaternion>();
  private restModelInv = new Map<BoneName, Quaternion>();
  private current = new Map<BoneName, Quaternion>();
  private hipsRest = new Vector3();
  private hipsParentInv = new Quaternion();
  private hipsOffset = new Vector3();
  private tmpQ = new Quaternion();
  private tmpE = new Euler(0, 0, 0, ORDER);

  constructor(root: Object3D) {
    const found = {} as Record<BoneName, Bone>;
    root.traverse((o) => {
      if ((o as Bone).isBone && (BONES as readonly string[]).includes(o.name)) found[o.name as BoneName] = o as Bone;
    });
    for (const b of BONES) if (!found[b]) throw new Error(`Tashfeer's rig has no bone «${b}»`);
    this.bones = found;
    root.updateMatrixWorld(true);
    const rootInv = root.getWorldQuaternion(new Quaternion()).invert();
    for (const name of BONES) {
      const b = found[name];
      this.restLocal.set(name, b.quaternion.clone());
      const m = rootInv.clone().multiply(b.getWorldQuaternion(new Quaternion()));
      this.restModel.set(name, m);
      this.restModelInv.set(name, m.clone().invert());
      this.current.set(name, new Quaternion());
    }
    this.hipsRest.copy(found.hips.position);
    this.hipsParentInv.copy(rootInv.clone().multiply(found.hips.parent!.getWorldQuaternion(new Quaternion()))).invert();
  }

  /**
   * Move toward `target`. `k` is how quickly (per second; ~8 is a calm move, ~20 a quick one); `snap` places the pose
   * at once (reduced motion, first frame).
   */
  apply(target: Pose, dt: number, k = 8, snap = false) {
    const f = snap ? 1 : 1 - Math.exp(-dt * k);
    for (const name of BONES) {
      const r = target.rot[name];
      const goal = r ? this.tmpQ.setFromEuler(this.tmpE.set(r[0], r[1], r[2], ORDER)) : this.tmpQ.identity();
      const cur = this.current.get(name)!;
      cur.slerp(goal, f);
      // the character-axes rotation, seen from the bone's own rest frame, after its rest rotation
      const b = this.bones[name];
      b.quaternion
        .copy(this.restModelInv.get(name)!)
        .multiply(cur)
        .multiply(this.restModel.get(name)!);
      b.quaternion.premultiply(this.restLocal.get(name)!);
      // (premultiply puts rest first: local = rest · (M⁻¹ · R · M))
    }
    const h = target.hips ?? [0, 0, 0];
    this.hipsOffset.lerp(new Vector3(h[0], h[1], h[2]), f);
    this.bones.hips.position.copy(this.hipsRest).add(this.hipsOffset.clone().applyQuaternion(this.hipsParentInv));
  }
}
