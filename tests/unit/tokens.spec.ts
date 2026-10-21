import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { contrast, hueSat } from "./color";

const css = readFileSync(path.join(process.cwd(), "src/styles/tokens.css"), "utf8");
const HEX: Record<string, string> = Object.fromEntries(
  [...css.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\b/g)].map((m) => [m[1]!, m[2]!.toLowerCase()]),
);
const bg = HEX["brand-bg"]!;

function gradientStops(name: string): string[] {
  const m = new RegExp(`--${name}:\\s*linear-gradient\\(([^;]+)\\);`).exec(css);
  if (!m) throw new Error(`gradient --${name} not found`);
  return [...m[1]!.matchAll(/var\(--([\w-]+)\)/g)].map((v) => v[1]!);
}

test("palette values match the sampled reference (ASSET_INVENTORY §9.2)", () => {
  expect(HEX).toMatchObject({
    "brand-bg": "#031007",
    "brand-bg-forest": "#162916",
    "brand-glass-base": "#10150f",
    "brand-emerald": "#357f22",
    "brand-emerald-bright": "#53c32c",
    "brand-lime": "#a1d520",
    "brand-lime-soft": "#8acc3f",
    "brand-highlight": "#e8f8bc",
    "brand-text-silver": "#d6e4d6",
    "brand-muted": "#acc788",
  });
});

test("P1-02 no colour token is blue or cyan (hue 160–260° with saturation > 20%)", () => {
  const offenders = Object.entries(HEX).filter(([, hex]) => {
    const { hue, sat } = hueSat(hex);
    return hue >= 160 && hue <= 260 && sat > 0.2;
  });
  expect(offenders).toEqual([]);
});

test("P1-04 every heading/wordmark gradient stop is ≥ 3:1 on the background", () => {
  for (const g of ["gradient-heading", "gradient-wordmark"]) {
    for (const stop of gradientStops(g)) {
      const hex = HEX[stop];
      expect(hex, `--${stop} in --${g} must be a palette colour`).toBeTruthy();
      expect(contrast(hex!, bg), `--${stop} in --${g}`).toBeGreaterThanOrEqual(3);
    }
  }
});

test("P1-04 body and state text colours are ≥ 4.5:1 on the background and on forest green", () => {
  for (const name of ["brand-text-silver", "brand-muted", "brand-highlight", "state-danger", "state-warning"]) {
    const hex = HEX[name]!;
    expect(contrast(hex, bg), name).toBeGreaterThanOrEqual(4.5);
    expect(contrast(hex, HEX["brand-bg-forest"]!), `${name} on forest`).toBeGreaterThanOrEqual(4.5);
  }
});

test("P1-01 no colour literals outside src/styles/tokens.css", async () => {
  const { findColorLiterals } = await import("../../scripts/check-tokens.mjs");
  expect(await findColorLiterals()).toEqual([]);
});
