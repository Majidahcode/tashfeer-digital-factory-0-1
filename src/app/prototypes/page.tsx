import type { Metadata } from "next";
import { BackToIdea } from "@/components/agents/BackToIdea";
import { AmbientBackground } from "@/components/background/AmbientBackground";
import { SiteHeader } from "@/components/home/SiteHeader";
import { PrototypeReview } from "@/components/prototypes/PrototypeReview";

export const metadata: Metadata = {
  title: "مراجعة النموذجين — تشفير",
  robots: { index: false, follow: false },
};

export default function PrototypesPage() {
  return (
    <>
      <AmbientBackground />
      <SiteHeader
        action={
          <BackToIdea
            href="/team"
            label="العودة للفريق"
            testId="back-to-team"
          />
        }
      />
      <main id="main">
        <PrototypeReview />
      </main>
    </>
  );
}
