import type { Metadata } from "next";
import Link from "next/link";
import { apiServer } from "@/lib/api-server";
import { StatTile } from "@/components/stat-tile";
import { OrphanQueue, type OrphanRequest } from "./orphan-queue";

export const metadata: Metadata = { title: "Uncovered requests" };

type VillageAwaiting = {
  id: string;
  name: string;
  displayPath: string | null;
  _count: { requests: number; athleteProfiles: number };
};

type Response = {
  data: { pending: OrphanRequest[] };
  meta: { villagesAwaiting: VillageAwaiting[]; pendingCount: number };
};

export default async function AdminRequestsPage() {
  const res = await apiServer<Response>("/api/admin/requests/orphaned");

  if (!res) {
    return (
      <div className="mx-auto w-full max-w-3xl px-6 py-16">
        <h1 className="text-2xl font-bold tracking-tight">Could not load the queue</h1>
        <p className="mt-4 leading-relaxed text-muted-foreground">
          The API did not respond. Nothing has been changed.
        </p>
      </div>
    );
  }

  const { pending } = res.data;
  const { villagesAwaiting } = res.meta;

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-12">
      <p className="eyebrow text-muted-foreground">Safety net</p>
      <h1 className="mt-3 text-2xl font-bold tracking-tight">
        {pending.length > 0
          ? `${pending.length} request${pending.length === 1 ? "" : "s"} nobody can approve.`
          : "Every pending request has a coordinator."}
      </h1>
      <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        These are in villages with no active coordinator, so no one holds the authority to
        validate them. The athlete is being told to wait for someone who does not exist.
        You can open them centrally — but the real fix is appointing a coordinator, which
        is why the villages are listed below.
      </p>

      <div className="mt-10 grid gap-4 sm:grid-cols-3">
        <StatTile label="Stuck requests" value={String(pending.length)} />
        <StatTile label="Villages with no coordinator" value={String(villagesAwaiting.length)} />
        <StatTile
          label="Athletes affected"
          value={String(
            villagesAwaiting.reduce((n, v) => n + v._count.athleteProfiles, 0),
          )}
          hint="Across those villages"
        />
      </div>

      {villagesAwaiting.length > 0 ? (
        <>
          <div className="mt-14 flex flex-wrap items-end justify-between gap-3">
            <h2 className="text-lg font-semibold">Villages needing a coordinator</h2>
            <Link
              href="/admin/coordinators"
              className="text-sm font-medium text-marigold hover:underline"
            >
              Appoint someone &rarr;
            </Link>
          </div>
          <ul className="mt-4 divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            {villagesAwaiting.map((v) => (
              <li
                key={v.id}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{v.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {v.displayPath}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-muted-foreground" data-numeric>
                  {v._count.athleteProfiles} athlete
                  {v._count.athleteProfiles === 1 ? "" : "s"} &middot; {v._count.requests}{" "}
                  request{v._count.requests === 1 ? "" : "s"}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <h2 className="mt-16 text-lg font-semibold">Waiting on you</h2>
      <div className="mt-4">
        <OrphanQueue pending={pending} />
      </div>
    </div>
  );
}
