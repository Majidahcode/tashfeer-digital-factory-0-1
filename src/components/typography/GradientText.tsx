import type { ElementType, ReactNode } from "react";
import { cx } from "@/lib/cx";
import styles from "./GradientText.module.css";

type Props = {
  as?: ElementType;
  variant?: "heading" | "wordmark";
  sheen?: boolean;
  className?: string;
  id?: string;
  children: ReactNode;
} & { [data: `data-${string}`]: string | undefined };

/** Gradient-clipped lettering for the wordmark, headlines and stage labels only. */
export function GradientText({ as: Tag = "span", variant = "heading", sheen = false, className, id, children, ...data }: Props) {
  return (
    <Tag
      id={id}
      data-gradient-text=""
      {...data}
      className={cx(styles.gradient, variant === "wordmark" && styles.wordmark, sheen && styles.sheen, className)}
    >
      {children}
    </Tag>
  );
}
