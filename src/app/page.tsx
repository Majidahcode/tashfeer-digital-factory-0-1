import { AmbientBackground } from "@/components/background/AmbientBackground";
import { HomeScene } from "@/components/home/HomeScene";
import { SiteHeader } from "@/components/home/SiteHeader";

export default function HomePage() {
  return (
    <>
      <AmbientBackground />
      <SiteHeader />
      <main id="main">
        <HomeScene />
      </main>
    </>
  );
}
