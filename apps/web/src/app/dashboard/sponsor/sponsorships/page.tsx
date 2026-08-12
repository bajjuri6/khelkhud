import Link from "next/link";
import { formatPaise } from "@khelkhud/shared";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { apiServer } from "@/lib/api-server";
import { profilePhotoUrl } from "@/lib/upload";

export const metadata = { title: "My Sponsorships" };

type SponsorshipRow = {
  id: string;
  code: string;
  amountPaise: number;
  purpose: string;
  status: string;
  paymentStatus: string;
  utilizationStatus: string;
  createdAt: string;
  player: {
    id: string;
    photoKey: string | null;
    user: { name: string; avatarUrl: string | null };
    sport: { name: string } | null;
  };
  updates: { title: string; createdAt: string }[];
};

const UTILIZATION_LABELS: Record<string, string> = {
  NOT_STARTED: "Not started",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
};

export default async function SponsorSponsorshipsPage() {
  const res = await apiServer<{ data: SponsorshipRow[] }>("/api/sponsors/me/sponsorships");
  const sponsorships = res?.data ?? [];

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">My Sponsorships</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Every sponsorship is tracked — see how your support is used.
      </p>

      {sponsorships.length === 0 ? (
        <div className="mt-8 rounded-lg border border-dashed p-12 text-center">
          <p className="text-muted-foreground">You haven&apos;t sponsored anyone yet.</p>
          <Button asChild className="mt-4">
            <Link href="/athletes">Find athletes to support</Link>
          </Button>
        </div>
      ) : (
        <div className="mt-6 grid gap-4">
          {sponsorships.map((s) => {
            const photo = profilePhotoUrl(s.player.photoKey) ?? s.player.user.avatarUrl;
            return (
              <Card key={s.id}>
                <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-6">
                  <div className="flex items-center gap-3">
                    <Avatar className="size-12">
                      {photo ? <AvatarImage src={photo} alt={s.player.user.name} /> : null}
                      <AvatarFallback>{s.player.user.name[0]}</AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{s.player.user.name}</span>
                        <span className="font-mono text-xs text-muted-foreground">{s.code}</span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {[s.player.sport?.name, s.purpose].filter(Boolean).join(" · ")}
                      </p>
                      {s.updates[0] ? (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Latest update: {s.updates[0].title}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="font-semibold">{formatPaise(s.amountPaise)}</p>
                      <div className="mt-1 flex gap-1">
                        <Badge variant={s.paymentStatus === "PAID" ? "default" : "secondary"}>
                          {s.paymentStatus}
                        </Badge>
                        <Badge variant="outline">
                          {UTILIZATION_LABELS[s.utilizationStatus] ?? s.utilizationStatus}
                        </Badge>
                      </div>
                    </div>
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/dashboard/sponsor/sponsorships/${s.id}`}>Track</Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
