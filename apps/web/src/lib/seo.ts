/**
 * One source of truth for everything crawler-facing: canonical origin, whether this
 * deployment may be indexed at all, and the rule for which athlete profiles are allowed
 * into search results.
 *
 * Imported by robots.ts, sitemap.ts, the root layout and the athlete pages — so the
 * staging deployment cannot end up half-indexed because one file disagreed with another.
 */

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://khelkhud.org").replace(
  /\/$/,
  "",
);

/**
 * Whether THIS deployment may appear in search results at all.
 *
 * False on khelo.kautilya.app. That host is a working home while khelkhud.org is being
 * purchased, and letting it get indexed first would mean duplicate content, split link
 * equity, and a kautilya.app URL outranking khelkhud.org for "khelkhud" on launch day.
 * Set NEXT_PUBLIC_INDEXABLE=true at build time on the real domain.
 */
export const INDEXABLE = process.env.NEXT_PUBLIC_INDEXABLE !== "false";

export const BRAND = {
  name: "khelkhud",
  tagline: "Talent is everywhere. Support isn't.",
  description:
    "khelkhud connects athletes across Telangana to sponsors who fund one specific thing they need — kit, coaching, entry fees, travel — and shows exactly where every rupee went, with receipts.",
} as const;

/** Routes no crawler should ever walk: private, authenticated, or pure machinery. */
export const DISALLOWED_PATHS = [
  "/api/",
  "/admin",
  "/dashboard",
  "/onboarding",
  "/login",
  "/sponsor/", // the checkout flow — a transactional route, not a landing page
] as const;

/**
 * Age categories that identify a minor.
 *
 * This drives an indexing decision, not a display one. See `isIndexableAthlete`.
 */
const MINOR_CATEGORIES = new Set(["UNDER_12", "UNDER_15", "UNDER_19"]);

/**
 * Whether an individual athlete profile may be indexed by search and answer engines.
 *
 * DEFAULT: no, for anyone under 18.
 *
 * This is a safeguarding decision rather than an SEO one. An indexed profile pairs a
 * child's full name and photograph with their district, their sport, their training
 * schedule and a public statement that they need money — a combination that is useful to
 * exactly the wrong people, and that persists in search caches and answer-engine training
 * data long after the profile is taken down. The platform's own value (a verified human
 * checks every profile) does not extend to whoever reads the search result.
 *
 * Adults are indexed when verified: a senior athlete seeking sponsorship benefits from
 * being findable, and consented to a public profile.
 *
 * Minors are still fully visible ON the site to signed-in and signed-out visitors — this
 * only governs crawlers. If you later add explicit parental consent for search visibility,
 * that consent belongs here as a per-athlete field, not as a blanket flag.
 */
export function isIndexableAthlete(athlete: {
  category?: string | null;
  age?: number | null;
  verificationStatus?: string | null;
}): boolean {
  if (athlete.verificationStatus !== "VERIFIED") return false;
  if (athlete.category && MINOR_CATEGORIES.has(athlete.category)) return false;
  if (typeof athlete.age === "number" && athlete.age < 18) return false;
  // No category and no age means we cannot show they are an adult. Fail closed.
  if (!athlete.category && typeof athlete.age !== "number") return false;
  return true;
}

export function absoluteUrl(path: string): string {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
