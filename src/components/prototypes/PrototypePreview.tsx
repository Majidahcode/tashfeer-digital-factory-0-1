import { Icon, type IconName } from "@/components/icons/Icon";
import type { Prototype } from "@/domain/prototypes";
import styles from "./PrototypePreview.module.css";

const FEATURES: readonly [IconName, string, string][] = [
  ["check", "ميزة أولى", "وصف قصير للميزة"],
  ["target", "ميزة ثانية", "وصف قصير للميزة"],
  ["tools", "ميزة ثالثة", "وصف قصير للميزة"],
  ["handoff", "ميزة رابعة", "وصف قصير للميزة"],
];
const SERVICES: readonly IconName[] = [
  "doc",
  "search",
  "pen",
  "code",
  "box",
  "rocket",
];

/**
 * One prototype's preview. For an illustrative prototype: an example page drawn in HTML — the same header, hero,
 * features and services in both directions, only the visual treatment differs — scaled to its box (every size is in
 * em of a font size set from the box's width, so nothing is stretched or cut: the height follows the content). In a
 * narrow box (a phone) the same page is drawn in its narrow layout, readable, rather than a desktop page shrunk.
 * For a real output (later): the image or the live page.
 */
export function PrototypePreview({
  prototype,
  onOpen,
}: {
  prototype: Prototype;
  /** when given, the «معاينة توضيحية» stamp is a button that opens this model in a larger window */
  onOpen?: () => void;
}) {
  const s = prototype.source;
  if (s.kind === "image") {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- an output of any size, shown as delivered
      <img
        className={styles.media}
        src={s.src}
        width={s.width}
        height={s.height}
        alt={`معاينة ${prototype.name}`}
      />
    );
  }
  if (s.kind === "url") {
    return (
      <iframe
        className={styles.media}
        src={s.src}
        title={`معاينة ${prototype.name}`}
        sandbox="allow-scripts"
      />
    );
  }
  return (
    <div
      className={styles.frame}
      data-theme={s.theme}
      data-prototype-preview={prototype.id}
    >
      <div className={styles.site} aria-hidden="true">
        <header className={styles.top}>
          <span className={styles.logo}>
            <i />
            اسم مشروعك
          </span>
          <nav className={styles.nav}>
            <span>الرئيسية</span>
            <span>الخدمات</span>
            <span>من نحن</span>
            <span>تواصل معنا</span>
          </nav>
          <span className={styles.cta}>ابدأ الآن</span>
        </header>
        <section className={styles.hero}>
          <div className={styles.heroText}>
            <b>عنوان رئيسي يعرّف بمشروعك</b>
            <p>وصف قصير لما يقدّمه مشروعك لعملائه، ولماذا يختارونه.</p>
            <span className={styles.cta}>ابدأ الآن</span>
          </div>
          <div className={styles.heroArt}>
            <i />
            <i />
            <i />
          </div>
        </section>
        <ul className={styles.features}>
          {FEATURES.map(([icon, t, d]) => (
            <li key={t}>
              <Icon name={icon} size={18} />
              <span>
                <b>{t}</b>
                {d}
              </span>
            </li>
          ))}
        </ul>
        <section className={styles.services}>
          <b>خدماتنا</b>
          <ul>
            {SERVICES.map((icon, i) => (
              <li key={icon}>
                <Icon name={icon} size={20} />
                خدمة {["أولى", "ثانية", "ثالثة", "رابعة", "خامسة", "سادسة"][i]}
              </li>
            ))}
          </ul>
        </section>
        <footer className={styles.foot}>
          <span>اسم مشروعك</span>
          <span>روابط سريعة · تواصل معنا · سياسة الخصوصية</span>
        </footer>
      </div>
      {onOpen ? (
        <button
          type="button"
          className={styles.stamp}
          onClick={onOpen}
          aria-label={`معاينة توضيحية — عرض ${prototype.name} في نافذة`}
          aria-haspopup="dialog"
          data-open-preview={prototype.id}
        >
          معاينة توضيحية
        </button>
      ) : (
        <span className={styles.stamp}>معاينة توضيحية</span>
      )}
    </div>
  );
}
