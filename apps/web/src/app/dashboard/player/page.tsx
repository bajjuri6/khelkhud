import Link from "next/link";
import { formatPaise } from "@khelkhud/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatTile } from "@/components/stat-tile";
import { apiServer, getMe } from "@/lib/api-server";

export const metadata = { title: "Player Dashboard" };

type Dashboard = {
  totalReceivedPaise: number;
  activeSponsorships: number;
  fundingRequiredPaise: number;
  fundingReceivedPaise: number;
  upcomingEvents: number;
  verificationStatus: string;
};

export default async function PlayerDashboardPage() {
  const [me, dashRes] = await Promise.all([
    getMe(),
    apiServer<{ data: Dashboard }>("/api/players/me/dashboard"),
  ]);
  const d = dashRes?.data;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">Welcome, {me?.name}</h1>
            {d?.verificationStatus === "VERIFIED" ? (
              <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">✓ Verified</Badge>
            ) : (
              <Badge variant="secondary">{d?.verificationStatus ?? "PENDING"}</Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Keep your profile fresh and post updates for your sponsors.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/dashboard/player/profile">Edit profile</Link>
          </Button>
          {me?.playerProfile ? (
            <Button asChild variant="outline">
              <Link href={`/athletes/${me.playerProfile.id}`}>Public page</Link>
            </Button>
          ) : null}
        </div>
      </div>

      {d ? (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile label="Total received" value={formatPaise(d.totalReceivedPaise)} />
          <StatTile label="Active sponsorships" value={String(d.activeSponsorships)} />
          <StatTile
            label="Funding progress"
            value={`${formatPaise(d.fundingReceivedPaise)} / ${formatPaise(d.fundingRequiredPaise)}`}
          />
          <StatTile label="Upcoming events" value={String(d.upcomingEvents)} />
        </div>
      ) : null}

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sponsorships</CardTitle>
            <CardDescription>
              See who is supporting you and keep them updated on your progress.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" size="sm">
              <Link href="/dashboard/player/sponsorships">View sponsorships</Link>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Requirements</CardTitle>
            <CardDescription>
              List what you need — equipment, tournament fees, travel, coaching.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" size="sm">
              <Link href="/dashboard/player/requirements">Manage requirements</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
