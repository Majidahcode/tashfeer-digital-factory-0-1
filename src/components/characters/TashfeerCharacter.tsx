import Image from "next/image";
import type { CSSProperties, ReactNode } from "react";
import { asset } from "@/lib/assets";
import { cx } from "@/lib/cx";

/** Tashfeer's states (src/lib/tashfeer-state.ts drives them where he is animated). */
export type TashfeerState = "idle" | "listening" | "thinking" | "replying";

/**
 * Tashfeer as one element that can be placed, moved and animated on its own: the scene positions it (className), the
 * state is on data-tashfeer-state, and whoever animates him later (a walk to the portal, passing behind its frame)
 * moves this element only. By default it is the approved still image; `media` replaces it (the video test, later the
 * animated character) inside the same box.
 */
export function TashfeerCharacter({
  className,
  state = "idle",
  sizes = "(max-width: 899px) 30vw, 16vw",
  priority = true,
  media,
  style,
}: {
  className?: string;
  state?: TashfeerState;
  sizes?: string;
  priority?: boolean;
  media?: ReactNode;
  style?: CSSProperties;
}) {
  const robot = asset("tashfeer");
  if (media) {
    return (
      <div
        className={className}
        // same box as the still image; no drop-shadow glow: it would outline the media's soft mask
        style={{ aspectRatio: `${robot.width} / ${robot.height}`, filter: "none", ...style }}
        role="img"
        aria-label="تشفير"
        data-tashfeer=""
        data-tashfeer-state={state}
      >
        {media}
      </div>
    );
  }
  return (
    <Image
      src={robot.src}
      width={robot.width}
      height={robot.height}
      alt="تشفير"
      className={cx(className)}
      style={style}
      sizes={sizes}
      priority={priority}
      data-tashfeer=""
      data-tashfeer-state={state}
    />
  );
}
