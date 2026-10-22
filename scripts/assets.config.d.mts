/** Types for scripts/assets.config.mjs (used by tests/unit/assets.spec.ts). */
export interface ExpectedImage {
  format: "png" | "webp" | "jpeg";
  alpha: boolean;
}

export const PACKAGE_ROOT: string;
export const PROTOTYPE_HTML: string;
export const AGENTS_DIR: string;
export const OUTPUT_DIR: string;
export const PUBLIC_PREFIX: string;
export const MANIFEST_PATH: string;

export const FILE_ASSETS: ReadonlyArray<{ id: string; from: string; to: string; expect: ExpectedImage }>;
export const DERIVED_ASSETS: ReadonlyArray<{
  id: string;
  from: string;
  provenance: string;
  to: string;
  expect: ExpectedImage;
}>;

/** Agent role → file name in AGENTS_DIR; null = image not supplied yet (DEC-04). */
export const AGENT_SOURCES: Readonly<Record<string, string | null>>;
