import Image from "next/image";
import type { CSSProperties, ReactNode } from "react";
import { asset, assetUrl } from "@/lib/assets";
import { cx } from "@/lib/cx";
import { GLASS_BOX, RING_ASPECT, RING_IMAGE, boxVars } from "@/lib/portal-geometry";
import styles from "./PortalFrame.module.css";

/**
 * The owner's luminous portal as one part: the chat's glass, the ring art (the lossless WebP derived from the owner's
 * reference image, served as-is: the optimizer's AVIF smeared its fine sparks), and the content drawn above the ring
 * (children — the chat). `behind` is a layer between the glass and the ring art, for what passes behind the frame
 * (Tashfeer, when he walks in). The box is the ring's visible band; the scene sizes and places it (className).
 */
export function PortalFrame({
  className,
  behind,
  children,
}: {
  className?: string;
  behind?: ReactNode;
  children?: ReactNode;
}) {
  const ring = asset("portal-ring");
  return (
    <div
      className={cx(styles.frame, className)}
      data-portal=""
      style={{ aspectRatio: RING_ASPECT, ...boxVars("img", RING_IMAGE) } as CSSProperties}
    >
      <div
        className={styles.glass}
        aria-hidden="true"
        style={{ ...boxVars("glass", GLASS_BOX), "--hole-mask": assetUrl("portal-hole-mask") } as CSSProperties}
      />
      {behind ? (
        <div className={styles.behind} data-portal-behind="">
          {behind}
        </div>
      ) : null}
      <div className={styles.ringClip}>
        <Image
          src={ring.src}
          width={ring.width}
          height={ring.height}
          alt=""
          className={styles.ring}
          unoptimized
          priority
          data-portal-ring=""
        />
      </div>
      {children}
    </div>
  );
}
