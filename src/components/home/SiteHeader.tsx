import { BrandMark } from "@/components/brand/BrandMark";
import styles from "./SiteHeader.module.css";

/** Minimal header: only real destinations (DEC-20 — no placeholder menu, user or language controls). */
export function SiteHeader() {
  return (
    <header className={styles.header} data-site-header="">
      <div className={styles.inner}>
        <BrandMark />
        <a href="#intake" className={styles.cta}>
          ابدأ بوصف مشروعك
        </a>
      </div>
    </header>
  );
}
