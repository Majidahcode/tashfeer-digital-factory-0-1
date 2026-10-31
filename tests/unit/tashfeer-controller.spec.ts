import { expect, test } from "@playwright/test";
import { INITIAL, type TashfeerEvent, type TashfeerState, focusOf, reduce } from "@/lib/tashfeer-controller";

/* Tashfeer's one controller (src/lib/tashfeer-controller.ts): the page's real events, one state at a time. */

const run = (events: TashfeerEvent[], from: TashfeerState = INITIAL) =>
  events.reduce((s, e, i) => reduce(s, e, i + 1), from);

test("typing turns him to the chat once; more typing and a short pause change nothing; an emptied field ends it", () => {
  const a = run([{ type: "type-start" }]);
  expect(a.mood).toBe("attending");
  // the same object: no change at all on each new key
  expect(reduce(a, { type: "type-start" }, 99)).toBe(a);
  expect(run([{ type: "type-stop" }], a).mood).toBe("idle");
  expect(focusOf("attending")).toBe("chat");
});

test("the microphone: listening only once it records; stopping goes back (to the chat if text is there)", () => {
  const l = run([{ type: "mic-start" }]);
  expect(l.mood).toBe("listening");
  expect(focusOf("listening")).toBe("customer");
  expect(run([{ type: "mic-stop" }], l).mood).toBe("idle");
  expect(run([{ type: "mic-stop", typing: true }], l).mood).toBe("attending");
  // a refusal sends no event: nothing changes (and a stray stop while idle changes nothing either)
  expect(reduce(INITIAL, { type: "mic-stop" })).toBe(INITIAL);
});

test("sending: thinking until the reply, an error or a cancel; a second send while thinking is ignored", () => {
  const t = run([{ type: "type-start" }, { type: "submit" }]);
  expect(t.mood).toBe("thinking");
  expect(reduce(t, { type: "submit" }, 50)).toBe(t);
  expect(reduce(t, { type: "type-start" }, 50)).toBe(t);
  expect(run([{ type: "error" }], t).mood).toBe("idle");
  expect(run([{ type: "cancel" }], t).mood).toBe("idle");
  const r = run([{ type: "reply", voice: false }], t);
  expect(r).toMatchObject({ mood: "replying", voice: false });
  expect(run([{ type: "reply-end" }], r).mood).toBe("idle");
  // a reply that arrives when nothing was asked is not shown as one
  expect(reduce(INITIAL, { type: "reply", voice: true })).toBe(INITIAL);
});

test("a voiced reply is interrupted by the visitor speaking: he listens", () => {
  const r = run([{ type: "submit" }, { type: "reply", voice: true }]);
  expect(r.voice).toBe(true);
  expect(run([{ type: "mic-start" }], r).mood).toBe("listening");
});

test("the crossing: once he is leaving nothing else starts, until the next screen resets him", () => {
  const g = run([{ type: "type-start" }, { type: "leave" }]);
  expect(g.mood).toBe("leaving");
  for (const e of [{ type: "type-start" }, { type: "mic-start" }, { type: "submit" }] as TashfeerEvent[]) expect(reduce(g, e, 9)).toBe(g);
  expect(reduce(g, { type: "reset" }, 9).mood).toBe("idle");
});
