import type { MetadataRoute } from "next";
import { INDEXABLE, SITE_URL, isIndexableAthlete } from "@/lib/seo";
import { apiServer } from "@/lib/api-server";

type SitemapItem = { slug: string; updatedAt?: string | null };

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
    { url: `${SITE_URL}/equipment`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
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

  // The catalogue is the one part of khelkhud with no safeguarding tension at all: it
  // describes objects, not children. "What does a kabaddi mat cost in India" is a real
  // question with almost no honest answer online, which makes these the pages most worth
  // being findable.
  const catalogueRes = await apiServer<{ data: SitemapItem[] }>("/api/catalogue?pageSize=50");
  const catalogueEntries: MetadataRoute.Sitemap = (catalogueRes?.data ?? []).map((i) => ({
    url: `${SITE_URL}/equipment/${i.slug}`,
    lastModified: i.updatedAt ? new Date(i.updatedAt) : now,
    changeFrequency: "monthly" as const,
    priority: 0.6,
  }));

  return [...staticEntries, ...athleteEntries, ...catalogueEntries];
}
