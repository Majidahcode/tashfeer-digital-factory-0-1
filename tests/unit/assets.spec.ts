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

/** The owner's reference portal exactly as attached on 2026-10-23 (the attachment's sha256). */
const REFERENCE = "assets/originals/portal/luminous-portal-reference-2026-10-23.jpg";
const REFERENCE_SHA256 = "3da0c582f606e5c05bb4dcf8181936e28130674a08afb083d91a554891dfb162";
const MASTER = "assets/derived/portal/luminous-portal-reference.png";

test("the portal is derived from the owner's reference image, which is kept byte for byte as attached", () => {
  expect(sha(REFERENCE)).toBe(REFERENCE_SHA256);
  for (const id of ["portal-ring", "portal-hole-mask"] as const) {
    const a = manifest.assets[id];
    expect(a.derivedFrom.source, id).toBe(REFERENCE);
    expect(a.derivedFrom.sha256, id).toBe(REFERENCE_SHA256); // made from those very bytes
    expect(a.derivedFrom.by, id).toBe("scripts/derive-portal-reference.py");
    expect(a.sha256, id).toBe(sha(a.source)); // the committed derivative is what the app serves
    expect(a.hasAlpha, id).toBe(true);
    expect(a.source.startsWith("Tashfeer_Claude_Pro_MVP_Package")).toBe(false); // nothing written into the package
  }
  const ring = manifest.assets["portal-ring"];
  expect(ring.src).toBe("/assets/portal/luminous-portal-reference.webp");
  // the opening the chat uses lies inside the ring band, where the ring is under 25 % opaque (clear of its inner glow)
  expect(ring.geometry.content.alphaBelow).toBe(0.25);
  const box = ring.geometry.content.box;
  expect(box.left).toBeGreaterThan(0.1);
  expect(box.left + box.width).toBeLessThan(0.9);
  expect(box.top).toBeGreaterThan(0.1);
  expect(box.top + box.height).toBeLessThan(0.9);
});

test("the served portal is a lossless copy of the derived master — every pixel identical", async () => {
  const { default: sharp } = await import("sharp");
  const raw = (file: string) => sharp(path.join(process.cwd(), file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const master = await raw(MASTER);
  const served = await raw(manifest.assets["portal-ring"].source);
  expect(served.info.width).toBe(master.info.width);
  expect(served.info.height).toBe(master.info.height);
  expect(Buffer.compare(served.data, master.data)).toBe(0);
});

test("the derived portal is the reference itself: upright as displayed, the ring's pixels unchanged, nothing brightened", async () => {
  const { default: sharp } = await import("sharp");
  const prov = JSON.parse(readFileSync(path.join(process.cwd(), "assets/derived/portal/luminous-portal-reference.json"), "utf8"));
  // the JPEG is stored 1264 × 842 with EXIF orientation 6: every viewer shows it upright, 842 × 1264, and so does the page
  expect(prov.sourceStoredSize).toEqual([1264, 842]);
  expect(prov.sourceExifOrientation).toBe(6);
  expect(prov.sourceSize).toEqual([842, 1264]);
  const [x0, y0, x1, y1] = prov.cropBox as number[];
  const src = await sharp(path.join(process.cwd(), REFERENCE))
    .rotate() // the EXIF orientation, as a viewer applies it
    .extract({ left: x0!, top: y0!, width: x1! - x0!, height: y1! - y0! })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const der = await sharp(path.join(process.cwd(), MASTER)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  expect([der.info.width, der.info.height]).toEqual([src.info.width, src.info.height]);
  let opaque = 0;
  let worstOpaque = 0;
  let worstExcess = 0;
  for (let i = 0, j = 0; i < der.data.length; i += 4, j += 3) {
    const a = der.data[i + 3]!;
    if (!a) continue;
    for (let k = 0; k < 3; k++) {
      const s = src.data[j + k]!;
      const d = der.data[i + k]!;
      if (a === 255) worstOpaque = Math.max(worstOpaque, Math.abs(d - s));
      // what the page shows of a pixel is its premultiplied colour: never more light than the reference had there
      // (only the checkerboard's neutral part is taken out)
      worstExcess = Math.max(worstExcess, (d * a) / 255 - s);
    }
    if (a === 255) opaque++;
  }
  expect(opaque).toBeGreaterThan(50_000); // the ring's body
  expect(worstOpaque).toBeLessThanOrEqual(3); // kept as it is (≤ 3 levels where it meets the haze)
  expect(worstExcess).toBeLessThanOrEqual(1); // rounding only
});

test("the committed manifest is in sync with the reference package", () => {
  const r = spawnSync(process.execPath, ["scripts/sync-assets.mjs", "--check"], { encoding: "utf8" });
  expect(r.stderr).toBe("");
  expect(r.status).toBe(0);
});
