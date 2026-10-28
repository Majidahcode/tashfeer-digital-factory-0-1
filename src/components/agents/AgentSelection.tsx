"use client";

import Image from "next/image";
import { useMemo } from "react";
import { TashfeerCharacter } from "@/components/characters/TashfeerCharacter";
import { Icon } from "@/components/icons/Icon";
import { AGENTS, agentImage, analyze, chosenLabel } from "@/domain/agents";
import { linksIn, updateProject, useProject } from "@/lib/project-store";
import { AgentCarousel } from "./AgentCarousel";
import styles from "./AgentSelection.module.css";

/**
 * Screen 2 — «تحليل وبناء فكرة العميل»: Tashfeer has read the idea and suggests a team; the visitor adds or removes
 * agents and confirms. The analysis is a local, rule-based reading of what was typed (src/domain/agents.ts) — no
 * assistant is connected, and the summary says so. The choice is kept with the idea (src/lib/project-store.ts).
 * The next step (approving the team, the two prototypes, the factory) is not built: confirming shows that plainly.
 */
export function AgentSelection() {
  const project = useProject();
  const analysis = useMemo(() => analyze(project.idea), [project.idea]);
  const suggested = useMemo(() => new Set(analysis.suggested), [analysis]);
  const team = useMemo(() => new Set(project.team ?? analysis.suggested), [project.team, analysis]);
  const chosen = AGENTS.filter((a) => team.has(a.id));
  const links = linksIn(project.idea);

  const setTeam = (ids: Iterable<string>) => updateProject({ team: [...ids], confirmed: false });
  const toggle = (id: string) => {
    const next = new Set(team);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setTeam(AGENTS.map((a) => a.id).filter((x) => next.has(x)));
  };

  return (
    <section className={styles.screen} aria-labelledby="agents-title" data-agents-screen="">
      <aside className={styles.side}>
        <div className={styles.summary} data-project-summary="">
          <h2 className={styles.summaryTitle}>
            <Icon name="doc" size={18} /> ملخص المشروع
          </h2>
          <p className={styles.badge} data-summary-source={analysis.example ? "example" : "idea"}>
            {analysis.example ? "مثال تجريبي — لم تكتب فكرة بعد" : "قراءة أولية محلية لفكرتك — لا يوجد ذكاء اصطناعي متصل بعد"}
          </p>
          <blockquote className={styles.idea} dir="auto">
            {analysis.idea}
          </blockquote>
          <dl className={styles.facts}>
            <div>
              <dt>نوع المنتج</dt>
              <dd>{analysis.type}</dd>
            </div>
            <div>
              <dt>الجمهور المستهدف</dt>
              <dd>{analysis.audience}</dd>
            </div>
            <div>
              <dt>سبب الترشيح</dt>
              <dd>{analysis.reasons.join("؛ ")}</dd>
            </div>
            {(project.attachments.length > 0 || links.length > 0) && (
              <div>
                <dt>المرفقات</dt>
                <dd data-summary-attachments="">
                  {[
                    project.attachments.length ? `${project.attachments.length} ملف` : "",
                    links.length ? `${links.length} رابط` : "",
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </dd>
              </div>
            )}
          </dl>
        </div>
        <TashfeerCharacter className={styles.tashfeer} sizes="(max-width: 899px) 40vw, 18vw" />
      </aside>

      <div className={styles.main}>
        <header className={styles.head}>
          <span className={styles.step}>تحليل الفكرة واختيار الوكلاء</span>
          <h1 id="agents-title" className={styles.title}>
            تحليل وبناء فكرة العميل
          </h1>
          <p className={styles.lede}>رشّح تشفير الوكلاء الأنسب لمشروعك. اضغط على أي وكيل لإضافته أو إزالته.</p>
        </header>

        <div className={styles.actions}>
          <span className={styles.legend}>
            <i aria-hidden="true" /> مقترح من تشفير
          </span>
          <button type="button" className={styles.action} onClick={() => setTeam(analysis.suggested)} data-select-suggested="">
            اختيار المقترحين
          </button>
          <button type="button" className={styles.action} onClick={() => setTeam([])} data-select-none="">
            إلغاء التحديد
          </button>
        </div>

        {/* the first agent with an image at the centre: agents on both sides from the start */}
        <AgentCarousel
          agents={AGENTS}
          selected={team}
          suggested={suggested}
          onToggle={toggle}
          start={Math.max(0, AGENTS.findIndex((a) => agentImage(a)))}
        />

        <div className={styles.bar} data-team-bar="">
          {project.confirmed && chosen.length > 0 ? (
            <div className={styles.confirmed} role="status" data-team-confirmed="">
              <p>
                <b>حُفظ الفريق: {chosenLabel(chosen.length)}.</b> اعتماد الفريق وبدء العمل لم يُبنيا بعد في هذه النسخة — لم
                يبدأ أي إنتاج.
              </p>
              <button type="button" className={styles.action} onClick={() => updateProject({ confirmed: false })}>
                تعديل الفريق
              </button>
            </div>
          ) : (
            <>
              <ul className={styles.avatars} aria-hidden="true">
                {chosen.slice(0, 6).map((a) => {
                  const img = agentImage(a);
                  return (
                    <li key={a.id}>
                      {img ? <Image src={img.src} width={44} height={44} alt="" sizes="44px" /> : <span>{a.ar.slice(0, 1)}</span>}
                    </li>
                  );
                })}
                {chosen.length > 6 && <li className={styles.more}>+{chosen.length - 6}</li>}
              </ul>
              <p className={styles.count} aria-live="polite" data-team-count={chosen.length}>
                {chosenLabel(chosen.length)}
              </p>
              <button
                type="button"
                className={styles.confirm}
                disabled={chosen.length === 0}
                onClick={() => updateProject({ team: chosen.map((a) => a.id), confirmed: true })}
                data-confirm-team=""
              >
                تأكيد الفريق
              </button>
            </>
          )}
        </div>
      </div>

    </section>
  );
}
