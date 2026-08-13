import type { MetadataRoute } from "next";
import { INDEXABLE, SITE_URL, isIndexableAthlete } from "@/lib/seo";
import { apiServer } from "@/lib/api-server";

type SitemapAthlete = {
  id: string;
  category: string | null;
  verificationStatus: string;
  updatedAt?: string | null;
};

/**
 * sitemap.xml.
 *
 * Static marketing routes plus the athlete profiles that are allowed to be indexed —
 * verified adults only. `isIndexableAthlete` is the same predicate the athlete page's
 * generateMetadata uses, so a profile can never be listed here while serving `noindex`.
 *
 * Degrades to the static entries if the API is unreachable: a sitemap missing some rows is
 * a minor loss, a 500 on /sitemap.xml teaches crawlers the file is broken.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // An unindexable deployment advertising a sitemap is just noise. robots.txt already
  // disallows everything here.
  if (!INDEXABLE) return [];

  const now = new Date();

  const staticEntries: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/athletes`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
  ];

  // pageSize is capped deliberately. Sitemaps allow 50k URLs, but this list is only ever
  // adult verified athletes; if it ever approaches the cap, paginate rather than raising it.
  const res = await apiServer<{ data: SitemapAthlete[] }>(
    "/api/athletes?pageSize=1000&verifiedOnly=true",
  );
  const athletes = res?.data ?? [];

  const athleteEntries: MetadataRoute.Sitemap = athletes
    .filter((a) => isIndexableAthlete(a))
    .map((a) => ({
      url: `${SITE_URL}/athletes/${a.id}`,
      lastModified: a.updatedAt ? new Date(a.updatedAt) : now,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    }));

  return [...staticEntries, ...athleteEntries];
}
