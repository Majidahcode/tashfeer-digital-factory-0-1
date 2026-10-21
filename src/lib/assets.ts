import manifest from "@/generated/asset-manifest.json";

export type AssetId = keyof typeof manifest.assets;
export type AssetInfo = (typeof manifest.assets)[AssetId];

/** Approved artwork synced from the reference package (see scripts/assets.config.mjs). */
export function asset(id: AssetId): AssetInfo {
  return manifest.assets[id];
}

/** CSS `url()` value for an asset, for masks and backgrounds set through custom properties. */
export function assetUrl(id: AssetId): string {
  return `url("${manifest.assets[id].src}")`;
}
