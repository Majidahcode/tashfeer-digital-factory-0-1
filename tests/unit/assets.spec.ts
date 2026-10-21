import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import manifest from "@/generated/asset-manifest.json";

const ROLES = [
  "product-manager",
  "research",
  "requirements-analyst",
  "ux-ui",
  "software-architect",
  "frontend",
  "backend",
  "database",
  "qa",
  "cybersecurity",
  "performance",
  "devops",
];

const sha = (file: string) => createHash("sha256").update(readFileSync(path.join(process.cwd(), file))).digest("hex");

test("the role map covers exactly the 12 agents of master prompt §G", () => {
  expect(Object.keys(manifest.agents).sort()).toEqual([...ROLES].sort());
});

test("missing agent images are reported, never substituted (DEC-04)", () => {
  const missing = Object.entries(manifest.agents)
    .filter(([, a]) => a.status === "missing")
    .map(([role]) => role)
    .sort();
  expect(missing).toEqual(["performance", "product-manager", "requirements-analyst"]);
});

test("each available agent image comes from its explicitly mapped file, bytes unchanged", async () => {
  const { AGENT_SOURCES, AGENTS_DIR } = await import("../../scripts/assets.config.mjs");
  for (const [role, entry] of Object.entries(manifest.agents)) {
    if (entry.status !== "available" || !("source" in entry)) continue;
    const file = AGENT_SOURCES[role];
    expect(file, role).toBeTruthy();
    expect(entry.source).toBe(`${AGENTS_DIR}/${file}`);
    // the extension follows the real encoded format, not the file name (several "*.webp" files are PNG data)
    expect(entry.src).toBe(`/assets/agents/${role}.${entry.format}`);
    expect(entry.sha256).toBe(sha(entry.source));
  }
});

test("brand, character and portal assets are byte-identical copies with alpha", () => {
  for (const id of ["brand-mark", "tashfeer", "seated-customer"] as const) {
    const a = manifest.assets[id];
    expect(a.hasAlpha, id).toBe(true);
    expect(a.sha256, id).toBe(sha(a.source));
  }
  // the transparent ring embedded in the approved prototype (ASSET_INVENTORY §4)
  expect(manifest.assets["portal-ring"].sha256.startsWith("455ab0f23699")).toBe(true);
  expect([manifest.assets["portal-ring"].width, manifest.assets["portal-ring"].height]).toEqual([350, 511]);
});

test("the committed manifest is in sync with the reference package", () => {
  const r = spawnSync(process.execPath, ["scripts/sync-assets.mjs", "--check"], { encoding: "utf8" });
  expect(r.stderr).toBe("");
  expect(r.status).toBe(0);
});
