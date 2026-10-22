import Image from "next/image";
import Link from "next/link";
import { asset } from "@/lib/assets";
import { GradientText } from "@/components/typography/GradientText";
import styles from "./BrandMark.module.css";

/**
 * Primary brand identifier (master prompt R2): the approved Tashfeer mark + the Arabic wordmark as real text — and
 * nothing else (the owner removed the «مصنع التحول الرقمي» descriptor on 2026-10-22).
 * The link's aria-label is its accessible name, so the image's alt text (acceptance test P1-05) is not read twice.
 */
export function BrandMark() {
  const mark = asset("brand-mark");
  return (
    <Link href="/" className={styles.brand} data-brand="" aria-label="تشفير — الصفحة الرئيسية">
      <Image
        src={mark.src}
        width={mark.width}
        height={mark.height}
        alt="شعار تشفير"
        className={styles.mark}
        sizes="40px"
        priority
      />
      <GradientText variant="wordmark" sheen className={styles.wordmark}>
        تشفير
      </GradientText>
    </Link>
  );
}
