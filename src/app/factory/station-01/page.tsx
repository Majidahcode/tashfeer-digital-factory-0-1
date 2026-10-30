import type { Metadata } from "next";
import { BackToIdea } from "@/components/agents/BackToIdea";
import { SiteHeader } from "@/components/home/SiteHeader";
import { StationReview } from "@/components/factory/review/StationReview";

export const metadata: Metadata = {
  title: "مراجعة المحطة 01 — تشفير",
  robots: { index: false, follow: false },
};

/* a review page: station 01 alone, to compare with the reference image (the factory stays at /factory) */
export default function StationReviewPage() {
  return (
    <>
      <SiteHeader action={<BackToIdea href="/factory" label="العودة للمصنع" testId="back-to-factory" />} />
      <main id="main">
        <StationReview />
      </main>
    </>
  );
}
