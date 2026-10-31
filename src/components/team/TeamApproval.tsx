"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { AgentCarousel } from "@/components/agents/AgentCarousel";
import { TashfeerCharacter } from "@/components/characters/TashfeerCharacter";
import { Icon } from "@/components/icons/Icon";
import { AGENTS, agentImage, chosenLabel } from "@/domain/agents";
import { PLANS, features, roleInProject } from "@/domain/team-plan";
import { cx } from "@/lib/cx";
import { transitionTo } from "@/lib/page-transition";
import {
  approvalOf,
  hasFile,
  updateProject,
  useProject,
} from "@/lib/project-store";
import styles from "./TeamApproval.module.css";

const NONE = new Set<string>();
const noop = () => () => {};

/**
 * Screen 3 — «اعتماد الفريق»: the agents the visitor chose (only those), on the same curved strip; the one at the centre
 * is shown in detail — what it receives, does and hands over, in this project. (The production stages stay in
 * src/domain/team-plan.ts, for the factory screen.) Approving saves the line-up and opens the prototypes review
 * (/prototypes); changing the team after approving it withdraws the approval.
 */
export function TeamApproval() {
  const router = useRouter();
  const project = useProject();
  // the project lives in this browser: until hydration the server's empty project would read as "no team"
  const hydrated = useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
  const team = useMemo(
    () => AGENTS.filter((a) => project.team?.includes(a.id)),
    [project.team],
  );
  const ids = useMemo(() => team.map((a) => a.id), [team]);
  const [active, setActive] = useState<string | null>(null);
  const current = team.find((a) => a.id === active) ?? team[0];
  const approval = approvalOf(project);
  const files = project.attachments.filter((a) => hasFile(a.id)).length;
  const f = useMemo(() => features(project.idea, files), [project.idea, files]);
  const onCenter = useCallback((id: string) => setActive(id), []);
  const go = (href: string) => transitionTo(href, (h) => router.push(h));

  if (!hydrated) return <section className={styles.screen} aria-busy="true" />;

  if (team.length === 0) {
    return (
      <section
        className={cx(styles.screen, styles.emptyScreen)}
        aria-labelledby="team-title"
        data-team-screen=""
        data-team-empty=""
      >
        <div className={styles.empty}>
          <h1 id="team-title" className={styles.title}>
            لم تختر فريقًا بعد
          </h1>
          <p className={styles.lede}>
            اختر الوكلاء الذين تريدهم لمشروعك أولًا، ثم اضغط «تأكيد الفريق» لتصل
            إلى هنا.
          </p>
          <button
            type="button"
            className={styles.primary}
            onClick={() => go("/agents")}
            data-go-agents=""
          >
            اختيار الوكلاء
          </button>
        </div>
      </section>
    );
  }

  const plan = current ? PLANS[current.id] : undefined;
  const img = current ? agentImage(current) : null;

  return (
    <section
      className={styles.screen}
      aria-labelledby="team-title"
      data-team-screen=""
    >
      <TashfeerCharacter
        className={styles.tashfeer}
        sizes="(max-width: 899px) 40vw, 18vw"
        attend={{ selector: '[data-agent-card][data-offset="0.00"]', fallback: "[data-agent-card]" }}
      />

      <div className={styles.main}>
        <header className={styles.head}>
          <span className={styles.step}>اعتماد الفريق</span>
          <h1 id="team-title" className={styles.title}>
            الفريق المختار لمشروعك
          </h1>
          <p className={styles.lede}>
            اضغط على أي وكيل لتعرف ماذا سيفعل في مشروعك.
          </p>
        </header>

        <AgentCarousel
          agents={team}
          selected={current ? new Set([current.id]) : NONE}
          suggested={NONE}
          onToggle={() => {}}
          mode="inspect"
          start={Math.floor((team.length - 1) / 2)}
          onCenter={onCenter}
        />

        <div className={styles.actions}>
          {approval === "changed" && (
            <p className={styles.warn} role="status" data-approval-changed="">
              عدّلت الفريق بعد اعتماده، فأُلغي الاعتماد السابق. راجع التشكيلة
              الجديدة واعتمدها.
            </p>
          )}
          {approval === "approved" && (
            <p
              className={styles.approvedLine}
              role="status"
              data-team-approved=""
            >
              <Icon name="check" size={18} /> اعتُمد فريقك:{" "}
              {chosenLabel(team.length)}.
            </p>
          )}
          <button
            type="button"
            className={styles.primary}
            onClick={() => {
              if (approval !== "approved") updateProject({ approvedTeam: ids });
              go("/prototypes");
            }}
            data-approve-team=""
          >
            <Icon name="check" size={20} />{" "}
            {approval === "approved"
              ? "متابعة التصور"
              : "اعتماد الفريق ومتابعة التصور"}
          </button>
          <button
            type="button"
            className={styles.secondary}
            onClick={() => go("/agents")}
            data-edit-team=""
          >
            <Icon name="pen" size={18} /> تعديل الفريق
          </button>
        </div>
      </div>

      {current && plan && (
        <aside
          className={styles.panel}
          aria-labelledby="agent-detail"
          aria-live="polite"
          data-agent-detail={current.id}
        >
          <div className={styles.panelHead}>
            <div>
              <span className={styles.badge}>الوكيل المحدد</span>
              <h2 id="agent-detail" className={styles.agentName}>
                {current.ar}
              </h2>
              <p className={styles.agentEn} dir="ltr">
                {current.en}
              </p>
              <p className={styles.mission}>{plan.mission}</p>
            </div>
            <span className={styles.portrait}>
              {img ? (
                <Image
                  src={img.src}
                  width={img.width}
                  height={img.height}
                  alt=""
                  sizes="120px"
                  loading="eager"
                />
              ) : (
                <Icon name={current.icon ?? "doc"} size={40} />
              )}
            </span>
          </div>

          <h3 className={styles.panelSub}>دوره في مشروعك</h3>
          <ul className={styles.role} data-role-lines="">
            {roleInProject(current.id, f).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>

          <dl className={styles.rows}>
            {(
              [
                ["التخصص", current.spec, "info"],
                ["يستلم", plan.receives, "doc"],
                ["المهام", plan.tasks, "target"],
                ["يسلّم", plan.delivers, "box"],
                ["الأدوات المقترحة", plan.tools, "tools"],
                ["يسلّم إلى", plan.handsTo, "handoff"],
              ] as const
            ).map(([k, v, icon]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
                <Icon name={icon} size={20} className={styles.rowIcon} />
              </div>
            ))}
          </dl>

          <p className={styles.note}>
            <Icon name="info" size={16} /> خطة مقترحة مبنية على وصفك — لم يبدأ
            أي تنفيذ، ولا يوجد ذكاء اصطناعي متصل بعد.
          </p>
        </aside>
      )}
    </section>
  );
}
