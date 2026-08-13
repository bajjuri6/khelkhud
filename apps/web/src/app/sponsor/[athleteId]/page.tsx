import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { apiServer, getMe } from "@/lib/api-server";
import type { PublicAthlete } from "@/lib/types";
import { SponsorshipCheckout } from "./sponsorship-checkout";

export const metadata = { title: "Sponsor an Athlete" };

export default async function SponsorAthletePage({
  params,
}: {
  params: Promise<{ athleteId: string }>;
}) {
  const { athleteId } = await params;
  const [me, athleteRes] = await Promise.all([
    getMe(),
    apiServer<{ data: PublicAthlete }>(`/api/athletes/${athleteId}`),
  ]);
  if (!athleteRes) notFound();
  const athlete = athleteRes.data;

  if (!me) {
    return (
      <Gate
        title={`Sign in to sponsor ${athlete.name}`}
        body="Create a sponsor account with Google to support this athlete."
        cta={{ href: `/login?next=/sponsor/${athleteId}`, label: "Sign in" }}
      />
    );
  }
  if (me.role !== "SPONSOR") {
    return (
      <Gate
        title="Sponsor account required"
        body={
          me.role === "ATHLETE"
            ? "You are signed in as a athlete. Only sponsor accounts can sponsor athletes."
            : "Only sponsor accounts can sponsor athletes."
        }
        cta={{ href: `/athletes/${athleteId}`, label: "Back to profile" }}
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8">
      <SponsorshipCheckout athlete={athlete} />
    </div>
  );
}

function Gate({
  title,
  body,
  cta,
}: {
  title: string;
  body: string;
  cta: { href: string; label: string };
}) {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-16 text-center">
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      <p className="mt-2 text-muted-foreground">{body}</p>
      <Button asChild className="mt-6">
        <Link href={cta.href}>{cta.label}</Link>
      </Button>
    </div>
  );
}
