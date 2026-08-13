import Link from "next/link";
import { formatPaise } from "@khelkhud/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiServer } from "@/lib/api-server";

export const metadata = { title: "Admin" };

type Stats = {
  totalAthletes: number;
  verifiedAthletes: number;
  totalSponsors: number;
  verifiedSponsors: number;
  totalSponsorships: number;
  activeSponsorships: number;
  completedSponsorships: number;
  totalSponsoredPaise: number;
  pendingVerifications: number;
  bySport: { name: string; amountPaise: number }[];
  byLocation: { name: string; amountPaise: number }[];
};

export default async function AdminPage() {
  const res = await apiServer<{ data: Stats }>("/api/admin/stats");
  if (!res) return <p className="text-muted-foreground">Could not load stats.</p>;
  const s = res.data;

  const tiles = [
    { label: "Total sponsored", value: formatPaise(s.totalSponsoredPaise) },
    { label: "Athletes", value: `${s.totalAthletes} (${s.verifiedAthletes} verified)` },
    { label: "Sponsors", value: `${s.totalSponsors} (${s.verifiedSponsors} verified)` },
    { label: "Sponsorships", value: String(s.totalSponsorships) },
    { label: "Active", value: String(s.activeSponsorships) },
    { label: "Completed", value: String(s.completedSponsorships) },
  ];

  return (
    <div className="grid gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Platform overview</h1>
        {s.pendingVerifications > 0 ? (
          <Link href="/admin/verifications" className="text-sm font-medium text-primary underline">
            {s.pendingVerifications} verification{s.pendingVerifications === 1 ? "" : "s"} pending →
          </Link>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((t) => (
          <Card key={t.label}>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">{t.label}</p>
              <p className="mt-1 text-2xl font-bold">{t.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sponsored by sport</CardTitle>
          </CardHeader>
          <CardContent>
            {s.bySport.length === 0 ? (
              <p className="text-sm text-muted-foreground">No paid sponsorships yet.</p>
            ) : (
              <ul className="grid gap-2 text-sm">
                {s.bySport.map((row) => (
                  <li key={row.name} className="flex justify-between">
                    <span>{row.name}</span>
                    <span className="font-medium">{formatPaise(row.amountPaise)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sponsored by location</CardTitle>
          </CardHeader>
          <CardContent>
            {s.byLocation.length === 0 ? (
              <p className="text-sm text-muted-foreground">No paid sponsorships yet.</p>
            ) : (
              <ul className="grid gap-2 text-sm">
                {s.byLocation.map((row) => (
                  <li key={row.name} className="flex justify-between">
                    <span>{row.name}</span>
                    <span className="font-medium">{formatPaise(row.amountPaise)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
