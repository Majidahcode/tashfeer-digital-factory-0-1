/** Types for scripts/check-tokens.mjs (used by tests/unit/tokens.spec.ts). */
export interface ColorLiteral {
  file: string;
  line: number;
  match: string;
}

/** Colour literals found in src/ outside src/styles/tokens.css and src/generated/. */
export function findColorLiterals(root?: string): Promise<ColorLiteral[]>;
