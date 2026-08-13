import Link from "next/link";
import { formatPaise } from "@khelkhud/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatTile } from "@/components/stat-tile";
import { apiServer, getMe } from "@/lib/api-server";

export const metadata = { title: "Sponsor Dashboard" };

type Dashboard = {
  totalSponsoredPaise: number;
  athletesSupported: number;
  activeSponsorships: number;
  completedSponsorships: number;
  utilizationCompleted: number;
  bySport: { name: string; amountPaise: number }[];
  byLocation: { name: string; amountPaise: number }[];
};

export default async function SponsorDashboardPage() {
  const [me, dashRes] = await Promise.all([
    getMe(),
    apiServer<{ data: Dashboard }>("/api/sponsors/me/dashboard"),
  ]);
  const d = dashRes?.data;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Welcome, {me?.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Discover athletes and track the impact of your support.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild>
            <Link href="/athletes">Find athletes</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/dashboard/sponsor/profile">Edit profile</Link>
          </Button>
        </div>
      </div>

      {d ? (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile label="Total sponsored" value={formatPaise(d.totalSponsoredPaise)} />
            <StatTile label="Athletes supported" value={String(d.athletesSupported)} />
            <StatTile label="Active sponsorships" value={String(d.activeSponsorships)} />
            <StatTile label="Completed" value={String(d.completedSponsorships)} />
          </div>

          {d.totalSponsoredPaise > 0 ? (
            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Sports supported</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="grid gap-2 text-sm">
                    {d.bySport.map((row) => (
                      <li key={row.name} className="flex justify-between">
                        <span>{row.name}</span>
                        <span className="font-medium">{formatPaise(row.amountPaise)}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Location impact</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="grid gap-2 text-sm">
                    {d.byLocation.map((row) => (
                      <li key={row.name} className="flex justify-between">
                        <span>{row.name}</span>
                        <span className="font-medium">{formatPaise(row.amountPaise)}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </div>
          ) : (
            <div className="mt-6 rounded-lg border border-dashed p-12 text-center">
              <p className="text-muted-foreground">
                You haven&apos;t sponsored anyone yet. Find an athlete whose journey you want to be
                part of.
              </p>
              <Button asChild className="mt-4">
                <Link href="/athletes">Browse athletes</Link>
              </Button>
            </div>
          )}

          <div className="mt-6">
            <Button asChild variant="outline">
              <Link href="/dashboard/sponsor/sponsorships">View all sponsorships →</Link>
            </Button>
          </div>
        </>
      ) : (
        <p className="mt-6 text-muted-foreground">Could not load dashboard.</p>
      )}
    </div>
  );
}
