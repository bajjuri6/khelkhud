import Link from "next/link";
import { formatPaise } from "@khelkhud/shared";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { apiServer } from "@/lib/api-server";

export const metadata = { title: "My Sponsorships" };

type SponsorshipRow = {
  id: string;
  code: string;
  amountPaise: number;
  purpose: string;
  status: string;
  utilizationStatus: string;
  createdAt: string;
  sponsor: { displayName: string | null; user: { name: string; avatarUrl: string | null } };
  requirement: { id: string; title: string } | null;
};

export default async function PlayerSponsorshipsPage() {
  const res = await apiServer<{ data: SponsorshipRow[] }>("/api/players/me/sponsorships");
  const sponsorships = res?.data ?? [];

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">My Sponsorships</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Support you have received. Post updates so sponsors can see the impact.
      </p>

      {sponsorships.length === 0 ? (
        <div className="mt-8 rounded-lg border border-dashed p-12 text-center">
          <p className="text-muted-foreground">
            No sponsorships yet. Complete your profile and add requirements so sponsors can find
            you.
          </p>
          <Button asChild variant="outline" className="mt-4">
            <Link href="/dashboard/player/requirements">Manage requirements</Link>
          </Button>
        </div>
      ) : (
        <div className="mt-6 grid gap-4">
          {sponsorships.map((s) => {
            const name = s.sponsor.displayName ?? s.sponsor.user.name;
            return (
              <Card key={s.id}>
                <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-6">
                  <div className="flex items-center gap-3">
                    <Avatar className="size-12">
                      {s.sponsor.user.avatarUrl ? (
                        <AvatarImage src={s.sponsor.user.avatarUrl} alt={name} />
                      ) : null}
                      <AvatarFallback>{name[0]}</AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{name}</span>
                        <span className="font-mono text-xs text-muted-foreground">{s.code}</span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {s.purpose}
                        {s.requirement ? ` · ${s.requirement.title}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="font-semibold">{formatPaise(s.amountPaise)}</p>
                      <Badge variant="outline" className="mt-1">
                        {s.utilizationStatus.replace("_", " ").toLowerCase()}
                      </Badge>
                    </div>
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/dashboard/player/sponsorships/${s.id}`}>Manage</Link>
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
