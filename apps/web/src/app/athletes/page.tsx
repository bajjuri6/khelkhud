import { apiServer } from "@/lib/api-server";
import { AthleteCard, type AthleteCardData } from "@/components/athlete-card";
import { FUNDING_BUCKETS } from "@/lib/funding";
import type { Location, Sport } from "@/lib/types";
import { DiscoveryFilters } from "./discovery-filters";
import { DiscoveryPagination } from "./discovery-pagination";

export const metadata = { title: "Find Athletes" };

type SearchParams = {
  q?: string;
  sportId?: string;
  locationId?: string;
  category?: string;
  funding?: string;
  includeUnverified?: string;
  page?: string;
};

export default async function AthletesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();
  if (params.q) query.set("q", params.q);
  if (params.sportId) query.set("sportId", params.sportId);
  if (params.locationId) query.set("locationId", params.locationId);
  if (params.category) query.set("category", params.category);
  if (params.includeUnverified === "true") query.set("verifiedOnly", "false");
  if (params.page) query.set("page", params.page);
  const bucket = params.funding ? FUNDING_BUCKETS[params.funding] : undefined;
  if (bucket?.min !== undefined) query.set("minPaise", String(bucket.min));
  if (bucket?.max !== undefined) query.set("maxPaise", String(bucket.max));

  const [playersRes, sportsRes, locationsRes] = await Promise.all([
    apiServer<{ data: AthleteCardData[]; meta: { total: number; page: number; pageSize: number } }>(
      `/api/players?${query.toString()}`,
    ),
    apiServer<{ data: Sport[] }>("/api/meta/sports"),
    apiServer<{ data: Location[] }>("/api/meta/locations"),
  ]);

  const athletes = playersRes?.data ?? [];
  const meta = playersRes?.meta ?? { total: 0, page: 1, pageSize: 12 };
  const totalPages = Math.max(1, Math.ceil(meta.total / meta.pageSize));

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <h1 className="text-2xl font-bold tracking-tight">Find Athletes</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {meta.total} athlete{meta.total === 1 ? "" : "s"} looking for support
      </p>
      <div className="mt-6 grid gap-8 lg:grid-cols-[260px_1fr]">
        <DiscoveryFilters
          sports={sportsRes?.data ?? []}
          locations={locationsRes?.data ?? []}
          fundingBuckets={Object.entries(FUNDING_BUCKETS).map(([value, b]) => ({
            value,
            label: b.label,
          }))}
        />
        <div>
          {athletes.length === 0 ? (
            <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
              No athletes match these filters yet. Try broadening your search.
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {athletes.map((a) => (
                <AthleteCard key={a.id} athlete={a} />
              ))}
            </div>
          )}
          {totalPages > 1 ? (
            <div className="mt-6">
              <DiscoveryPagination page={meta.page} totalPages={totalPages} />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
