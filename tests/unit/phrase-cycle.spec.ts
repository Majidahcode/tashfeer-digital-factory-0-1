import { expect, test } from "@playwright/test";
import { AUTO_VISIBLE_MS, CYCLE_MS, hitTest, nextIndex, revealSource, touchTarget } from "@/lib/phrase-cycle";

test("the automatic cycle is ~5 s and each phrase fades out before the next one", () => {
  expect(CYCLE_MS).toBe(5000);
  expect(AUTO_VISIBLE_MS).toBeLessThan(CYCLE_MS);
  expect([0, 1, 2, 3, 4].map((i) => nextIndex(i, 5))).toEqual([1, 2, 3, 4, 0]);
});

test("reveal priority: touch > pointer > auto; hidden auto phrase is a ghost", () => {
  const base = { index: 2, autoIndex: 2, autoVisible: true, pointerIndex: null, touchIndex: null };
  expect(revealSource(base)).toBe("auto");
  expect(revealSource({ ...base, autoVisible: false })).toBeNull();
  expect(revealSource({ ...base, pointerIndex: 2 })).toBe("pointer");
  expect(revealSource({ ...base, pointerIndex: 2, touchIndex: 2 })).toBe("touch");
  expect(revealSource({ ...base, index: 3 })).toBeNull();
});

test("hit test honours the slop area and ignores hidden (zero-size) slots", () => {
  const rects = [
    { left: 0, top: 0, right: 0, bottom: 0 },
    { left: 100, top: 100, right: 200, bottom: 130 },
  ];
  expect(hitTest(rects, 150, 115)).toBe(1);
  expect(hitTest(rects, 90, 95, 24)).toBe(1);
  expect(hitTest(rects, 60, 60, 24)).toBe(-1);
  expect(hitTest(rects, 0, 0)).toBe(-1);
});

test("touch on a shared slot reveals the phrase after the visible one", () => {
  expect(touchTarget([], 0, 5)).toBe(-1);
  expect(touchTarget([3], 0, 5)).toBe(3);
  expect(touchTarget([0, 1, 2, 3, 4], 1, 5)).toBe(2);
  expect(touchTarget([0, 1, 2, 3, 4], 4, 5)).toBe(0);
});
