"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { Me } from "@/lib/api-server";
import { UserMenu } from "@/components/user-menu";
import { NotificationBell } from "@/components/notification-bell";
import { Wordmark } from "@/components/wordmark";
import { cn } from "@/lib/utils";

function dashboardPath(role: Me["role"]): string {
  switch (role) {
    case "PLAYER":
      return "/dashboard/player";
    case "SPONSOR":
      return "/dashboard/sponsor";
    case "ADMIN":
      return "/admin";
    default:
      return "/onboarding";
  }
}

/**
 * The header has three states, because the landing page is not a normal page.
 *
 *   overlay — on `/`, before scrolling: fully transparent over the night-sky hero, which
 *             reserves space for it with its own top padding.
 *   dark    — on `/`, once scrolled: a predawn bar with cream text. It stays dark for the
 *             whole page. A cream bar was the first thing tried and it looked broken every
 *             time it passed over one of the dark bands — and the page both opens and
 *             closes dark, so cream is the wrong default here, not the dark.
 *   light   — every other route: normal cream chrome over the cream product surfaces.
 *
 * Client component for `usePathname` + the scroll listener. `me` is still resolved on the
 * server in the root layout and passed down, so this costs no extra request.
 */
export function SiteHeader({ me }: { me: Me | null }) {
  const pathname = usePathname();
  const isHome = pathname === "/";
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    if (!isHome) return;
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll(); // a refresh mid-page must not start in the transparent state
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [isHome]);

  // `onDark` covers both the transparent and the predawn states — the text treatment is
  // identical, only the bar behind it differs.
  const onDark = isHome;
  const overlay = isHome && !scrolled;

  return (
    <header
      className={cn(
        "z-50 w-full transition-colors duration-300",
        isHome ? "fixed top-0" : "sticky top-0",
        overlay && "bg-transparent",
        !overlay && onDark && "border-b border-cream/10 bg-predawn/92 backdrop-blur-md",
        !onDark && "border-b border-border bg-background/90 backdrop-blur-md",
      )}
    >
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-6">
        <div className="flex items-center gap-8">
          <Link href="/" aria-label="khelkhud home">
            <Wordmark tone={onDark ? "dark" : "light"} className="text-xl" />
          </Link>
          <nav
            className={cn(
              "hidden items-center gap-6 text-sm sm:flex",
              onDark ? "text-cream/70" : "text-muted-foreground",
            )}
          >
            <Link
              href="/athletes"
              className={cn(
                "transition-colors",
                onDark ? "hover:text-cream" : "hover:text-foreground",
              )}
            >
              Find athletes
            </Link>
            <Link
              href="/#proof"
              className={cn(
                "transition-colors",
                onDark ? "hover:text-cream" : "hover:text-foreground",
              )}
            >
              How tracking works
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-2">
          {me ? (
            <>
              <Button
                asChild
                variant={onDark ? "onDark" : "ghost"}
                size="sm"
                className={onDark ? "border-0" : undefined}
              >
                <Link href={dashboardPath(me.role)}>Dashboard</Link>
              </Button>
              <NotificationBell />
              <UserMenu me={me} />
            </>
          ) : (
            <>
              <Button
                asChild
                variant={onDark ? "onDark" : "ghost"}
                size="sm"
                className={onDark ? "border-0" : undefined}
              >
                <Link href="/login">Sign in</Link>
              </Button>
              <Button asChild size="sm" variant="accent">
                <Link href="/athletes">Find athletes</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
