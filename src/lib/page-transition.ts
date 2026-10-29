/**
 * Moving between screens. Today: a short, temporary cross-fade (the View Transitions API where the browser has it,
 * otherwise a plain navigation). The full entry — Tashfeer walking to the portal, passing behind its frame, the camera
 * following him through — is not built yet; it will be a sequence of the named steps below, each driven through the
 * parts that already stand alone: TashfeerCharacter (data-tashfeer, data-tashfeer-state), PortalFrame (its "behind"
 * layer sits between the glass and the ring art) and ChatShell. The current step is written to <html
 * data-scene-transition> so styles and tests can follow it.
 */
export type TransitionStep = "idle" | "leaving" | "approachingPortal" | "behindFrame" | "cameraFollow" | "arriving";

type Navigate = (href: string) => void;
type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => void | Promise<void>) => { finished: Promise<void> };
};

export function setTransitionStep(step: TransitionStep) {
  if (step === "idle") document.documentElement.removeAttribute("data-scene-transition");
  else document.documentElement.setAttribute("data-scene-transition", step);
}

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Go to another screen with the temporary cross-fade; instantly when the visitor asks for reduced motion. */
export function transitionTo(href: string, navigate: Navigate) {
  const doc = document as ViewTransitionDocument;
  if (prefersReducedMotion() || typeof doc.startViewTransition !== "function") {
    navigate(href);
    return;
  }
  setTransitionStep("leaving");
  // the cross-fade is over (and the new screen takes pointer input again) when `finished` settles
  const transition = doc.startViewTransition(
    () =>
      new Promise<void>((resolve) => {
        navigate(href);
        // the new screen is in place once the URL has changed (polled with timers: while the browser holds the
        // transition's update, it renders no frames, so requestAnimationFrame would never fire)
        const target = new URL(href, location.href).pathname.replace(/\/$/, "");
        const started = performance.now();
        const wait = () => {
          const here = location.pathname.replace(/\/$/, "");
          if (here === target || performance.now() - started > 1500) {
            window.setTimeout(resolve, 30);
          } else window.setTimeout(wait, 16);
        };
        wait();
      }),
  );
  const done = () => setTransitionStep("idle");
  transition.finished.then(done, done);
}
