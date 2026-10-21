import Image from "next/image";
import type { CSSProperties } from "react";
import { AmbientPhrases } from "@/components/background/AmbientPhrases";
import { NumberedCard } from "@/components/cards/NumberedCard";
import { GlassSurface } from "@/components/glass/GlassSurface";
import { Icon } from "@/components/icons/Icon";
import { GradientText } from "@/components/typography/GradientText";
import { AMBIENT_PHRASES, FEATURES, HERO } from "@/domain/home-content";
import { asset, assetUrl } from "@/lib/assets";
import { ChatShell } from "./ChatShell";
import styles from "./HomeScene.module.css";

/**
 * Screen 1 — the approved composition (seated customer, headline, Tashfeer beside the portal, intake inside the
 * portal, numbered cards around it) rebuilt as a responsive layout instead of a scaled 1400×842 canvas.
 */
export function HomeScene() {
  const robot = asset("tashfeer");
  const ring = asset("portal-ring");
  const customer = asset("seated-customer");

  return (
    <section className={styles.scene} aria-labelledby="hero-title" data-scene="">
      <AmbientPhrases phrases={AMBIENT_PHRASES} className={styles.phrases} />

      <div className={styles.copy} data-scene-part="copy">
        <div className={styles.copyText}>
          <GlassSurface as="p" className={styles.badge}>
            <span className={styles.dot} aria-hidden="true" />
            {HERO.badge}
          </GlassSurface>

          <h1 id="hero-title" className={styles.headline} data-hero-headline="">
            {/* «— أنا ——↘» : the prototype's pointer from "I" toward Tashfeer, rebuilt to flex with the column */}
            <span className={styles.l1Row}>
              <svg className={styles.curve} viewBox="0 0 40 44" aria-hidden="true" focusable="false">
                <path d="M0 12H14Q30 12 30 36" />
                <path d="M23 30L30 40L37 30" />
              </svg>
              <span className={styles.line} aria-hidden="true" />
              <GradientText sheen className={styles.l1}>
                {HERO.lines[0]}
              </GradientText>
              <span className={styles.dash} aria-hidden="true" />
            </span>
            <GradientText className={styles.l2}>{HERO.lines[1]}</GradientText>
            <GradientText className={styles.l3}>{HERO.lines[2]}</GradientText>
            <GradientText sheen className={styles.l4}>
              {HERO.lines[3]}
            </GradientText>
          </h1>

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
            sizes="(max-width: 899px) 70vw, 36vw"
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
          sizes="(max-width: 899px) 30vw, 22vw"
          priority
          data-tashfeer=""
        />
        <div className={styles.portal} data-portal="">
          <div className={styles.portalArt}>
            <div
              className={styles.portalGlow}
              aria-hidden="true"
              style={{ "--inner-mask": assetUrl("portal-inner-mask") } as CSSProperties}
            />
            <Image
              src={ring.src}
              width={ring.width}
              height={ring.height}
              alt=""
              className={styles.ring}
              sizes="(max-width: 899px) 55vw, 40vw"
              priority
              data-portal-ring=""
            />
          </div>
          <ChatShell className={styles.chat} />
        </div>
      </div>

      <ol className={styles.features} aria-label="مراحل المصنع" data-scene-part="features">
        {FEATURES.map((label, i) => (
          <NumberedCard key={label} index={i + 1} label={label} className={styles.feature} />
        ))}
      </ol>
    </section>
  );
}
