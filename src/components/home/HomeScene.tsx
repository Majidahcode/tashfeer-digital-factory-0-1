import Image from "next/image";
import type { CSSProperties } from "react";
import { AmbientPhrases } from "@/components/background/AmbientPhrases";
import { NumberedCard } from "@/components/cards/NumberedCard";
import { Icon } from "@/components/icons/Icon";
import { GradientText } from "@/components/typography/GradientText";
import { AMBIENT_PHRASES, FEATURES, HERO } from "@/domain/home-content";
import { asset, assetUrl } from "@/lib/assets";
import { GLASS_BOX, RING_ASPECT, RING_IMAGE, boxVars } from "@/lib/portal-geometry";
import { ChatShell } from "./ChatShell";
import { SpeakerArrow } from "./SpeakerArrow";
import styles from "./HomeScene.module.css";

/**
 * Screen 1 — the owner's luminous portal with the intake inside it is the focal point; Tashfeer and the seated
 * customer frame it; the copy states the value proposition without taking over. Desktop keeps the approved
 * left-to-right composition; narrow screens lead with the portal (see HomeScene.module.css).
 */
export function HomeScene() {
  const robot = asset("tashfeer");
  const ring = asset("portal-ring");
  const customer = asset("seated-customer");

  return (
    <section
      className={styles.scene}
      aria-labelledby="hero-title"
      data-scene=""
      style={{ "--ring-aspect": RING_ASPECT.toFixed(4) } as CSSProperties}
    >
      <AmbientPhrases phrases={AMBIENT_PHRASES} className={styles.phrases} />

      <div className={styles.copy} data-scene-part="copy">
        <div className={styles.copyText}>
          {/* three tiers, one reading order everywhere: headline → introductory statement → supporting paragraphs */}
          <h1 id="hero-title" className={styles.headline} data-hero-headline="">
            {/* «أنا» is Tashfeer: SpeakerArrow draws its pointer to the robot; on narrow screens the word sits by him */}
            <span className={styles.l1Row}>
              <GradientText sheen className={styles.l1} data-speaker-label="">
                {HERO.lines[0]}
              </GradientText>
            </span>
            <GradientText className={styles.l2}>{HERO.lines[1]}</GradientText>
            <GradientText className={styles.l3}>{HERO.lines[2]}</GradientText>
            <GradientText sheen className={styles.l4}>
              {HERO.lines[3]}
            </GradientText>
          </h1>

          <p className={styles.intro}>
            <span className={styles.dot} aria-hidden="true" />
            {HERO.badge}
          </p>

          <div className={styles.lede}>
            {HERO.lede.map((p) => (
              <p key={p}>{p}</p>
            ))}
          </div>
        </div>

        <figure className={styles.customer} data-scene-part="customer">
          <Image
            src={customer.src}
            width={customer.width}
            height={customer.height}
            alt="العميل جالس يتابع بناء منتجه"
            className={styles.customerImg}
            sizes="(max-width: 899px) 55vw, 30vw"
            data-seated-customer=""
          />
          <button type="button" className={styles.mic} disabled aria-label="تحدّث الآن — غير مفعّل في معاينة التصميم">
            <span className={styles.micText}>
              <span>تحدّث الآن</span>
              <span className={styles.wave} aria-hidden="true" />
            </span>
            <span className={styles.micIcon}>
              <Icon name="mic" size={22} />
            </span>
          </button>
        </figure>
      </div>

      <div className={styles.stage} data-scene-part="stage">
        <Image
          src={robot.src}
          width={robot.width}
          height={robot.height}
          alt="تشفير"
          className={styles.robot}
          sizes="(max-width: 899px) 30vw, 16vw"
          priority
          data-tashfeer=""
        />
        {/* the portal box is the ring's visible band; the glow overflows it. Glass < ring < chat content. */}
        <div className={styles.portal} data-portal="" style={{ aspectRatio: RING_ASPECT, ...boxVars("img", RING_IMAGE) }}>
          <div
            className={styles.glass}
            aria-hidden="true"
            style={{ ...boxVars("glass", GLASS_BOX), "--hole-mask": assetUrl("portal-hole-mask") } as CSSProperties}
          />
          {/* served as-is (lossless WebP of the derived ring): the optimizer's AVIF smeared its fine sparks */}
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
          <ChatShell />
        </div>
      </div>

      <SpeakerArrow />

      <ol className={styles.features} aria-label="مراحل المصنع" data-scene-part="features">
        {FEATURES.map((label, i) => (
          <NumberedCard key={label} index={i + 1} label={label} className={styles.feature} />
        ))}
      </ol>
    </section>
  );
}
