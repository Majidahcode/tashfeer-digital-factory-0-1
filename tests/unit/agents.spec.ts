import { expect, test } from "@playwright/test";
import { AGENTS, analyze, chosenLabel } from "../../src/domain/agents";
import { designApprovalOf } from "../../src/lib/project-store";

test("the counter's Arabic number agreement", () => {
  expect([0, 1, 2, 3, 10, 11, 12].map(chosenLabel)).toEqual([
    "لم يُختر أي وكيل",
    "وكيل واحد مختار",
    "وكيلان مختاران",
    "3 وكلاء مختارون",
    "10 وكلاء مختارون",
    "11 وكيلًا مختارًا",
    "12 وكيلًا مختارًا",
  ]);
});

test("the analysis: an example when nothing was typed, security and performance only when the idea calls for them", () => {
  expect(analyze("").example).toBe(true);
  const site = analyze("موقع تعريفي لمكتب هندسي");
  expect(site.example).toBe(false);
  expect(site.suggested).not.toContain("sec");
  expect(site.suggested).not.toContain("perf");
  expect(site.suggested).toHaveLength(10);
  const app = analyze("تطبيق يدفع فيه العملاء");
  expect(app.type).toBe("تطبيق");
  expect(app.suggested).toEqual(AGENTS.map((a) => a.id));
});

test("the audience reads the clinic in its possessive form too («عيادتي»)", () => {
  expect(analyze("منصة حجز مواعيد لعيادتي").audience).toBe("المرضى والعيادة");
});

test("the design approval: needs review when the idea, the team or the chosen model changes", () => {
  const base = { idea: "فكرة", attachments: [], team: ["ux", "back"], confirmed: true, approvedTeam: ["ux", "back"], chosenModel: "B" as const, notes: [] };
  const approved = { model: "B" as const, idea: "فكرة", team: ["back", "ux"], at: 0 };
  expect(designApprovalOf({ ...base, approvedDesign: null })).toBe("none");
  expect(designApprovalOf({ ...base, approvedDesign: approved })).toBe("approved");
  expect(designApprovalOf({ ...base, idea: "فكرة أخرى", approvedDesign: approved })).toBe("review");
  expect(designApprovalOf({ ...base, team: ["ux"], approvedDesign: approved })).toBe("review");
  expect(designApprovalOf({ ...base, chosenModel: "A", approvedDesign: approved })).toBe("review");
});
