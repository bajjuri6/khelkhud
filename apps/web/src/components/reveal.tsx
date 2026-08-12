"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Scroll-reveal wrapper (brand doc §5): opacity + a 28px rise, once per section, never
 * nested. The observer disconnects after the first intersection — this is an entrance,
 * not a scroll-linked effect, and re-animating on scroll-up is the thing that makes
 * reveal animations feel cheap.
 *
 * `prefers-reduced-motion` is handled in CSS (globals.css), not here, so the element is
 * visible even if hydration is slow or JS never arrives.
 */
export function Reveal({
  children,
  className,
  delay = 0,
  as: Tag = "div",
}: {
  children: React.ReactNode;
  className?: string;
  /** Stagger, in ms. Keep under ~240 — beyond that it reads as a loading bug. */
  delay?: number;
  as?: "div" | "section" | "li" | "article";
}) {
  const ref = useRef<HTMLElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Already in view on mount (above the fold, or a deep link): show immediately rather
    // than waiting for a scroll event that may never come.
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.05 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <Tag
      ref={ref as React.Ref<never>}
      className={cn("reveal", shown && "is-in", className)}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </Tag>
  );
}
