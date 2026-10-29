"use client";

import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons/Icon";
import { headerActionClass } from "@/components/home/SiteHeader";
import { transitionTo } from "@/lib/page-transition";
import styles from "./AgentSelection.module.css";

/**
 * The header's way back to the previous screen; the idea, the attachments and the team stay
 * (src/lib/project-store.ts). Defaults: from the agents screen back to the idea.
 */
export function BackToIdea({
  href = "/",
  label = "العودة للفكرة",
  testId = "back-to-idea",
}: {
  href?: string;
  label?: string;
  testId?: string;
}) {
  const router = useRouter();
  return (
    <button
      type="button"
      className={headerActionClass}
      onClick={() => transitionTo(href, (h) => router.push(h))}
      {...{ [`data-${testId}`]: "" }}
    >
      <Icon name="chevron" size={16} className={styles.backIcon} /> {label}
    </button>
  );
}
