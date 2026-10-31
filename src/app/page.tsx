import { AmbientBackground } from "@/components/background/AmbientBackground";
import { HomeScene } from "@/components/home/HomeScene";
import { SiteHeader } from "@/components/home/SiteHeader";
import { SiteIntro } from "@/components/intro/SiteIntro";

export default function HomePage() {
  return (
    <>
      {/* the opening, first in the page so it is decided (shown or hidden) before anything else paints; the home page
          renders and loads under it */}
      <SiteIntro />
      <AmbientBackground />
      <SiteHeader />
      <main id="main">
        <HomeScene />
      </main>
    </>
  );
}
