import type { Metadata } from "next";
import { AgentSelection } from "@/components/agents/AgentSelection";
import { BackToIdea } from "@/components/agents/BackToIdea";
import { AmbientBackground } from "@/components/background/AmbientBackground";
import { SiteHeader } from "@/components/home/SiteHeader";

export const metadata: Metadata = {
  title: "تحليل وبناء فكرة العميل — تشفير",
  robots: { index: false, follow: false },
};

export default function AgentsPage() {
  return (
    <>
      <AmbientBackground />
      <SiteHeader action={<BackToIdea />} />
      <main id="main">
        <AgentSelection />
      </main>
    </>
  );
}
