import type { Metadata } from "next";
import { AmbientBackground } from "@/components/background/AmbientBackground";
import { SiteHeader } from "@/components/home/SiteHeader";
import { RobotAnimationTest } from "@/components/robot-test/RobotAnimationTest";

export const metadata: Metadata = {
  title: "اختبار حركة تشفير — نسخة داخلية",
  robots: { index: false, follow: false },
};

/** Internal test page (not linked from the site): Tashfeer's listening and thinking clips on the first screen. */
export default function RobotAnimationTestPage() {
  return (
    <>
      <AmbientBackground />
      <SiteHeader />
      {/* the clips' clip layer reaches past the stage on some layouts: never a sideways scroll on this test page */}
      <main id="main" style={{ overflowX: "clip" }}>
        <RobotAnimationTest />
      </main>
    </>
  );
}
