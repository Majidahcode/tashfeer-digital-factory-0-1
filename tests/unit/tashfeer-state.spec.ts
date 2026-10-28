import { expect, test } from "@playwright/test";
import { INITIAL, next, type Machine, type TashfeerEvent } from "../../src/lib/tashfeer-state";

const run = (events: TashfeerEvent[], m: Machine = INITIAL) => {
  const plays: (string | null)[] = [];
  for (const e of events) {
    m = next(m, e);
    plays.push(m.play);
  }
  return { m, plays };
};

test("typing plays «listening» once; more typing never replays it", () => {
  const { m, plays } = run(["type", "type", "type"]);
  expect(m.state).toBe("listening");
  expect(plays).toEqual(["listening", null, null]);
});

test("sending plays «thinking» once; its end leads to replying and holds the pose", () => {
  const { m, plays } = run(["type", "submit", "submit", "clip-end", "type", "submit"]);
  expect(plays).toEqual(["listening", "thinking", null, null, null, "thinking"]);
  expect(m.state).toBe("thinking");
  expect(run(["type", "submit", "clip-end"]).m.state).toBe("replying");
});

test("typing after a reply listens without replaying the turn; reset starts over", () => {
  const { m, plays } = run(["type", "submit", "clip-end", "type", "reset", "type"]);
  expect(plays).toEqual(["listening", "thinking", null, null, null, "listening"]);
  expect(m.state).toBe("listening");
});
