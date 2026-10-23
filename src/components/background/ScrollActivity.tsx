"use client";

import { useEffect } from "react";

/** How long after the last scroll event the page still counts as scrolling (the scrollbar stays lit that long). */
const SETTLE_MS = 700;

/**
 * Marks the document while the page scrolls (html[data-scrolling]), whatever moves it — wheel, touch, keyboard or the
 * scrollbar itself — so the scrollbar thumb can light up in lime meanwhile (globals.css; in Blink and WebKit, with a
 * fine pointer, the root's overflow switches to its equivalent `scroll` at the same moments, which redraws the
 * scrollbar). One passive listener; the attribute changes twice per gesture. Renders nothing.
 */
export function ScrollActivity() {
  useEffect(() => {
    const root = document.documentElement;
    let settle = 0;
    const onScroll = () => {
      if (!root.hasAttribute("data-scrolling")) root.setAttribute("data-scrolling", "");
      window.clearTimeout(settle);
      settle = window.setTimeout(() => root.removeAttribute("data-scrolling"), SETTLE_MS);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.clearTimeout(settle);
      root.removeAttribute("data-scrolling");
    };
  }, []);
  return null;
}
