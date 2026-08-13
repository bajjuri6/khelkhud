import type { Metadata } from "next";
import { Card, CardContent } from "@/components/ui/card";
import { apiServer } from "@/lib/api-server";
import { CoordinatorsManager, type Coordinator } from "./coordinators-manager";

export const metadata: Metadata = { title: "Coordinators" };

export default async function AdminCoordinatorsPage() {
  const res = await apiServer<{ data: Coordinator[] }>("/api/admin/coordinators");
  if (!res) return <p className="text-muted-foreground">Could not load coordinators.</p>;

  const coordinators = res.data;
  const active = coordinators.filter((c) => c.isActive);
  // Counted over active coordinators only: a village whose only coordinator is deactivated
  // is not covered, and showing it as covered would hide exactly the gap worth seeing.
  const villagesCovered = new Set(active.flatMap((c) => c.villages.map((v) => v.id))).size;
  const validated = coordinators.reduce((n, c) => n + c._count.requestsValidated, 0);

  const tiles = [
    { label: "Active coordinators", value: String(active.length) },
    { label: "Villages covered", value: String(villagesCovered) },
    { label: "Requests validated", value: String(validated) },
  ];

  return (
    <div className="grid gap-6">
      <div>
        <p className="eyebrow text-muted-foreground">Delegation of trust</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Village coordinators</h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          A coordinator is a PET teacher, a sarpanch — someone visible and accountable in
          their village. Appointing one hands them verification: requests they raise go live
          the moment they save them, and requests raised by athletes in their villages come
          to them rather than to the admin queue. This is what replaces centralised review,
          which cannot scale to thousands of villages and cannot tell whether a claimed
          district medal is real. Every action is recorded against their name, and yours.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {tiles.map((t) => (
          <Card key={t.label}>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">{t.label}</p>
              <p className="mt-1 text-2xl font-bold" data-numeric>
                {t.value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <CoordinatorsManager coordinators={coordinators} />
    </div>
  );
}
