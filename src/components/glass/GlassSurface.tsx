import type { ElementType, ReactNode } from "react";
import { cx } from "@/lib/cx";
import styles from "./GlassSurface.module.css";

type Props = {
  as?: ElementType;
  level?: 1 | 2;
  className?: string;
  children: ReactNode;
} & Record<string, unknown>;

export function GlassSurface({ as: Tag = "div", level = 1, className, children, ...rest }: Props) {
  return (
    <Tag data-glass={level} className={cx(styles.glass, level === 2 && styles.raised, className)} {...rest}>
      {children}
    </Tag>
  );
}
