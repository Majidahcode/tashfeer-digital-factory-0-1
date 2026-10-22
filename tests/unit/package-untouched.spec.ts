import { spawnSync } from "node:child_process";
import { expect, test } from "@playwright/test";

const PKG = "Tashfeer_Claude_Pro_MVP_Package";
const git = (...args: string[]) => spawnSync("git", args, { encoding: "utf8" });

test("P1-18 the reference package is unchanged (no edits, moves or deletions)", () => {
  const status = git("status", "--porcelain", "--", PKG);
  test.skip(status.status !== 0, "git not available");
  expect(status.stdout.trim()).toBe("");
  expect(git("diff", "--quiet", "HEAD", "--", PKG).status).toBe(0);
});
