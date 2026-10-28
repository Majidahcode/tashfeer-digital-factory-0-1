"use client";

import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons/Icon";
import { headerActionClass } from "@/components/home/SiteHeader";
import { transitionTo } from "@/lib/page-transition";
import styles from "./AgentSelection.module.css";

/** Back to the first screen; the idea, the attachments and the team stay (src/lib/project-store.ts). */
export function BackToIdea() {
  const router = useRouter();
  return (
    <button
      type="button"
      className={headerActionClass}
      onClick={() => transitionTo("/", (href) => router.push(href))}
      data-back-to-idea=""
    >
      <Icon name="chevron" size={16} className={styles.backIcon} /> العودة للفكرة
    </button>
  );
}
