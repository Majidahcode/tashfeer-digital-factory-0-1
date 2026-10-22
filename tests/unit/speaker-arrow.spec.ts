import { expect, test } from "@playwright/test";
import { type Box, type Curve, arcToHead, arrivalAngle, bend, bezier, hookToChest, pointer } from "@/lib/speaker-arrow";

const box = (left: number, top: number, width: number, height: number): Box => ({ left, top, right: left + width, bottom: top + height });
const touches = (c: Curve, b: Box, pad = 0) => {
  for (let i = 0; i <= 60; i++) {
    const p = bezier(c, i / 60);
    if (p.x > b.left - pad && p.x < b.right + pad && p.y > b.top - pad && p.y < b.bottom + pad) return true;
  }
  return false;
};

// a 1280 × 800 layout as measured: «أنا» centred over the headline, the robot to the right and below
const scene = box(0, 0, 1240, 730);
const label = box(197, 55, 30, 28);
const robot = box(414, 263, 154, 400);
const lines = [box(105, 92, 210, 50), box(204, 142, 16, 12), box(75, 160, 270, 36)];
const intro = box(75, 210, 275, 46);
const button = box(148, 275, 126, 44);

test("§4 above the robot: a gentle arc that arrives diagonally and crosses nothing", () => {
  const guards = [...lines, intro, button];
  const c = arcToHead(label, robot, guards, scene);
  for (const g of guards) expect(touches(c, g, 2), JSON.stringify(g)).toBe(false);
  const angle = arrivalAngle(c);
  expect(angle, "diagonal, neither flat nor straight down").toBeGreaterThanOrEqual(30);
  expect(angle).toBeLessThanOrEqual(78);
  expect(bend(c), "curved, not a straight stroke").toBeGreaterThanOrEqual(0.06);
  // it ends just above his head
  expect(Math.abs(c.E.x - (robot.left + robot.right) / 2)).toBeLessThan(20);
  expect(robot.top - c.E.y).toBeGreaterThan(0);
  expect(robot.top - c.E.y).toBeLessThan(16);
});

test("§4 the arc goes around whatever stands in its natural way", () => {
  const free = arcToHead(label, robot, [...lines, intro, button], scene);
  // an obstacle (say, an ambient phrase) placed right where the free arc rises: the chosen arc must avoid it
  const top = Math.min(...Array.from({ length: 41 }, (_, i) => bezier(free, i / 40).y));
  const wall = box(260, top - 20, 120, 22); // over the arc's crest, clear of the word itself
  expect(touches(free, wall, 2), "the obstacle is really in the way").toBe(true);
  const c = arcToHead(label, robot, [...lines, intro, button, wall], scene);
  expect(touches(c, wall, 2)).toBe(false);
  for (const g of [...lines, intro, button]) expect(touches(c, g, 2)).toBe(false);
});

test("§4 the word straight above the head no longer gives a vertical arrow", () => {
  // 768: the word now sits above and to the left of his head; even straight above, the arrow arrives at a slant
  const r = box(64, 495, 100, 260);
  const straightAbove = arcToHead(box(92, 410, 44, 30), r, [], box(0, 0, 768, 1200));
  expect(arrivalAngle(straightAbove)).toBeLessThanOrEqual(78);
  const aboveLeft = arcToHead(box(16, 400, 44, 30), r, [], box(0, 0, 768, 1200));
  expect(arrivalAngle(aboveLeft)).toBeGreaterThanOrEqual(30);
  expect(arrivalAngle(aboveLeft)).toBeLessThanOrEqual(78);
  expect(bend(aboveLeft)).toBeGreaterThanOrEqual(0.06);
});

test("phones keep the approved hook: sideways from the word, down onto the chest", () => {
  const r = box(14, 720, 92, 240);
  const word = box(150, 740, 40, 34);
  const hook = hookToChest(word, r);
  expect(hook.C1.y).toBe(hook.S.y); // it leaves the word level
  expect(hook.E.x).toBeLessThan(word.left);
  expect(pointer(word, r, [], box(0, 0, 390, 1600)).curve).toEqual(hook);
});
