import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getMe } from "@/lib/api-server";
import { API_URL } from "@/lib/api";

export const metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const me = await getMe();
  if (me) redirect("/");
  const { next } = await searchParams;
  const href = `${API_URL}/api/auth/google${next ? `?redirect=${encodeURIComponent(next)}` : ""}`;

  return (
    <div className="flex min-h-[78svh] items-center justify-center px-6 py-16">
      <Card className="w-full max-w-md border-border p-2 shadow-long">
        <CardHeader className="text-center">
          <p className="eyebrow text-marigold">Welcome</p>
          <CardTitle className="mt-3 font-display text-h2 font-semibold">
            One account, either side.
          </CardTitle>
          <CardDescription className="mt-2 leading-relaxed">
            Sign in to create an athlete profile, or to start backing one. You pick which
            after you&rsquo;re in.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild className="w-full" size="hero" variant="accent">
            <a href={href}>
              <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M21.35 11.1H12v2.9h5.35c-.5 2.5-2.6 3.9-5.35 3.9a6 6 0 1 1 0-12c1.5 0 2.9.55 3.95 1.5l2.2-2.2A9 9 0 1 0 12 21c5.2 0 8.85-3.65 8.85-8.85 0-.35-.03-.7-.1-1.05Z"
                />
              </svg>
              Continue with Google
            </a>
          </Button>
          <p className="mt-5 text-center text-xs leading-relaxed text-sweat">
            We only ever read your name, email and profile picture. Athlete profiles are
            verified by a person before they go live.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
