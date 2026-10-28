import Image from "next/image";
import type { CSSProperties, ReactNode } from "react";
import { AmbientPhrases } from "@/components/background/AmbientPhrases";
import { NumberedCard } from "@/components/cards/NumberedCard";
import { Icon } from "@/components/icons/Icon";
import { GradientText } from "@/components/typography/GradientText";
import { AMBIENT_PHRASES, FEATURES, HERO } from "@/domain/home-content";
import { TashfeerCharacter } from "@/components/characters/TashfeerCharacter";
import { PortalFrame } from "@/components/portal/PortalFrame";
import { asset } from "@/lib/assets";
import { RING_ASPECT, RING_IMAGE } from "@/lib/portal-geometry";
import { ChatShell } from "./ChatShell";
import { HeroDisclosure } from "./HeroDisclosure";
import { ProcessSteps } from "./ProcessSteps";
import { SpeakerArrow } from "./SpeakerArrow";
import styles from "./HomeScene.module.css";

/**
 * Screen 1 — the owner's luminous portal with the intake inside it is the focal point; Tashfeer and the seated
 * customer frame it; the copy states the value proposition without taking over. Desktop keeps the approved
 * left-to-right composition; narrow screens lead with the portal (see HomeScene.module.css).
 */
export function HomeScene({
  characterMedia,
  chat,
}: {
  /** what Tashfeer is drawn with (default: the approved still image) — the video test passes its player */
  characterMedia?: ReactNode;
  /** the portal's content (default: the intake chat) */
  chat?: ReactNode;
} = {}) {
  const customer = asset("seated-customer");

  return (
    <section
      className={styles.scene}
      aria-labelledby="hero-title"
      data-scene=""
      style={
        {
          "--ring-aspect": RING_ASPECT.toFixed(4),
          // how far the ring image's glow reaches below its band (× ring height), measured on the asset
          "--glow-img": (RING_IMAGE.top + RING_IMAGE.height - 1).toFixed(4),
        } as CSSProperties
      }
    >
      {/* one layer over the whole scene: the phrases appear in its free space, top to bottom (AmbientPhrases) */}
      <AmbientPhrases phrases={AMBIENT_PHRASES} />

      <div className={styles.copy} data-scene-part="copy">
        <div className={styles.copyText} data-copy-text="">
          {/* one centred block, one reading order everywhere: headline → introductory statement → «كيف نبدأ؟» */}
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

          {/* the supporting paragraphs, hidden until asked for (owner's correction of 2026-10-22) */}
          <HeroDisclosure label={HERO.more} paragraphs={HERO.lede} className={styles.more} />
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
        <TashfeerCharacter className={styles.robot} media={characterMedia} />
        {/* the portal box is the ring's visible band; the glow overflows it. Glass < ring < chat content. */}
        <PortalFrame className={styles.portal}>{chat ?? <ChatShell />}</PortalFrame>
      </div>

      <SpeakerArrow />

      <ProcessSteps className={styles.features} label="مراحل المصنع">
        {FEATURES.map((label, i) => (
          <NumberedCard key={label} index={i + 1} label={label} className={styles.feature} />
        ))}
      </ProcessSteps>
    </section>
  );
}
