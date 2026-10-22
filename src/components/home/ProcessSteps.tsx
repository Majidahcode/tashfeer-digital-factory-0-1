"use client";

import { type ReactNode, useEffect, useRef } from "react";

type Props = { className?: string; label: string; children: ReactNode };

/** Gap between cards that power on together (they rise one after another, never all at once). */
const STAGGER_MS = 150;
/** How long a tapped card stays brightened on a touch screen. */
const PULSE_MS = 900;

/**
 * The 01–05 steps (owner's correction §7). Each card starts dark and powers on — a soft yellow-green glow rising
 * from its bottom — the first time it enters the viewport; cards that enter together are staggered. A tap on a
 * touch screen briefly brightens the tapped card (hover and keyboard focus are handled in CSS). Reduced motion: all
 * cards are lit from the start. Without JavaScript the CSS shows them lit.
 *
 * The cards' state is written to the DOM (data-power, data-pulse) rather than React state: nothing re-renders.
 */
export function ProcessSteps({ className, label, children }: Props) {
  const ref = useRef<HTMLOListElement>(null);

  useEffect(() => {
    const list = ref.current;
    if (!list) return;
    const cards = [...list.querySelectorAll<HTMLElement>("[data-feature-card]")];
    const lightUp = (card: HTMLElement, delay: number) => {
      card.style.setProperty("--power-delay", `${delay}ms`);
      card.dataset.power = "on";
    };
    const instant = window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window);
    if (instant) for (const card of cards) lightUp(card, 0);
    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType !== "touch") return;
      const card = (e.target as Element | null)?.closest<HTMLElement>("[data-feature-card]");
      if (!card) return;
      card.removeAttribute("data-pulse");
      void card.offsetWidth; // restart the pulse when tapped again
      card.dataset.pulse = "";
      window.setTimeout(() => card.removeAttribute("data-pulse"), PULSE_MS);
    };
    list.addEventListener("pointerdown", onPointerDown, { passive: true });

    const observer = instant
      ? null
      : new IntersectionObserver(
          (entries) => {
            const entering = entries
              .filter((e) => e.isIntersecting)
              .map((e) => e.target as HTMLElement)
              .sort((a, b) => cards.indexOf(a) - cards.indexOf(b));
            entering.forEach((card, i) => {
              lightUp(card, i * STAGGER_MS);
              observer?.unobserve(card);
            });
          },
          { threshold: 0.45 },
        );
    if (observer) for (const card of cards) observer.observe(card);
    return () => {
      observer?.disconnect();
      list.removeEventListener("pointerdown", onPointerDown);
    };
  }, []);

  return (
    <ol ref={ref} className={className} aria-label={label} data-scene-part="features">
      {children}
    </ol>
  );
}
