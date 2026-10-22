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

// Owner decision DEC-02 (2026-10-22): the Neon palette of the approved prototype, exactly.
const NEON = {
  "brand-bg": "#030504",
  "brand-emerald": "#087a3f",
  "brand-lime": "#baff24",
  "brand-highlight": "#e5ff45",
  "brand-text-silver": "#c9ceca",
  "brand-gold": "#d9b84a",
} as const;

test("the palette is the Neon decision, value for value", () => {
  expect(HEX).toMatchObject(NEON);
});

test("every secondary colour is a mix of the six Neon values (no other hues)", () => {
  const rgb = (hex: string) => [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
  const mix = (a: keyof typeof NEON, share: number, b: keyof typeof NEON) =>
    rgb(NEON[a]).map((v, i) => share * v + (1 - share) * rgb(NEON[b])[i]!);
  const recipes: Record<string, number[]> = {
    "brand-bg-forest": mix("brand-emerald", 0.45, "brand-bg"),
    "brand-glass-base": mix("brand-emerald", 0.1, "brand-bg"),
    "brand-emerald-bright": mix("brand-emerald", 0.5, "brand-lime"),
    "brand-muted": mix("brand-text-silver", 0.82, "brand-bg"),
    "brand-digit-top": mix("brand-lime", 0.55, "brand-emerald"),
    "brand-digit-mid": rgb(NEON["brand-emerald"]),
    "brand-digit-low": mix("brand-emerald", 0.75, "brand-bg"),
  };
  for (const [name, want] of Object.entries(recipes)) {
    const got = rgb(HEX[name]!);
    got.forEach((v, i) => expect(Math.abs(v - want[i]!), `--${name} channel ${i}`).toBeLessThanOrEqual(1));
  }
  // and nothing else in the palette section: every hex token is Neon, a recipe above, or a semantic state
  const allowed = new Set([...Object.keys(NEON), ...Object.keys(recipes), "state-danger", "state-warning"]);
  expect(Object.keys(HEX).filter((k) => !allowed.has(k))).toEqual([]);
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
