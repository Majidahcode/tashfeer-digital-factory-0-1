/**
 * Central, explicit map from the reference package to the app's static assets.
 *
 * The package folder is READ-ONLY: this file only declares what to copy (bytes unchanged)
 * or extract from the approved prototype. Provenance and open decisions are documented in
 * docs/ASSET_INVENTORY.md (DEC-03 agent brightness, DEC-04 missing roles, DEC-05 portal ring).
 */

export const PACKAGE_ROOT = "Tashfeer_Claude_Pro_MVP_Package/Tashfeer_Claude_Pro_MVP_Package";
export const PROTOTYPE_HTML = `${PACKAGE_ROOT}/01-reference/current-tashfeer-prototype.html`;
export const AGENTS_DIR = `${PACKAGE_ROOT}/02-assets/agents`;

export const OUTPUT_DIR = "public/assets";
export const PUBLIC_PREFIX = "/assets";
export const MANIFEST_PATH = "src/generated/asset-manifest.json";

/** Files copied byte-for-byte. */
export const FILE_ASSETS = [
  {
    id: "brand-mark",
    from: `${PACKAGE_ROOT}/02-assets/brand/tashfeer-brand-mark.png`,
    to: "brand/tashfeer-mark.png",
    expect: { format: "png", alpha: true },
  },
  {
    id: "tashfeer",
    from: `${PACKAGE_ROOT}/02-assets/characters/tashfeer-robot-original.png`,
    to: "characters/tashfeer.png",
    expect: { format: "png", alpha: true },
  },
  {
    id: "seated-customer",
    from: `${PACKAGE_ROOT}/02-assets/characters/seated-customer-original.webp`,
    to: "characters/seated-customer.webp",
    expect: { format: "webp", alpha: true },
  },
];

/**
 * Images that only exist inside the approved prototype as data URIs.
 * Located by the DOM/CSS context that precedes them, never by position.
 * The portal JPEG in 02-assets/portal is not usable (no alpha, painted checkerboard).
 */
export const EMBEDDED_ASSETS = [
  { id: "portal-ring", after: 'class="ringimg"', to: "portal/ring.webp", expect: { format: "webp", alpha: true } },
  { id: "portal-inner-mask", after: ".pin{", to: "portal/inner-mask.png", expect: { format: "png", alpha: true } },
  { id: "portal-chat-mask", after: ".chatbg{", to: "portal/chat-mask.png", expect: { format: "png", alpha: true } },
];

/**
 * Agent role → source file in 02-assets/agents (explicit; never upload order).
 * null = not supplied yet. Phase 6 cannot be accepted until every role has an image.
 * Brightness/colour variant still pending owner decision DEC-03.
 */
export const AGENT_SOURCES = {
  "product-manager": null,
  research: "research-agent (2).webp",
  "requirements-analyst": null,
  "ux-ui": "ux-ui-agent (2).webp",
  "software-architect": "software-architect-agent (2).webp",
  frontend: "frontend-agent (2).webp",
  backend: "backen-agent.png",
  database: "database-agent (2).webp",
  qa: "qa-agent (2).webp",
  cybersecurity: "syber-security-agent.png",
  performance: null,
  devops: "dev-ops-agent.png",
};
