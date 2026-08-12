import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { apiServer, getMe } from "@/lib/api-server";
import type { PublicPlayer } from "@/lib/types";
import { SponsorshipCheckout } from "./sponsorship-checkout";

export const metadata = { title: "Sponsor an Athlete" };

export default async function SponsorPlayerPage({
  params,
}: {
  params: Promise<{ playerId: string }>;
}) {
  const { playerId } = await params;
  const [me, playerRes] = await Promise.all([
    getMe(),
    apiServer<{ data: PublicPlayer }>(`/api/players/${playerId}`),
  ]);
  if (!playerRes) notFound();
  const player = playerRes.data;

  if (!me) {
    return (
      <Gate
        title={`Sign in to sponsor ${player.name}`}
        body="Create a sponsor account with Google to support this athlete."
        cta={{ href: `/login?next=/sponsor/${playerId}`, label: "Sign in" }}
      />
    );
  }
  if (me.role !== "SPONSOR") {
    return (
      <Gate
        title="Sponsor account required"
        body={
          me.role === "PLAYER"
            ? "You are signed in as a player. Only sponsor accounts can sponsor athletes."
            : "Only sponsor accounts can sponsor athletes."
        }
        cta={{ href: `/athletes/${playerId}`, label: "Back to profile" }}
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8">
      <SponsorshipCheckout player={player} />
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
