import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getMe } from "@/lib/api-server";
import { API_URL } from "@/lib/api";
import { AuthForm } from "./auth-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const me = await getMe();
  if (me) redirect("/");
  const { next } = await searchParams;
  const googleHref = `${API_URL}/api/auth/google${next ? `?redirect=${encodeURIComponent(next)}` : ""}`;

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
          <AuthForm googleHref={googleHref} next={next} />
          <p className="mt-6 text-center text-xs leading-relaxed text-sweat">
            Athlete profiles are verified by a person before they go live. If you use
            Google we only ever read your name, email and profile picture.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
