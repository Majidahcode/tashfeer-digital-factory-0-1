"use client";

import { useId, useState, useSyncExternalStore } from "react";
import { Icon } from "@/components/icons/Icon";
import { cx } from "@/lib/cx";
import styles from "./HeroDisclosure.module.css";

type Props = { label: string; paragraphs: readonly string[]; className?: string };

const noSubscription = () => () => {};

/**
 * «كيف نبدأ؟» — the hero's supporting paragraphs, hidden until asked for (owner's correction §2).
 *
 * A real disclosure (WAI-ARIA APG): a button with aria-expanded/aria-controls toggles the panel; while closed the panel
 * is inert and invisible, so it is neither read nor focusable. The panel is in the page flow — it pushes what follows
 * down instead of covering it — and opens by animating its row from 0fr to 1fr. Without JavaScript the paragraphs are
 * simply shown (HeroDisclosure.module.css, scripting: none).
 */
export function HeroDisclosure({ label, paragraphs, className }: Props) {
  const [open, setOpen] = useState(false);
  // inert only once hydrated: the server markup must stay readable where scripts never run (the CSS shows it there)
  const hydrated = useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );
  const id = useId();
  const buttonId = `${id}-toggle`;
  const panelId = `${id}-panel`;

  return (
    <div className={cx(styles.root, className)} data-disclosure="" data-open={open ? "" : undefined}>
      <button
        id={buttonId}
        type="button"
        className={styles.toggle}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        data-disclosure-toggle=""
      >
        <span>{label}</span>
        <Icon name="chevron" size={18} className={styles.chevron} />
      </button>
      <div id={panelId} className={styles.panel} inert={hydrated && !open} data-disclosure-panel="">
        <div className={styles.clip}>
          <div className={styles.glass}>
            {paragraphs.map((p) => (
              <p key={p}>{p}</p>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
