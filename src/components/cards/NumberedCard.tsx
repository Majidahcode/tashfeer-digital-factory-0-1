import type { CSSProperties } from "react";
import { cx } from "@/lib/cx";
import styles from "./NumberedCard.module.css";

type Props = {
  index: number;
  label: string;
  className?: string;
  style?: CSSProperties;
};

/**
 * One numbered step: the number tile and its label are one card. Render inside an <ol> (it carries the order for
 * assistive tech) — ProcessSteps powers each card on as it enters the viewport (NumberedCard.module.css).
 */
export function NumberedCard({ index, label, className, style }: Props) {
  const number = String(index).padStart(2, "0");
  return (
    <li className={cx(styles.item, className)} style={style} data-feature-card={number}>
      <span className={styles.tile} aria-hidden="true">
        <span className={styles.lit} />
        <span className={styles.num}>{number}</span>
      </span>
      <span className={styles.label}>{label}</span>
    </li>
  );
}
