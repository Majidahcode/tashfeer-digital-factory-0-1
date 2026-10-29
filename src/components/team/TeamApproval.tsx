"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { AgentCarousel } from "@/components/agents/AgentCarousel";
import { TashfeerCharacter } from "@/components/characters/TashfeerCharacter";
import { Icon, type IconName } from "@/components/icons/Icon";
import { AGENTS, agentImage, chosenLabel } from "@/domain/agents";
import {
  PLANS,
  features,
  journey,
  roleInProject,
  stageOf,
} from "@/domain/team-plan";
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
 * is shown in detail — what it receives, does and hands over, in this project — with its stage highlighted on the
 * proposed production journey. Approving saves the line-up; the next screen (the two prototypes) is not built, and
 * nothing starts: the screen says both. Changing the team after approving it withdraws the approval.
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
  const [focus, setFocus] = useState<{ id: string } | null>(null);
  const current = team.find((a) => a.id === active) ?? team[0];
  const approval = approvalOf(project);
  const files = project.attachments.filter((a) => hasFile(a.id)).length;
  const f = useMemo(() => features(project.idea, files), [project.idea, files]);
  const stages = journey(ids);
  const currentStage = current ? stageOf(current.id) : null;
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
          focus={focus}
        />

        <div className={styles.journey}>
          <h2 className={styles.journeyTitle}>رحلة الإنتاج المقترحة</h2>
          <ol className={styles.stages} data-journey="">
            {stages.map((s, i) => {
              const members = team.filter((a) => s.agents.includes(a.id));
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    className={cx(
                      styles.stage,
                      s.id === currentStage && styles.stageOn,
                    )}
                    aria-current={s.id === currentStage ? "step" : undefined}
                    title={members.map((a) => a.ar).join("، ")}
                    onClick={() =>
                      members[0] && setFocus({ id: members[0].id })
                    }
                    data-stage={s.id}
                  >
                    <span className={styles.stageNum}>{i + 1}</span>
                    <Icon name={s.icon as IconName} size={18} />
                    {s.label}
                  </button>
                </li>
              );
            })}
          </ol>
        </div>

        <div className={styles.actions}>
          {approval === "changed" && (
            <p className={styles.warn} role="status" data-approval-changed="">
              عدّلت الفريق بعد اعتماده، فأُلغي الاعتماد السابق. راجع التشكيلة
              الجديدة واعتمدها.
            </p>
          )}
          {approval === "approved" ? (
            <div
              className={styles.approved}
              role="status"
              data-team-approved=""
            >
              <Icon name="check" size={22} />
              <p>
                <b>اعتُمد فريقك: {chosenLabel(team.length)}.</b> الخطوة التالية
                مراجعة النموذجين، وهي غير متاحة بعد في هذه النسخة. لم يبدأ أي
                إنتاج.
              </p>
            </div>
          ) : (
            <button
              type="button"
              className={styles.primary}
              onClick={() => updateProject({ approvedTeam: ids })}
              data-approve-team=""
            >
              <Icon name="check" size={20} /> اعتماد الفريق ومتابعة التصور
            </button>
          )}
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
