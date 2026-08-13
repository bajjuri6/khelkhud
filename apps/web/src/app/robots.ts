import type { MetadataRoute } from "next";
import { DISALLOWED_PATHS, INDEXABLE, SITE_URL } from "@/lib/seo";

/**
 * robots.txt.
 *
 * Two states, driven by the same flag as the meta tag in the root layout — a robots.txt
 * saying `Allow: /` while every page carries `noindex` is a contradiction crawlers resolve
 * unpredictably, so both read from `INDEXABLE`.
 *
 * When indexable, private surfaces are still excluded. `Disallow` is not a security
 * control (the API enforces authorisation), it just keeps authenticated routes and the
 * checkout flow out of the index, where they would only ever produce useless results.
 */
export default function robots(): MetadataRoute.Robots {
  if (!INDEXABLE) {
    return { rules: [{ userAgent: "*", disallow: "/" }] };
  }

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [...DISALLOWED_PATHS],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
