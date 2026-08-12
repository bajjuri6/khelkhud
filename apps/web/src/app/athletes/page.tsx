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
    <div className="mx-auto w-full max-w-6xl px-6 py-14">
      <p className="eyebrow text-slate">Open requirements</p>
      <h1 className="mt-3 max-w-[20ch] text-h1 font-semibold">
        Every one of these is stuck on one specific thing.
      </h1>
      <p className="mt-4 max-w-xl leading-relaxed text-slate" data-numeric>
        {meta.total} athlete{meta.total === 1 ? "" : "s"} looking for support. Filter by
        sport, district or the size of the gap &mdash; then read what they actually need.
      </p>
      <div className="mt-12 grid gap-10 lg:grid-cols-[260px_1fr]">
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
            <div className="rounded-xl border border-dashed border-border bg-cream-2/60 p-14 text-center">
              <p className="font-display text-h3">Nobody matches that yet.</p>
              <p className="mt-2 text-sm text-slate">
                Try a wider district, or clear the funding filter.
              </p>
            </div>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
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
