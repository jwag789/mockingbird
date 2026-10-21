"use client";

import { useEffect } from "react";

/**
 * Fades sections in as they scroll into view. Content is visible by default;
 * only once this runs does the page opt into the hidden-until-seen state, so
 * nothing is lost without JavaScript or with reduced motion.
 */
export function RevealOnScroll() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const root = document.querySelector(".lp");
    const targets = [...document.querySelectorAll<HTMLElement>("[data-reveal]")];
    if (!root || !("IntersectionObserver" in window)) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.setAttribute("data-in", "");
          observer.unobserve(e.target);
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
    );
    // Already on screen: show right away, no flash.
    for (const t of targets) {
      if (t.getBoundingClientRect().top < window.innerHeight * 0.92) t.setAttribute("data-in", "");
      else observer.observe(t);
    }
    root.setAttribute("data-reveal-ready", "");
    return () => observer.disconnect();
  }, []);
  return null;
}
