import Image from "next/image";
import Link from "next/link";
import { asset } from "@/lib/assets";
import { GradientText } from "@/components/typography/GradientText";
import styles from "./BrandMark.module.css";

/**
 * Primary brand identifier (master prompt R2): the approved Tashfeer mark + the Arabic wordmark as real text.
 * The link's aria-label is its accessible name, so the image's alt text (acceptance test P1-05) is not read twice.
 */
export function BrandMark() {
  const mark = asset("brand-mark");
  return (
    <Link href="/" className={styles.brand} data-brand="" aria-label="تشفير — مصنع التحول الرقمي، الصفحة الرئيسية">
      <Image
        src={mark.src}
        width={mark.width}
        height={mark.height}
        alt="شعار تشفير"
        className={styles.mark}
        sizes="44px"
        priority
      />
      <span className={styles.text}>
        <GradientText variant="wordmark" sheen className={styles.wordmark}>
          تشفير
        </GradientText>
        <span className={styles.descriptor}>مصنع التحول الرقمي</span>
      </span>
    </Link>
  );
}
