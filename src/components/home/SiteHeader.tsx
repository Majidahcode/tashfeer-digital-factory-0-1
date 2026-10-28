import type { ReactNode } from "react";
import { BrandMark } from "@/components/brand/BrandMark";
import styles from "./SiteHeader.module.css";

/** The header's one action button, styled like its link (for screens whose action is not a link). */
export const headerActionClass = styles.cta;

/**
 * Minimal header: only real destinations (DEC-20 — no placeholder menu, user or language controls). The first screen
 * links to the intake; other screens pass their own action (the agents screen: back to the idea).
 */
export function SiteHeader({ action }: { action?: ReactNode } = {}) {
  return (
    <header className={styles.header} data-site-header="">
      <div className={styles.inner}>
        <BrandMark />
        {action ?? (
          <a href="#intake" className={styles.cta}>
            ابدأ بوصف مشروعك
          </a>
        )}
      </div>
    </header>
  );
}
