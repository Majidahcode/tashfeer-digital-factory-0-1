import type { CSSProperties } from "react";
import { STILL } from "./tashfeer3d/still";
import { Tashfeer3D } from "./tashfeer3d/Tashfeer3D";

/**
 * Tashfeer, on every screen that shows him: his real 3D model (Tashfeer3D), in the box the screen places and sizes
 * (className) — the same proportions his picture had, so no layout changes. He follows the page's one controller
 * (src/lib/tashfeer-controller.ts). The factory shows only his mark.
 */
export function TashfeerCharacter({ className, style }: { className?: string; style?: CSSProperties; sizes?: string; priority?: boolean }) {
  return <Tashfeer3D className={className} style={{ aspectRatio: `${STILL.width} / ${STILL.height}`, ...style }} />;
}
