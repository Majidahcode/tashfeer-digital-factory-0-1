import type { Metadata } from "next";
import { BackToIdea } from "@/components/agents/BackToIdea";
import { SiteHeader } from "@/components/home/SiteHeader";
import { FactoryScreen } from "@/components/factory/FactoryScreen";

export const metadata: Metadata = {
  title: "مصنع الإنتاج — تشفير",
  robots: { index: false, follow: false },
};

/* no ambient background here: the factory is its own dark, calm scene */
export default function FactoryPage() {
  return (
    <>
      <SiteHeader
        action={<BackToIdea href="/prototypes" label="العودة للنموذجين" testId="back-to-prototypes" />}
      />
      <main id="main">
        <FactoryScreen />
      </main>
    </>
  );
}
