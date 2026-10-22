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

test("brand and character assets are byte-identical copies with alpha", () => {
  for (const id of ["brand-mark", "tashfeer", "seated-customer"] as const) {
    const a = manifest.assets[id];
    expect(a.hasAlpha, id).toBe(true);
    expect(a.sha256, id).toBe(sha(a.source));
  }
});

test("the portal is derived from the owner's original ring, which is unchanged", () => {
  const ORIGINAL = "Tashfeer_Claude_Pro_MVP_Package/Tashfeer_Claude_Pro_MVP_Package/02-assets/portal/luminous-portal-ring-original.jpg";
  for (const id of ["portal-ring", "portal-hole-mask"] as const) {
    const a = manifest.assets[id];
    expect(a.derivedFrom.source, id).toBe(ORIGINAL);
    expect(a.derivedFrom.sha256, id).toBe(sha(ORIGINAL)); // the original's bytes are what the derivative was made from
    expect(a.sha256, id).toBe(sha(a.source)); // the committed derivative is what the app serves
    expect(a.hasAlpha, id).toBe(true);
    expect(a.source.startsWith("Tashfeer_Claude_Pro_MVP_Package")).toBe(false); // nothing written into the package
  }
  const ring = manifest.assets["portal-ring"];
  expect(ring.src).toBe("/assets/portal/luminous-portal-ring.png");
  // the opening the chat uses lies inside the ring band, under 50 % ring opacity
  expect(ring.geometry.content.alphaBelow).toBe(0.5);
  const box = ring.geometry.content.box;
  expect(box.left).toBeGreaterThan(0.1);
  expect(box.left + box.width).toBeLessThan(0.9);
  expect(box.top).toBeGreaterThan(0.1);
  expect(box.top + box.height).toBeLessThan(0.9);
});

test("the committed manifest is in sync with the reference package", () => {
  const r = spawnSync(process.execPath, ["scripts/sync-assets.mjs", "--check"], { encoding: "utf8" });
  expect(r.stderr).toBe("");
  expect(r.status).toBe(0);
});
