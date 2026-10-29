import type { Metadata } from "next";
import { BackToIdea } from "@/components/agents/BackToIdea";
import { AmbientBackground } from "@/components/background/AmbientBackground";
import { SiteHeader } from "@/components/home/SiteHeader";
import { TeamApproval } from "@/components/team/TeamApproval";

export const metadata: Metadata = {
  title: "اعتماد الفريق — تشفير",
  robots: { index: false, follow: false },
};

export default function TeamPage() {
  return (
    <>
      <AmbientBackground />
      <SiteHeader
        action={
          <BackToIdea
            href="/agents"
            label="العودة لاختيار الوكلاء"
            testId="back-to-agents"
          />
        }
      />
      <main id="main">
        <TeamApproval />
      </main>
    </>
  );
}
