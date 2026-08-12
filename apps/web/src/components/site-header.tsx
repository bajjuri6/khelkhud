import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { Me } from "@/lib/api-server";
import { UserMenu } from "@/components/user-menu";
import { NotificationBell } from "@/components/notification-bell";

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

export function SiteHeader({ me }: { me: Me | null }) {
  return (
    <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4">
        <div className="flex items-center gap-6">
          <Link href="/" className="text-lg font-bold tracking-tight">
            khel<span className="text-primary">khud</span>
          </Link>
          <nav className="hidden items-center gap-4 text-sm text-muted-foreground sm:flex">
            <Link href="/athletes" className="transition-colors hover:text-foreground">
              Find Athletes
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-2">
          {me ? (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link href={dashboardPath(me.role)}>Dashboard</Link>
              </Button>
              <NotificationBell />
              <UserMenu me={me} />
            </>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link href="/login">Sign in</Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/athletes">Find Athletes</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
