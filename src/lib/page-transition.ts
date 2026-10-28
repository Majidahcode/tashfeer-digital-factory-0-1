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
type ViewTransitionDocument = Document & { startViewTransition?: (update: () => void | Promise<void>) => unknown };

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
  doc.startViewTransition(
    () =>
      new Promise<void>((resolve) => {
        navigate(href);
        // the new screen has rendered once the URL has changed and a frame has passed
        const started = performance.now();
        const wait = () => {
          if (location.pathname === new URL(href, location.href).pathname || performance.now() - started > 1500) {
            requestAnimationFrame(() => {
              setTransitionStep("idle");
              resolve();
            });
          } else requestAnimationFrame(wait);
        };
        wait();
      }),
  );
}
