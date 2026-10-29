/**
 * The scene's colours, read from the design tokens (src/styles/tokens.css) at run time: the 3D materials and the
 * textures drawn on canvases use exactly the Neon identity, and no colour value is written outside the tokens file.
 */
import { Color } from "three";

const NUM = /-?[\d.]+(?:e-?\d+)?%?/g;

/** A token's computed colour as numbers 0..1 (the browser resolves var() and color-mix()). */
function resolve(name: string, probe: HTMLElement): { r: number; g: number; b: number; a: number; css: string } {
  probe.style.color = `var(${name})`;
  const css = getComputedStyle(probe).color;
  const nums = (css.match(NUM) ?? []).map((n) => (n.endsWith("%") ? parseFloat(n) / 100 : parseFloat(n)));
  // "color(srgb r g b / a)" gives 0..1 values; the legacy form gives 0..255
  const unit = css.startsWith("color(") ? 1 : 255;
  const [r = 0, g = 0, b = 0, a = 1] = nums;
  return { r: r / unit, g: g / unit, b: b / unit, a: nums.length > 3 ? a : 1, css };
}

export type ScenePalette = Record<
  | "bg"
  | "emerald"
  | "neon"
  | "highlight"
  | "text"
  | "muted"
  | "glassBase"
  | "forest"
  | "warning"
  | "danger",
  Color
> & { css: Record<keyof typeof TOKENS, string> };

const TOKENS = {
  bg: "--brand-bg",
  emerald: "--brand-emerald",
  neon: "--brand-lime",
  highlight: "--brand-highlight",
  text: "--brand-text-silver",
  muted: "--brand-muted",
  glassBase: "--brand-glass-base",
  forest: "--brand-bg-forest",
  warning: "--state-warning",
  danger: "--state-danger",
  aBg: "--proto-a-bg",
  aSurface: "--proto-a-surface",
  aLine: "--proto-a-line",
  aText: "--proto-a-text",
  aMuted: "--proto-a-muted",
  aAccent: "--proto-a-accent",
  aInk: "--proto-a-accent-ink",
  bBg: "--proto-b-bg",
  bSurface: "--proto-b-surface",
  bLine: "--proto-b-line",
  bText: "--proto-b-text",
  bMuted: "--proto-b-muted",
  bAccent: "--proto-b-accent",
  bInk: "--proto-b-accent-ink",
} as const;

export function readPalette(): ScenePalette {
  const probe = document.createElement("span");
  probe.style.display = "none";
  document.body.appendChild(probe);
  const css = {} as Record<keyof typeof TOKENS, string>;
  const colors: Partial<Record<keyof typeof TOKENS, Color>> = {};
  for (const [key, token] of Object.entries(TOKENS) as [keyof typeof TOKENS, string][]) {
    const c = resolve(token, probe);
    css[key] = c.css;
    colors[key] = new Color().setRGB(c.r, c.g, c.b, "srgb");
  }
  probe.remove();
  return { ...(colors as Record<keyof typeof TOKENS, Color>), css } as ScenePalette;
}
