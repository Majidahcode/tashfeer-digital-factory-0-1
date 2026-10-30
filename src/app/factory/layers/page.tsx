import type { Metadata } from "next";
import { BackToIdea } from "@/components/agents/BackToIdea";
import { AmbientBackground } from "@/components/background/AmbientBackground";
import { SiteHeader } from "@/components/home/SiteHeader";
import { LayeredFactory } from "@/components/factory/layered/LayeredFactory";

export const metadata: Metadata = {
  title: "تجربة المصنع بالطبقات — تشفير",
  robots: { index: false, follow: false },
};

/* a trial for review (the factory itself stays at /factory): the owner's pictures as layers, over the same dark
   ambient background as the earlier screens */
export default function LayeredFactoryPage() {
  return (
    <>
      <AmbientBackground />
      <SiteHeader action={<BackToIdea href="/factory" label="المصنع الحالي" testId="back-to-factory" />} />
      <main id="main">
        <LayeredFactory />
      </main>
    </>
  );
}
